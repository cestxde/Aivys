//! Splitting artist tag values into separate artists ("A feat. B", "A & B",
//! "A x B", "A / B", "A, B"), by library rules kept in `.aivys/library.json`
//! (§8.1). The tags themselves are never changed.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

/// Separators offered by default. A word (letters, maybe a final dot) splits
/// only as a separate word; anything else wherever it appears. "х" is the
/// Cyrillic letter, which looks the same as "x" in Russian tags.
const DEFAULT_SPLIT_ON: [&str; 14] =
    ["feat.", "feat", "ft.", "ft", "featuring", "&", "/", ",", ";", "x", "х", "×", "vs.", "vs"];

/// Bump when the way artists are derived changes, so indexes derive them
/// again (the tags need not be read again).
const GROUPING_VERSION: u32 = 2;

/// Separators that introduce guests ("A feat. B"); the others join the
/// members of a group of artists ("A & B").
const FEATURING: [&str; 5] = ["feat.", "feat", "ft.", "ft", "featuring"];

/// Names that contain a separator but are one artist, offered by default.
/// "X & the Y" bands need no entry: "&" never splits before "the".
const DEFAULT_KEEP_WHOLE: [&str; 21] = [
    "AC/DC",
    "Simon & Garfunkel",
    "Earth, Wind & Fire",
    "Crosby, Stills & Nash",
    "Crosby, Stills, Nash & Young",
    "Hall & Oates",
    "Daryl Hall & John Oates",
    "Sam & Dave",
    "Brooks & Dunn",
    "Mumford & Sons",
    "Belle & Sebastian",
    "Iron & Wine",
    "Angus & Julia Stone",
    "Ike & Tina Turner",
    "Ashford & Simpson",
    "Chase & Status",
    "Above & Beyond",
    "Kruder & Dorfmeister",
    "Peaches & Herb",
    "Captain & Tennille",
    "Big & Rich",
];

/// How artist tags are split; `library.json` → `artists`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArtistRules {
    /// Off: every tag value is one artist.
    #[serde(default = "enabled_by_default")]
    pub(crate) enabled: bool,
    /// Separators, matched ignoring case.
    #[serde(default = "default_split_on")]
    pub(crate) split_on: Vec<String>,
    /// Names never split, matched ignoring case, also inside a longer value.
    #[serde(default = "default_keep_whole")]
    pub(crate) keep_whole: Vec<String>,
    /// Decide by the whole library: artists that never appear on their own
    /// stay together ("Joey Valence & Brae"), and only artists on at least
    /// `min_tracks` tracks (or with one of their own) are listed.
    #[serde(default = "enabled_by_default")]
    pub(crate) smart_grouping: bool,
    #[serde(default = "default_min_tracks")]
    pub(crate) min_tracks: u32,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

fn enabled_by_default() -> bool {
    true
}

fn default_min_tracks() -> u32 {
    2
}

fn default_split_on() -> Vec<String> {
    DEFAULT_SPLIT_ON.iter().map(|item| (*item).to_owned()).collect()
}

fn default_keep_whole() -> Vec<String> {
    DEFAULT_KEEP_WHOLE.iter().map(|name| (*name).to_owned()).collect()
}

impl Default for ArtistRules {
    fn default() -> Self {
        ArtistRules {
            enabled: true,
            split_on: default_split_on(),
            keep_whole: default_keep_whole(),
            smart_grouping: true,
            min_tracks: default_min_tracks(),
            extra: Map::new(),
        }
    }
}

impl ArtistRules {
    /// Trimmed, without empties and duplicates (ignoring case).
    pub(crate) fn normalized(mut self) -> Self {
        let clean = |list: Vec<String>| {
            let mut out: Vec<String> = Vec::new();
            for item in list {
                let item = item.trim();
                if !item.is_empty() && !out.iter().any(|known| known.to_lowercase() == item.to_lowercase()) {
                    out.push(item.to_owned());
                }
            }
            out
        };
        self.split_on = clean(self.split_on);
        self.keep_whole = clean(self.keep_whole);
        self.min_tracks = self.min_tracks.max(1);
        self
    }

