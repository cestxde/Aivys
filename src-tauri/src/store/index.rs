use super::fsio::atomic_write;
use super::AIVYS_DIR;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

/// The persistent "added-at" store lives next to the music, in
/// `<base_path>/.aivys/index/added-at.json`, so it syncs with the library
/// across devices (paths are stored relative to the library root).
pub(crate) fn added_at_path(base_path: &Path) -> PathBuf {
    base_path.join(AIVYS_DIR).join("index").join("added-at.json")
}

/// Load the map of relative-path -> first-seen timestamp. Returns an empty map
/// if the file is missing or unreadable.
pub(crate) fn load_added_at(path: &Path) -> HashMap<String, u64> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

/// Merge strategy (§8.5): union of keys, earliest sighting wins.
pub(crate) fn merge_added_at(target: &mut HashMap<String, u64>, other: HashMap<String, u64>) {
    for (key, ts) in other {
        target
            .entry(key)
            .and_modify(|existing| *existing = (*existing).min(ts))
            .or_insert(ts);
    }
}

/// Write the store back to disk. The file on disk is re-read and merged first,
/// so entries another device synced in while we were scanning are kept.
/// Keys are written sorted so unchanged content produces identical bytes.
pub(crate) fn save_added_at(path: &Path, map: &HashMap<String, u64>) -> bool {
    let mut merged = load_added_at(path);
    merge_added_at(&mut merged, map.clone());

    let sorted: BTreeMap<_, _> = merged.into_iter().collect();
    let Ok(json) = serde_json::to_string_pretty(&sorted) else {
        return false;
    };
    atomic_write(path, json.as_bytes()).is_ok()
}
