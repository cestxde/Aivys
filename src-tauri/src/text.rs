/// Repairs "mojibake" tags/names whose original bytes were misread as Latin-1:
/// tries UTF-8 first, then Windows-1251. Only touches all-single-byte strings,
/// so genuine text (any char > U+00FF) is left untouched.
pub(crate) fn repair_mojibake(value: &str) -> String {
    let mut bytes = Vec::with_capacity(value.len());
    for c in value.chars() {
        let code = c as u32;
        if code > 0xFF {
            // A char above the latin-1 range means this is real text already.
            return value.to_owned();
        }
        bytes.push(code as u8);
    }

    // Case 1: original was UTF-8, mangled through Latin-1.
    if let Ok(repaired) = std::str::from_utf8(&bytes) {
        if repaired != value {
            return repaired.to_owned();
        }
    }

    // Case 2: original was Windows-1251, mangled through Latin-1.
    let (repaired, _, had_errors) = encoding_rs::WINDOWS_1251.decode(&bytes);
    if !had_errors && repaired != value {
        return repaired.into_owned();
    }

    value.to_owned()
}

pub(crate) fn repair_opt(value: Option<String>) -> Option<String> {
    value.map(|v| repair_mojibake(&v))
}