    /// Changes whenever the result of splitting can change: with the rules,
    /// or with how they are applied ([`GROUPING_VERSION`]).
    pub(crate) fn fingerprint(&self) -> String {
        format!(
            "{GROUPING_VERSION}|{}|{:?}|{:?}|{}|{}",
            self.enabled, self.split_on, self.keep_whole, self.smart_grouping, self.min_tracks
        )
    }
}

fn lower_char(c: char) -> char {
    c.to_lowercase().next().unwrap_or(c)
}

fn chars_lower(text: &str) -> Vec<char> {
    text.chars().map(lower_char).collect()
}

fn same_name(a: &str, b: &str) -> bool {
    a.to_lowercase() == b.to_lowercase()
}

/// The rules prepared for matching: everything as lowercase chars.
pub(crate) struct Splitter {
    enabled: bool,
    keep_whole: Vec<Vec<char>>,
    /// Matched as separate words ("feat.", "x"); true for those that
    /// introduce guests.
    words: Vec<(Vec<char>, bool)>,
    /// Matched anywhere ("&", "/").
    symbols: Vec<Vec<char>>,
}

impl Splitter {
    pub(crate) fn new(rules: &ArtistRules) -> Self {
        let mut words = Vec::new();
        let mut symbols = Vec::new();
        for separator in &rules.split_on {
            let separator = separator.trim();
            if separator.is_empty() {
                continue;
            }
            let word = separator.trim_end_matches('.');
            if !word.is_empty() && word.chars().all(char::is_alphanumeric) {
                let featuring = FEATURING.contains(&separator.to_lowercase().as_str());
                words.push((chars_lower(separator), featuring));
            } else {
                symbols.push(chars_lower(separator));
            }
        }
        // Longer first, so "feat." wins over "feat" and "vs." over "vs".
        words.sort_by_key(|(word, _)| std::cmp::Reverse(word.len()));
        symbols.sort_by_key(|symbol| std::cmp::Reverse(symbol.len()));
        Splitter {
            enabled: rules.enabled,
            keep_whole: rules
                .keep_whole
                .iter()
                .map(|name| chars_lower(name.trim()))
                .filter(|name| !name.is_empty())
                .collect(),
            words,
            symbols,
        }
    }

    /// Artist tag values as separate artists, duplicates dropped (ignoring
    /// case), without looking at the rest of the library.
    pub(crate) fn split(&self, values: &[String]) -> Vec<String> {
        let mut artists: Vec<String> = Vec::new();
        for segment in self.segments(values) {
            for part in segment.parts {
                if !artists.iter().any(|known| same_name(known, &part)) {
                    artists.push(part);
                }
            }
        }
        artists
    }

    /// The tag values cut into segments: the lead artists, then each group of
    /// guests after a "feat.". A value that is not split is one segment.
    pub(crate) fn segments(&self, values: &[String]) -> Vec<Segment> {
        let mut segments = Vec::new();
        for value in values {
            if self.enabled {
                self.split_value(value, &mut segments);
            } else if !value.trim().is_empty() {
                segments.push(Segment { whole: value.trim().to_owned(), parts: vec![value.trim().to_owned()], lead: true });
            }
        }
        segments
    }

