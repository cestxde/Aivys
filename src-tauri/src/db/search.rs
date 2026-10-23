//! Track search over the `search` FTS5 table: words in any order, the last
//! word as a prefix (search-as-you-type), bm25 ranking with title > artist >
//! album. On top of that, three tolerance levels, tried in order:
//!
//! 1. `Exact` — the words as typed.
//! 2. `Translit` — loose Latin keys (`privet` finds «Привет», `kino` finds
//!    «Кино»), also for the query retyped in the other keyboard layout
//!    (`ghbdtn` finds «Привет»).
//! 3. `Fuzzy` — typos, by Damerau–Levenshtein distance against the Latin-key
//!    vocabulary (`linkn park`, `привт`).

use super::LibraryDb;
use crate::track::Track;
use rusqlite::{params, Transaction};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

// ---- Normalization ----

/// Lowercased words: runs of letters and digits.
fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// Russian (plus Ukrainian/Belarusian) letters in common transliteration.
/// The exact spelling matters little: [`latin_key`] collapses the variants.
fn cyrillic_to_latin(c: char) -> Option<&'static str> {
    Some(match c {
        'а' => "a",
        'б' => "b",
        'в' => "v",
        'г' | 'ґ' => "g",
        'д' => "d",
        'е' | 'ё' | 'э' | 'є' => "e",
        'ж' => "zh",
        'з' => "z",
        'и' | 'й' | 'і' => "i",
        'ї' => "yi",
        'к' => "k",
        'л' => "l",
        'м' => "m",
        'н' => "n",
        'о' => "o",
        'п' => "p",
        'р' => "r",
        'с' => "s",
        'т' => "t",
        'у' | 'ў' => "u",
        'ф' => "f",
        'х' => "kh",
        'ц' => "ts",
        'ч' => "ch",
        'ш' => "sh",
        'щ' => "shch",
        'ъ' | 'ь' => "",
        'ы' => "y",
        'ю' => "yu",
        'я' => "ya",
        _ => return None,
    })
}

/// Spelling variants that collapse to one form, longest first.
const LATIN_RULES: &[(&str, &str)] = &[
    ("shch", "s"),
    ("sch", "s"),
    ("sh", "s"),
    ("ch", "c"),
    ("zh", "z"),
    ("kh", "h"),
    ("ts", "c"),
    ("tz", "c"),
    ("ph", "f"),
    ("ck", "k"),
    ("x", "ks"),
    ("q", "k"),
    ("w", "v"),
    ("j", "i"),
    ("y", "i"),
];

fn is_vowel(c: char) -> bool {
    matches!(c, 'a' | 'e' | 'i' | 'o' | 'u')
}

/// A deliberately lossy Latin key of one lowercase word, equal for the usual
/// transliteration variants: «Привет», `privet`, `privyet` → `privet`;
/// «Цой», `tsoy`, `tsoi` → `coi`. Both the index and the query go through it.
pub(crate) fn latin_key(word: &str) -> String {
    let mut latin = String::new();
    for c in word.chars() {
        if let Some(mapped) = cyrillic_to_latin(c) {
            latin.push_str(mapped);
        } else if c.is_ascii_alphanumeric() {
            latin.push(c);
        } else if let Some(mapped) = deunicode::deunicode_char(c) {
            latin.extend(mapped.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_lowercase()));
        }
    }

    for (from, to) in LATIN_RULES {
        if latin.contains(from) {
            latin = latin.replace(from, to);
        }
    }

    // `ya`/`ia`, `yu`/`iu`, `ye`/`ie`: drop the glide before a vowel, then
    // collapse doubled letters.
    let chars: Vec<char> = latin.chars().collect();
    let mut key = String::with_capacity(chars.len());
    for (i, &c) in chars.iter().enumerate() {
        if c == 'i' && chars.get(i + 1).is_some_and(|&next| is_vowel(next) && next != 'i') {
            continue;
        }
        if key.ends_with(c) {
            continue;
        }
        key.push(c);
    }
    key
}

