//! Unicode writing systems in track text (title / artists / album). Used to
//! filter the library by script — e.g. Japanese kana — without language tags.

use crate::track::Track;
use std::path::Path;

pub const LATIN: u32 = 1 << 0;
pub const CYRILLIC: u32 = 1 << 1;
/// Hiragana or katakana (including halfwidth). Reliable signal for Japanese.
pub const JAPANESE: u32 = 1 << 2;
pub const KOREAN: u32 = 1 << 3;
/// CJK ideographs (Chinese, Japanese kanji, …).
pub const HAN: u32 = 1 << 4;
pub const ARABIC: u32 = 1 << 5;
pub const THAI: u32 = 1 << 6;
pub const GREEK: u32 = 1 << 7;
/// Alphabetic characters outside the scripts above.
pub const OTHER: u32 = 1 << 8;

fn is_hiragana(c: char) -> bool {
    matches!(c, '\u{3040}'..='\u{309F}')
}

fn is_katakana(c: char) -> bool {
    matches!(
        c,
        '\u{30A0}'..='\u{30FF}' | '\u{31F0}'..='\u{31FF}' | '\u{FF66}'..='\u{FF9D}'
    )
}

fn is_hangul(c: char) -> bool {
    matches!(
        c,
        '\u{1100}'..='\u{11FF}'
            | '\u{3130}'..='\u{318F}'
            | '\u{A960}'..='\u{A97F}'
            | '\u{AC00}'..='\u{D7A3}'
            | '\u{D7B0}'..='\u{D7FF}'
    )
}

fn is_han(c: char) -> bool {
    matches!(
        c,
        '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{20000}'..='\u{2A6DF}'
            | '\u{2A700}'..='\u{2B73F}'
            | '\u{2B740}'..='\u{2B81F}'
            | '\u{2B820}'..='\u{2CEAF}'
            | '\u{2F800}'..='\u{2FA1F}'
    )
}

fn is_cyrillic(c: char) -> bool {
    matches!(c, '\u{0400}'..='\u{04FF}' | '\u{0500}'..='\u{052F}' | '\u{2DE0}'..='\u{2DFF}' | '\u{A640}'..='\u{A69F}')
}

fn is_arabic(c: char) -> bool {
    matches!(
        c,
        '\u{0600}'..='\u{06FF}' | '\u{0750}'..='\u{077F}' | '\u{08A0}'..='\u{08FF}' | '\u{FB50}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}'
    )
}

fn is_thai(c: char) -> bool {
    matches!(c, '\u{0E00}'..='\u{0E7F}')
}

fn is_greek(c: char) -> bool {
    matches!(c, '\u{0370}'..='\u{03FF}' | '\u{1F00}'..='\u{1FFF}')
}

fn is_latin(c: char) -> bool {
    c.is_ascii_alphabetic()
        || matches!(
            c,
            '\u{00C0}'..='\u{00D6}'
                | '\u{00D8}'..='\u{00F6}'
                | '\u{00F8}'..='\u{024F}'
                | '\u{1E00}'..='\u{1EFF}'
        )
}

/// Bitmask of writing systems present in `text`.
pub(crate) fn detect(text: &str) -> u32 {
    let mut mask = 0u32;
    for c in text.chars() {
        if !c.is_alphabetic() {
            continue;
        }
        if is_hiragana(c) || is_katakana(c) {
            mask |= JAPANESE;
        } else if is_hangul(c) {
            mask |= KOREAN;
        } else if is_han(c) {
            mask |= HAN;
        } else if is_cyrillic(c) {
            mask |= CYRILLIC;
        } else if is_arabic(c) {
            mask |= ARABIC;
        } else if is_thai(c) {
            mask |= THAI;
        } else if is_greek(c) {
            mask |= GREEK;
        } else if is_latin(c) {
            mask |= LATIN;
        } else {
            mask |= OTHER;
        }
        // All bits set: nothing left to discover.
        if mask == (LATIN | CYRILLIC | JAPANESE | KOREAN | HAN | ARABIC | THAI | GREEK | OTHER) {
            break;
        }
    }
    mask
}

/// Scripts in the same fields the search index covers (title / artists / album).
pub(crate) fn of_track(track: &Track) -> u32 {
    let title = track.title.as_deref().unwrap_or_else(|| {
        Path::new(&track.name)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("")
    });
    let mut mask = detect(title);
    for artist in &track.artist_tags {
        mask |= detect(artist);
    }
    if let Some(album_artist) = &track.album_artist {
        mask |= detect(album_artist);
    }
    if let Some(album) = &track.album {
        mask |= detect(album);
    }
    mask
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_scripts() {
        assert_eq!(detect("Hello"), LATIN);
        assert_eq!(detect("Привет"), CYRILLIC);
        assert_eq!(detect("こんにちは"), JAPANESE);
        assert_eq!(detect("カタカナ"), JAPANESE);
        assert_eq!(detect("夜に駆ける"), JAPANESE | HAN);
        assert_eq!(detect("只因你太美"), HAN);
        assert_eq!(detect("안녕하세요"), KOREAN);
        assert_eq!(detect("مرحبا"), ARABIC);
        assert_eq!(detect("สวัสดี"), THAI);
        assert_eq!(detect("Αθήνα"), GREEK);
        assert_eq!(detect("YOASOBI 夜に駆ける"), LATIN | JAPANESE | HAN);
    }
}