    fn split_value(&self, value: &str, segments: &mut Vec<Segment>) {
        let chars: Vec<char> = value.chars().collect();
        let lowered: Vec<char> = chars.iter().map(|&c| lower_char(c)).collect();
        // A bracket opened right before a separator ("A (feat. B)") is cut off
        // the text before it, and its partner off the text where it closes.
        // Brackets that are part of a name ("Дайте танк (!)") stay.
        let mut open_bracket: Option<char> = None;
        let cut = |text: &[char], open: &mut Option<char>| -> String {
            let text: String = text.iter().collect();
            if let Some(bracket) = *open {
                let close = if bracket == '(' { ')' } else { ']' };
                let trimmed = text.trim_end();
                let count = |c: char| trimmed.chars().filter(|&x| x == c).count();
                if trimmed.ends_with(close) && count(close) > count(bracket) {
                    *open = None;
                    return trimmed[..trimmed.len() - close.len_utf8()].trim().to_owned();
                }
            }
            text.trim().to_owned()
        };
        let mut segment = Segment { whole: String::new(), parts: Vec::new(), lead: true };
        let mut segment_start = 0;
        let mut start = 0;
        let mut index = 0;
        let finish = |segment: &mut Segment, whole: String, segments: &mut Vec<Segment>| {
            if !segment.parts.is_empty() {
                segment.whole = whole;
                segments.push(std::mem::replace(segment, Segment { whole: String::new(), parts: Vec::new(), lead: false }));
            }
            segment.lead = false;
        };
        while index < chars.len() {
            // A whole name is skipped over, separators and all.
            if let Some(len) = self.whole_at(&lowered, index) {
                index += len;
                continue;
            }
            let Some((len, featuring)) = self.separator_at(&lowered, index) else {
                index += 1;
                continue;
            };
            let mut end = index;
            if index > 0 && matches!(chars[index - 1], '(' | '[') && open_bracket.is_none() {
                open_bracket = Some(chars[index - 1]);
                end -= 1;
            }
            let before_open = open_bracket;
            let part = cut(&chars[start..end], &mut open_bracket);
            if !part.is_empty() {
                segment.parts.push(part);
            }
            if featuring {
                let mut open = before_open;
                let whole = cut(&chars[segment_start..end], &mut open);
                finish(&mut segment, whole, segments);
                segment_start = index + len;
            }
            index += len;
            start = index;
        }
        let before_open = open_bracket;
        let part = cut(&chars[start..], &mut open_bracket);
        if !part.is_empty() {
            segment.parts.push(part);
        }
        let mut open = before_open;
        let whole = cut(&chars[segment_start..], &mut open);
        finish(&mut segment, whole, segments);
    }

    /// Length of a keep-whole name at `at`, if it starts and ends a word there.
    fn whole_at(&self, text: &[char], at: usize) -> Option<usize> {
        if at > 0 && text[at - 1].is_alphanumeric() {
            return None;
        }
        self.keep_whole
            .iter()
            .filter(|name| matches_at(text, at, name))
            .filter(|name| text.get(at + name.len()).map_or(true, |next| !next.is_alphanumeric()))
            .map(Vec::len)
            .max()
    }

    /// A separator at `at`, if one starts there: its length (for a word, with
    /// the space after it) and whether it introduces guests.
    fn separator_at(&self, text: &[char], at: usize) -> Option<(usize, bool)> {
        for symbol in &self.symbols {
            if matches_at(text, at, symbol) {
                // "Kool & the Gang"
                if symbol.as_slice() == ['&'] {
                    let mut next = at + 1;
                    while text.get(next) == Some(&' ') {
                        next += 1;
                    }
                    if matches_at(text, next, &['t', 'h', 'e', ' ']) {
                        continue;
                    }
                }
                return Some((symbol.len(), false));
            }
        }
        // A word stands after a space or an opening bracket, before a space.
        if at == 0 || !matches!(text[at - 1], ' ' | '(' | '[') {
            return None;
        }
        self.words
            .iter()
            .find(|(word, _)| matches_at(text, at, word) && text.get(at + word.len()) == Some(&' '))
            .map(|(word, featuring)| (word.len() + 1, *featuring))
    }
}

/// Part of an artist tag: the lead artists, or a group of guests after
/// "feat.". `parts` are its artists; `whole` is its text, used when they stay
/// together.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Segment {
    pub(crate) whole: String,
    pub(crate) parts: Vec<String>,
    pub(crate) lead: bool,
}