fn latin_text(text: &str) -> String {
    words(text)
        .iter()
        .map(|word| latin_key(word))
        .filter(|key| !key.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// QWERTY and ЙЦУКЕН keys at the same positions.
const LAYOUT_EN: &str = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const LAYOUT_RU: &str = "йцукенгшщзхъфывапролджэячсмитьбюё";

/// The query as if typed in the other keyboard layout, if it is entirely in
/// one of them: `ghbdtn` → `привет`, `руддщ` → `hello`.
fn swap_layout(query: &str) -> Option<String> {
    let query = query.to_lowercase();
    let has_latin = query.chars().any(|c| c.is_ascii_alphabetic());
    let has_cyrillic = query.chars().any(|c| LAYOUT_RU.contains(c));
    let (from, to) = match (has_latin, has_cyrillic) {
        (true, false) => (LAYOUT_EN, LAYOUT_RU),
        (false, true) => (LAYOUT_RU, LAYOUT_EN),
        _ => return None,
    };

    let swapped: String = query
        .chars()
        .map(|c| match from.chars().position(|key| key == c) {
            Some(index) => to.chars().nth(index).unwrap_or(c),
            None => c,
        })
        .collect();
    (swapped != query).then_some(swapped)
}

// ---- Indexing ----

/// (Re)write the search row of a track.
pub(super) fn index_track(tx: &Transaction, id: i64, track: &Track) -> rusqlite::Result<()> {
    // Files without a title tag are found by their file name.
    let title = track.title.clone().unwrap_or_else(|| {
        Path::new(&track.name)
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .unwrap_or_default()
    });
    let mut artist = track.artists.join(" ");
    if let Some(album_artist) = &track.album_artist {
        artist.push(' ');
        artist.push_str(album_artist);
    }
    let album = track.album.clone().unwrap_or_default();

    tx.execute("DELETE FROM search WHERE rowid = ?1", [id])?;
    tx.prepare_cached(
        "INSERT INTO search (rowid, title, artist, album, title_latin, artist_latin, album_latin)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?
    .execute(params![
        id,
        title,
        artist,
        album,
        latin_text(&title),
        latin_text(&artist),
        latin_text(&album),
    ])?;
    Ok(())
}

// ---- Typo correction ----

/// Distinct Latin-key terms of the library and in how many tracks each occurs.
pub(crate) struct Vocab {
    terms: Vec<(String, Vec<char>, i64)>,
}

/// Optimal string alignment distance (Damerau–Levenshtein where a swap of two
/// neighbours counts as one edit), or `None` if it exceeds `max`.
fn osa_distance(a: &[char], b: &[char], max: usize) -> Option<usize> {
    let (n, m) = (a.len(), b.len());
    if n.abs_diff(m) > max {
        return None;
    }
    let mut before_prev = vec![0; m + 1];
    let mut prev: Vec<usize> = (0..=m).collect();
    let mut cur = vec![0; m + 1];

    for i in 1..=n {
        cur[0] = i;
        let mut row_min = i;
        for j in 1..=m {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            let mut value = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                value = value.min(before_prev[j - 2] + 1);
            }
            cur[j] = value;
            row_min = row_min.min(value);
        }
        if row_min > max {
            return None;
        }
        std::mem::swap(&mut before_prev, &mut prev);
        std::mem::swap(&mut prev, &mut cur);
    }
    (prev[m] <= max).then_some(prev[m])
}

/// Allowed typos by word length: short words would match too much.
fn max_typos(len: usize) -> usize {
    match len {
        0..=3 => 0,
        4..=7 => 1,
        _ => 2,
    }
}

/// How many corrections of one word go into the query.
const MAX_CORRECTIONS: usize = 12;

impl Vocab {
    /// Vocabulary terms within the typo budget of `key`, closest and most
    /// common first. For a `prefix` word the start of each term is compared.
    fn corrections(&self, key: &str, prefix: bool) -> Vec<String> {
        let key: Vec<char> = key.chars().collect();
        let max = max_typos(key.len());
        if max == 0 {
            return Vec::new();
        }

        let mut found: Vec<(usize, i64, &str)> = self
            .terms
            .iter()
            .filter_map(|(term, chars, docs)| {
                let distance = if prefix && chars.len() > key.len() {
                    // The typed part may be one letter short or long.
                    (key.len().saturating_sub(1)..=key.len() + 1)
                        .filter(|&len| len <= chars.len())
                        .filter_map(|len| osa_distance(&key, &chars[..len], max))
                        .min()?
                } else {
                    osa_distance(&key, chars, max)?
                };
                // Distance 0 is already covered by the exact query.
                (distance > 0).then_some((distance, *docs, term.as_str()))
            })
            .collect();
        found.sort_by(|a, b| a.0.cmp(&b.0).then(b.1.cmp(&a.1)));
        found
            .into_iter()
            .take(MAX_CORRECTIONS)
            .map(|(_, _, term)| term.to_owned())
            .collect()
    }
}

// ---- Querying ----

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MatchKind {
    Exact,
    Translit,
    Fuzzy,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchHit {
    pub(crate) rel_path: String,
    /// How the track was found, so the UI can explain looser matches.
    pub(crate) kind: MatchKind,
}

const TEXT_COLUMNS: &str = "{title artist album}";
const LATIN_COLUMNS: &str = "{title_latin artist_latin album_latin}";

/// An FTS5 phrase for one word. Words are alphanumeric, but quote anyway.
fn phrase(word: &str, prefix: bool) -> String {
    format!("\"{}\"{}", word.replace('"', "\"\""), if prefix { "*" } else { "" })
}

/// All `words` must match (any column of `columns`); each word may be given
/// alternatives.
fn all_words(columns: &str, words: &[Vec<String>]) -> String {
    words
        .iter()
        .map(|alternatives| format!("{columns} : ({})", alternatives.join(" OR ")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

impl LibraryDb {
    fn with_vocab<R>(&self, f: impl FnOnce(&Vocab) -> R) -> rusqlite::Result<R> {
        let version: i64 = self.conn.pragma_query_value(None, "data_version", |row| row.get(0))?;
        let mut cache = self.vocab.borrow_mut();
        if cache.as_ref().map_or(true, |(cached, _)| *cached != version) {
            let mut stmt = self.conn.prepare(
                "SELECT term, SUM(doc) FROM search_vocab
                 WHERE col IN ('title_latin', 'artist_latin', 'album_latin')
                 GROUP BY term",
            )?;
            let terms = stmt
                .query_map([], |row| {
                    let term: String = row.get(0)?;
                    let chars = term.chars().collect();
                    Ok((term, chars, row.get(1)?))
                })?
                .collect::<rusqlite::Result<_>>()?;
            *cache = Some((version, Vocab { terms }));
        }
        Ok(f(&cache.as_ref().expect("vocabulary just loaded").1))
    }

    /// Forget the cached vocabulary after writing through this connection
    /// (`data_version` only reflects other connections' commits).
    pub(super) fn invalidate_vocab(&self) {
        *self.vocab.borrow_mut() = None;
    }

    /// Find tracks for a search box query, best matches first.
    pub(crate) fn search(&self, query: &str, limit: usize) -> rusqlite::Result<Vec<SearchHit>> {
        let typed = words(query);
        if typed.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        // While typing, the last word is probably unfinished.
        let prefix_last = !query.ends_with(char::is_whitespace);
        let prefix_at = |index: usize, count: usize| prefix_last && index + 1 == count;

        // Latin keys of the query as typed and as retyped in the other layout.
        let variants: Vec<Vec<String>> = std::iter::once(query.to_owned())
            .chain(swap_layout(query))
            .map(|variant| {
                words(&variant)
                    .iter()
                    .map(|word| latin_key(word))
                    .filter(|key| !key.is_empty())
                    .collect::<Vec<_>>()
            })
            .filter(|keys| !keys.is_empty())
            .collect();

        let exact = all_words(
            TEXT_COLUMNS,
            &typed
                .iter()
                .enumerate()
                .map(|(i, word)| vec![phrase(word, prefix_at(i, typed.len()))])
                .collect::<Vec<_>>(),
        );

        let translit = variants
            .iter()
            .map(|keys| {
                let words: Vec<Vec<String>> = keys
                    .iter()
                    .enumerate()
                    .map(|(i, key)| vec![phrase(key, prefix_at(i, keys.len()))])
                    .collect();
                format!("({})", all_words(LATIN_COLUMNS, &words))
            })
            .collect::<Vec<_>>()
            .join(" OR ");

        let fuzzy = self.with_vocab(|vocab| {
            let mut corrected_any = false;
            let expressions: Vec<String> = variants
                .iter()
                .map(|keys| {
                    let words: Vec<Vec<String>> = keys
                        .iter()
                        .enumerate()
                        .map(|(i, key)| {
                            let prefix = prefix_at(i, keys.len());
                            let corrections = vocab.corrections(key, prefix);
                            corrected_any |= !corrections.is_empty();
                            std::iter::once(phrase(key, prefix))
                                .chain(corrections.iter().map(|term| phrase(term, false)))
                                .collect()
                        })
                        .collect();
                    format!("({})", all_words(LATIN_COLUMNS, &words))
                })
                .collect();
            corrected_any.then(|| expressions.join(" OR "))
        })?;

        let mut tiers = vec![(MatchKind::Exact, exact)];
        if !translit.is_empty() {
            tiers.push((MatchKind::Translit, translit));
        }
        if let Some(fuzzy) = fuzzy {
            tiers.push((MatchKind::Fuzzy, fuzzy));
        }

        let mut stmt = self.conn.prepare(
            "SELECT t.rel_path FROM search JOIN tracks t ON t.id = search.rowid
             WHERE search MATCH ?1
             ORDER BY bm25(search, 10.0, 6.0, 3.0, 10.0, 6.0, 3.0), t.rel_path
             LIMIT ?2",
        )?;
        let mut seen = HashSet::new();
        let mut hits = Vec::new();
        for (kind, expression) in tiers {
            if hits.len() >= limit {
                break;
            }
            // Earlier tiers' tracks come back too; ask for enough to skip them.
            let wanted = (limit - hits.len() + seen.len()) as i64;
            let rows = stmt.query_map(params![expression, wanted], |row| row.get::<_, String>(0))?;
            for rel_path in rows {
                let rel_path = rel_path?;
                if hits.len() < limit && seen.insert(rel_path.clone()) {
                    hits.push(SearchHit { rel_path, kind });
                }
            }
        }
        Ok(hits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::ScannedTrack;

    #[test]
    fn latin_keys_collapse_transliteration_variants() {
        let same = |words: &[&str]| {
            let keys: Vec<String> = words.iter().map(|w| latin_key(&w.to_lowercase())).collect();
            assert!(keys.windows(2).all(|pair| pair[0] == pair[1]), "{words:?} -> {keys:?}");
        };
        same(&["Привет", "privet", "privyet"]);
        same(&["Цой", "tsoy", "tsoi", "coi"]);
        same(&["Щука", "shchuka", "schuka"]);
        same(&["Жизнь", "zhizn"]);
        same(&["Хлеб", "khleb", "hleb"]);
        same(&["Юрий", "yuriy", "iurii"]);
        same(&["Café", "cafe"]);
    }

    #[test]
    fn keyboard_layout_swap() {
        assert_eq!(swap_layout("ghbdtn").as_deref(), Some("привет"));
        assert_eq!(swap_layout("Руддщ").as_deref(), Some("hello"));
        assert_eq!(swap_layout("mixed микс"), None);
        assert_eq!(swap_layout("123"), None);
    }

    #[test]
    fn osa_counts_a_swap_as_one_edit() {
        let d = |a: &str, b: &str| {
            let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
            osa_distance(&a, &b, 2)
        };
        assert_eq!(d("adle", "adel"), Some(1));
        assert_eq!(d("linkn", "linkin"), Some(1));
        assert_eq!(d("kitten", "sitting"), None);
    }

    fn track(rel_path: &str, title: &str, artist: &str, album: &str) -> ScannedTrack {
        ScannedTrack {
            track: Track {
                name: format!("{rel_path}.flac"),
                path: String::new(),
                rel_path: rel_path.to_owned(),
                duration: 0,
                title: (!title.is_empty()).then(|| title.to_owned()),
                artists: vec![artist.to_owned()],
                album: Some(album.to_owned()),
                album_artist: None,
                track_number: None,
                disc_number: None,
                year: None,
                genre: Vec::new(),
                bitrate: None,
                sample_rate: None,
                format: None,
                cover_path: None,
                date_created: 0,
                file_mtime: 0,
                metadata_modified_at: 0,
                file_size: 0,
            },
            mtime_ns: 0,
            size: 0,
        }
    }

    #[test]
    fn search_tiers() {
        let base = std::env::temp_dir().join(format!("aivys-search-test-{}", crate::store::new_uuid()));
        let root = base.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut db = LibraryDb::open(&base, &root).unwrap();
        db.apply_scan(
            &[
                track("kino", "Привет", "Кино", "Группа крови"),
                track("numb", "Numb", "Linkin Park", "Meteora"),
                track("adele", "Hello", "Adele", "25"),
                track("Untitled Demo", "", "Unknown", "Demos"),
            ],
            &[],
            &[],
        )
        .unwrap();

        fn find(db: &LibraryDb, query: &str) -> Vec<(String, MatchKind)> {
            db.search(query, 10)
                .unwrap()
                .into_iter()
                .map(|hit| (hit.rel_path, hit.kind))
                .collect()
        }
        let one = |path: &str, kind: MatchKind| vec![(path.to_owned(), kind)];

        assert_eq!(find(&db, "numb"), one("numb", MatchKind::Exact));
        assert_eq!(find(&db, "park lin"), one("numb", MatchKind::Exact));
        assert_eq!(find(&db, "кино"), one("kino", MatchKind::Exact));
        assert_eq!(find(&db, "демо"), one("Untitled Demo", MatchKind::Translit));
        assert_eq!(find(&db, "untitled"), one("Untitled Demo", MatchKind::Exact));

        assert_eq!(find(&db, "privet"), one("kino", MatchKind::Translit));
        assert_eq!(find(&db, "kino"), one("kino", MatchKind::Translit));
        assert_eq!(find(&db, "ghbdtn"), one("kino", MatchKind::Translit));
        assert_eq!(find(&db, "руддщ"), one("adele", MatchKind::Translit));

        assert_eq!(find(&db, "linkn park "), one("numb", MatchKind::Fuzzy));
        assert_eq!(find(&db, "привт"), one("kino", MatchKind::Fuzzy));
        assert_eq!(find(&db, "adle"), one("adele", MatchKind::Fuzzy));
        assert_eq!(find(&db, "metalica"), Vec::new());

        // Removed tracks leave the index.
        db.apply_scan(&[], &[], &["numb".to_owned()]).unwrap();
        assert!(find(&db, "numb").is_empty());

        drop(db);
        let _ = std::fs::remove_dir_all(&base);
    }
}
