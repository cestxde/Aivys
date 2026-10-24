//! Splitting artist tag values into separate artists ("A feat. B", "A & B",
//! "A x B", "A / B", "A, B"), by library rules kept in `.aivys/library.json`
//! (§8.1). The tags themselves are never changed.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Separators offered by default. A word (letters, maybe a final dot) splits
/// only as a separate word; anything else wherever it appears. "х" is the
/// Cyrillic letter, which looks the same as "x" in Russian tags.
const DEFAULT_SPLIT_ON: [&str; 14] =
    ["feat.", "feat", "ft.", "ft", "featuring", "&", "/", ",", ";", "x", "х", "×", "vs.", "vs"];

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
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

fn enabled_by_default() -> bool {
    true
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
        self
    }

    /// Changes whenever the result of splitting can change.
    pub(crate) fn fingerprint(&self) -> String {
        format!("{}|{:?}|{:?}", self.enabled, self.split_on, self.keep_whole)
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
    /// Matched as separate words ("feat.", "x").
    words: Vec<Vec<char>>,
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
                words.push(chars_lower(separator));
            } else {
                symbols.push(chars_lower(separator));
            }
        }
        // Longer first, so "feat." wins over "feat" and "vs." over "vs".
        words.sort_by_key(|word| std::cmp::Reverse(word.len()));
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

    /// Artist tag values as separate artists, duplicates dropped (ignoring case).
    pub(crate) fn split(&self, values: &[String]) -> Vec<String> {
        let mut artists: Vec<String> = Vec::new();
        let mut push = |name: &str| {
            let name = name.trim();
            if !name.is_empty() && !artists.iter().any(|known| same_name(known, name)) {
                artists.push(name.to_owned());
            }
        };
        for value in values {
            if self.enabled {
                self.split_value(value, &mut push);
            } else {
                push(value);
            }
        }
        artists
    }

    fn split_value(&self, value: &str, push: &mut impl FnMut(&str)) {
        let chars: Vec<char> = value.chars().collect();
        let lowered: Vec<char> = chars.iter().map(|&c| lower_char(c)).collect();
        // A bracket opened right before a separator ("A (feat. B)") is cut off
        // the part before it, and its partner off the part where it closes.
        // Brackets that are part of a name ("Дайте танк (!)") stay.
        let mut open_bracket: Option<char> = None;
        let mut emit = |part: &[char], open: &mut Option<char>| {
            let mut part: String = part.iter().collect();
            if let Some(bracket) = *open {
                let close = if bracket == '(' { ')' } else { ']' };
                let trimmed = part.trim_end();
                let count = |c: char| trimmed.chars().filter(|&x| x == c).count();
                if trimmed.ends_with(close) && count(close) > count(bracket) {
                    part = trimmed[..trimmed.len() - close.len_utf8()].to_owned();
                    *open = None;
                }
            }
            push(&part);
        };
        let mut start = 0;
        let mut index = 0;
        while index < chars.len() {
            // A whole name is skipped over, separators and all.
            if let Some(len) = self.whole_at(&lowered, index) {
                index += len;
            } else if let Some(len) = self.separator_at(&lowered, index) {
                let mut end = index;
                if index > 0 && matches!(chars[index - 1], '(' | '[') && open_bracket.is_none() {
                    open_bracket = Some(chars[index - 1]);
                    end -= 1;
                }
                emit(&chars[start..end], &mut open_bracket);
                index += len;
                start = index;
            } else {
                index += 1;
            }
        }
        emit(&chars[start..], &mut open_bracket);
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

    /// Length of a separator at `at`, if one starts there (for a word, with
    /// the space after it).
    fn separator_at(&self, text: &[char], at: usize) -> Option<usize> {
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
                return Some(symbol.len());
            }
        }
        // A word stands after a space or an opening bracket, before a space.
        if at == 0 || !matches!(text[at - 1], ' ' | '(' | '[') {
            return None;
        }
        self.words
            .iter()
            .find(|word| matches_at(text, at, word) && text.get(at + word.len()) == Some(&' '))
            .map(|word| word.len() + 1)
    }
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