/// A track's artists after looking at the whole library.
#[derive(Debug, Default, PartialEq)]
pub(crate) struct Credits {
    pub(crate) artists: Vec<String>,
    /// Those without a place in the artist list: met on too few tracks and
    /// never on their own. Their pages still open from the track.
    pub(crate) unlisted: Vec<String>,
}

#[derive(Default)]
struct Seen {
    /// Alone as the lead artist of a track.
    solo: bool,
    /// Alone in some segment (also as the only guest).
    alone: bool,
    /// Segments it was met in, by text.
    contexts: HashSet<String>,
    tracks: HashSet<usize>,
}

/// A track's segments without values that only repeat an artist of another
/// one: tags often hold the full credit and then each artist separately
/// ("A & B feat. C", "A", "B", "C"), which must not count as solo tracks.
fn without_repeats(segments: &[Segment]) -> Vec<&Segment> {
    segments
        .iter()
        .enumerate()
        .filter(|(index, segment)| {
            let [part] = segment.parts.as_slice() else { return true };
            !segments.iter().enumerate().any(|(other_index, other)| {
                other_index != *index
                    // An earlier copy of the same value keeps its place.
                    && (other.parts.len() > 1 || !other.lead || other_index < *index)
                    && other.parts.iter().any(|known| same_name(known, part))
            })
        })
        .map(|(_, segment)| segment)
        .collect()
}

/// Decide every track's artists from its segments, by the whole library.
///
/// An artist stands on its own when it has a solo track, or is on at least
/// `min_tracks` tracks while being met alone somewhere or in more than one
/// group. A group none of whose members stands on its own stays one artist
/// ("Joey Valence & Brae"); otherwise it is split. An artist is listed when it
/// leads some track or is on at least `min_tracks` tracks.
pub(crate) fn credit_library(tracks: &[Vec<Segment>], rules: &ArtistRules) -> Vec<Credits> {
    let key = |name: &str| name.to_lowercase();
    if !rules.smart_grouping {
        return tracks
            .iter()
            .map(|segments| {
                let mut artists: Vec<String> = Vec::new();
                for part in segments.iter().flat_map(|segment| &segment.parts) {
                    if !artists.iter().any(|known| same_name(known, part)) {
                        artists.push(part.clone());
                    }
                }
                Credits { artists, unlisted: Vec::new() }
            })
            .collect();
    }
    let min_tracks = rules.min_tracks.max(1) as usize;
    let tracks: Vec<Vec<&Segment>> = tracks.iter().map(|segments| without_repeats(segments)).collect();

    let mut seen: HashMap<String, Seen> = HashMap::new();
    for (track, segments) in tracks.iter().enumerate() {
        for segment in segments {
            for part in &segment.parts {
                let entry = seen.entry(key(part)).or_default();
                entry.solo |= segment.lead && segment.parts.len() == 1;
                entry.alone |= segment.parts.len() == 1;
                entry.contexts.insert(key(&segment.whole));
                entry.tracks.insert(track);
            }
        }
    }
    let independent = |name: &str| {
        seen.get(&key(name)).is_some_and(|entry| {
            entry.solo || (entry.tracks.len() >= min_tracks && (entry.alone || entry.contexts.len() > 1))
        })
    };

    // (name, leads the track) per track.
    let credited: Vec<Vec<(String, bool)>> = tracks
        .iter()
        .map(|segments| {
            let mut artists: Vec<(String, bool)> = Vec::new();
            let mut add = |name: &str, lead: bool| match artists.iter_mut().find(|(known, _)| same_name(known, name)) {
                Some(known) => known.1 |= lead,
                None => artists.push((name.to_owned(), lead)),
            };
            for segment in segments {
                if segment.parts.len() > 1 && !segment.parts.iter().any(|part| independent(part)) {
                    add(&segment.whole, segment.lead);
                } else {
                    for part in &segment.parts {
                        add(part, segment.lead && segment.parts.len() == 1);
                    }
                }
            }
            artists
        })
        .collect();

    let mut leads: HashSet<String> = HashSet::new();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for artists in &credited {
        for (name, lead) in artists {
            if *lead {
                leads.insert(key(name));
            }
            *counts.entry(key(name)).or_default() += 1;
        }
    }
    let listed = |name: &str| leads.contains(&key(name)) || counts.get(&key(name)).copied().unwrap_or(0) >= min_tracks;

    credited
        .into_iter()
        .map(|artists| Credits {
            unlisted: artists.iter().filter(|(name, _)| !listed(name)).map(|(name, _)| name.clone()).collect(),
            artists: artists.into_iter().map(|(name, _)| name).collect(),
        })
        .collect()
}

fn matches_at(text: &[char], at: usize, pattern: &[char]) -> bool {
    text.get(at..at + pattern.len()) == Some(pattern)
}

/// The artist line to show for a track: its tag values, without values that
/// repeat names of an earlier one ("1tbsp & Mietze Conte", "1tbsp").
pub(crate) fn display_line(values: &[String]) -> String {
    let mut shown: Vec<&str> = Vec::new();
    for value in values {
        let value = value.trim();
        let lower = value.to_lowercase();
        let repeated = shown.iter().any(|earlier| contains_word(&earlier.to_lowercase(), &lower));
        if !value.is_empty() && !repeated {
            shown.push(value);
        }
    }
    shown.join(", ")
}

/// Whether `part` occurs in `text` as whole words.
fn contains_word(text: &str, part: &str) -> bool {
    text.match_indices(part).any(|(at, _)| {
        let before = text[..at].chars().next_back();
        let after = text[at + part.len()..].chars().next();
        before.map_or(true, |c| !c.is_alphanumeric()) && after.map_or(true, |c| !c.is_alphanumeric())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn split_with(rules: &ArtistRules, values: &[&str]) -> Vec<String> {
        let values: Vec<String> = values.iter().map(|value| (*value).to_owned()).collect();
        Splitter::new(rules).split(&values)
    }

    fn split(values: &[&str]) -> Vec<String> {
        split_with(&ArtistRules::default(), values)
    }

    fn owned(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn featured_artists_are_separate() {
        assert_eq!(split(&["A feat. B"]), ["A", "B"]);
        assert_eq!(split(&["A ft. B & C"]), ["A", "B", "C"]);
        assert_eq!(split(&["A (feat. B, C)"]), ["A", "B", "C"]);
        assert_eq!(split(&["A [Featuring B]"]), ["A", "B"]);
        assert_eq!(split(&["Кино feat. Земфира"]), ["Кино", "Земфира"]);
    }

    #[test]
    fn lists_are_split() {
        assert_eq!(split(&["$uicideboy$ x Ramirez"]), ["$uicideboy$", "Ramirez"]);
        assert_eq!(split(&["$uicideboy$ & Germ"]), ["$uicideboy$", "Germ"]);
        assert_eq!(split(&["1tbsp & Mietze Conte", "1tbsp", "Mietze Conte"]), ["1tbsp", "Mietze Conte"]);
        assert_eq!(split(&["Баста / GUF"]), ["Баста", "GUF"]);
        assert_eq!(split(&["A&B", "C/D"]), ["A", "B", "C", "D"]);
        assert_eq!(split(&["A X B", "C × D"]), ["A", "B", "C", "D"]);
        // Cyrillic "х", small and capital.
        assert_eq!(split(&["Тайпан х Agunda", "Баста Х Смоки Мо"]), ["Тайпан", "Agunda", "Баста", "Смоки Мо"]);
        assert_eq!(split(&["A, B; C"]), ["A", "B", "C"]);
        assert_eq!(split(&["A vs. B", "C vs D"]), ["A", "B", "C", "D"]);
        assert_eq!(split(&["A & B feat. C x D"]), ["A", "B", "C", "D"]);
    }

    #[test]
    fn names_with_punctuation_stay_intact() {
        assert_eq!(split(&["Дайте танк (!)"]), ["Дайте танк (!)"]);
        assert_eq!(split(&["Sunn O)))"]), ["Sunn O)))"]);
        assert_eq!(split(&["Panic! at the Disco"]), ["Panic! at the Disco"]);
        assert_eq!(split(&["Дайте танк (!) feat. A"]), ["Дайте танк (!)", "A"]);
        assert_eq!(split(&["A (feat. Дайте танк (!))"]), ["A", "Дайте танк (!)"]);
        assert_eq!(split(&["A (feat. B) & C"]), ["A", "B", "C"]);
        assert_eq!(split(&["Sunn O))) & A"]), ["Sunn O)))", "A"]);
    }

    #[test]
    fn bands_stay_whole() {
        assert_eq!(split(&["Simon & Garfunkel"]), ["Simon & Garfunkel"]);
        assert_eq!(split(&["earth, wind & fire"]), ["earth, wind & fire"]);
        assert_eq!(split(&["AC/DC"]), ["AC/DC"]);
        assert_eq!(split(&["Kool & the Gang", "Echo & The Bunnymen"]), ["Kool & the Gang", "Echo & The Bunnymen"]);
        assert_eq!(split(&["Simon & Garfunkel & A"]), ["Simon & Garfunkel", "A"]);
        assert_eq!(split(&["AC/DC feat. A"]), ["AC/DC", "A"]);
        assert_eq!(
            split(&["Lil Nas X", "X Ambassadors", "Craft Spells", "Featherweight"]),
            ["Lil Nas X", "X Ambassadors", "Craft Spells", "Featherweight"]
        );
    }

    #[test]
    fn library_rules_apply() {
        let rules = ArtistRules {
            split_on: owned(&["feat.", "and", "и", "+"]),
            keep_whole: owned(&["Tyler, The Creator"]),
            ..ArtistRules::default()
        };
        // Default separators that were removed no longer split.
        assert_eq!(split_with(&rules, &["Баста / GUF", "A & B"]), ["Баста / GUF", "A & B"]);
        assert_eq!(split_with(&rules, &["A and B", "C И D", "E+F"]), ["A", "B", "C", "D", "E", "F"]);
        assert_eq!(split_with(&rules, &["Andromeda", "Мир"]), ["Andromeda", "Мир"]);
        assert_eq!(split_with(&rules, &["Tyler, The Creator feat. A"]), ["Tyler, The Creator", "A"]);
    }

    #[test]
    fn splitting_can_be_off() {
        let rules = ArtistRules { enabled: false, ..ArtistRules::default() };
        assert_eq!(split_with(&rules, &["A feat. B", "a feat. b"]), ["A feat. B"]);
    }

    #[test]
    fn duplicates_are_dropped() {
        assert_eq!(split(&["A feat. B", "B", "a"]), ["A", "B"]);
        assert_eq!(split(&["Кино", "КИНО"]), ["Кино"]);
    }

    fn credit(library: &[&[&str]]) -> Vec<Credits> {
        let rules = ArtistRules::default();
        let splitter = Splitter::new(&rules);
        let tracks: Vec<Vec<Segment>> = library.iter().map(|values| splitter.segments(&owned(values))).collect();
        credit_library(&tracks, &rules)
    }

    fn artists_of(credits: &Credits) -> Vec<&str> {
        credits.artists.iter().map(String::as_str).collect()
    }

    #[test]
    fn segments_tell_leads_from_guests() {
        let splitter = Splitter::new(&ArtistRules::default());
        let segments = splitter.segments(&owned(&["A & B (feat. C x D)"]));
        assert_eq!(segments.len(), 2);
        assert_eq!((segments[0].whole.as_str(), segments[0].parts.len(), segments[0].lead), ("A & B", 2, true));
        assert_eq!((segments[1].whole.as_str(), segments[1].parts.len(), segments[1].lead), ("C x D", 2, false));
    }

    #[test]
    fn groups_never_met_apart_stay_together() {
        let credits = credit(&[&["Joey Valence & Brae"], &["Joey Valence & Brae"]]);
        assert_eq!(artists_of(&credits[0]), ["Joey Valence & Brae"]);
        assert!(credits[0].unlisted.is_empty());
    }

    #[test]
    fn groups_with_a_known_member_are_split() {
        let credits = credit(&[&["Баста"], &["Баста / GUF"]]);
        assert_eq!(artists_of(&credits[1]), ["Баста", "GUF"]);
        // GUF is on one track and never alone.
        assert_eq!(credits[1].unlisted, ["GUF"]);
    }

    #[test]
    fn a_one_off_guest_is_unlisted() {
        let credits = credit(&[&["A"], &["A"], &["A feat. B"]]);
        assert_eq!(artists_of(&credits[2]), ["A", "B"]);
        assert_eq!(credits[2].unlisted, ["B"]);
        // A second track makes B an artist of the list.
        let credits = credit(&[&["A feat. B"], &["C ft. B"]]);
        assert!(credits[0].unlisted.is_empty() && credits[1].unlisted.is_empty());
    }

    #[test]
    fn members_met_in_several_groups_are_split() {
        let credits = credit(&[&["A & B"], &["A & B"], &["A & C"]]);
        assert_eq!(artists_of(&credits[0]), ["A", "B"]);
        assert_eq!(artists_of(&credits[2]), ["A", "C"]);
        assert_eq!(credits[2].unlisted, ["C"]);
    }

    #[test]
    fn artists_listed_again_one_by_one_are_not_solo() {
        // How these tags are actually written: the full credit, then each artist.
        let credits = credit(&[
            &["Gorilla Glue & Lil Nakur", "Gorilla Glue", "Lil Nakur"],
            &["Gorilla Glue & Lil Nakur feat. FLOCKAA", "Gorilla Glue", "Lil Nakur", "FLOCKAA"],
            &["Gorilla Glue & Lil Nakur feat. Maladoy Prince", "Gorilla Glue", "Lil Nakur", "Maladoy Prince"],
        ]);
        assert_eq!(artists_of(&credits[0]), ["Gorilla Glue & Lil Nakur"]);
        assert_eq!(artists_of(&credits[1]), ["Gorilla Glue & Lil Nakur", "FLOCKAA"]);
        assert_eq!(credits[1].unlisted, ["FLOCKAA"]);

        let credits = credit(&[&["Gorillaz", "Gorillaz"], &["Gorillaz feat. Beck", "Gorillaz", "Beck"]]);
        assert_eq!(artists_of(&credits[1]), ["Gorillaz", "Beck"]);
        assert_eq!(credits[1].unlisted, ["Beck"]);
    }

    #[test]
    fn smart_grouping_can_be_off() {
        let rules = ArtistRules { smart_grouping: false, ..ArtistRules::default() };
        let splitter = Splitter::new(&rules);
        let tracks = vec![splitter.segments(&owned(&["Joey Valence & Brae"]))];
        assert_eq!(credit_library(&tracks, &rules)[0].artists, ["Joey Valence", "Brae"]);
    }

    #[test]
    fn display_line_skips_repeats() {
        assert_eq!(display_line(&owned(&["1tbsp & Mietze Conte", "1tbsp", "Mietze Conte"])), "1tbsp & Mietze Conte");
        assert_eq!(display_line(&owned(&["A", "B"])), "A, B");
        assert_eq!(display_line(&owned(&["Kanye West", "Westside Gunn"])), "Kanye West, Westside Gunn");
        assert_eq!(display_line(&owned(&[])), "");
    }

    #[test]
    fn rules_are_normalized() {
        let rules = ArtistRules {
            split_on: owned(&["&", " & ", "X", "x"]),
            keep_whole: owned(&[" A ", "a", ""]),
            ..ArtistRules::default()
        }
        .normalized();
        assert_eq!(rules.split_on, ["&", "X"]);
        assert_eq!(rules.keep_whole, ["A"]);
    }
}
