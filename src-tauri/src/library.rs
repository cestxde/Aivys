use crate::track::{read_modified, read_track, Track};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use walkdir::WalkDir;

/// File extensions we attempt to read. Covers the formats whose (most) tag
/// capabilities overlap with MP3 and that `lofty` can parse.
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "m4b", "mp4", "ogg", "oga", "opus", "wav", "aiff", "aif", "ape", "wv",
    "mpc", "spx", "aac",
];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            AUDIO_EXTENSIONS.iter().any(|candidate| *candidate == lower)
        })
        .unwrap_or(false)
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The persistent "added-at" store lives next to the music, in
/// `<base_path>/.aivys/index/added-at.json`, so it syncs with the library
/// across devices (paths are stored relative to the library root).
fn added_at_store_path(base_path: &Path) -> PathBuf {
    base_path.join(".aivys").join("index").join("added-at.json")
}

/// Load the map of relative-path -> first-seen timestamp. Returns an empty map
/// if the file is missing or unreadable.
fn load_added_at(path: &Path) -> HashMap<String, u64> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

/// Write the store back to disk (atomically enough for our purposes: write to a
/// temp file, then rename). Creates the parent directory if needed.
fn save_added_at(path: &Path, map: &HashMap<String, u64>) -> bool {
    let Some(parent) = path.parent() else {
        return false;
    };
    if std::fs::create_dir_all(parent).is_err() {
        return false;
    }

    let Ok(json) = serde_json::to_string_pretty(map) else {
        return false;
    };

    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, json).is_err() {
        return false;
    }
    std::fs::rename(&tmp, path).is_ok()
}

fn resolve_covers_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("covers"))
        .unwrap_or_else(|_| std::env::temp_dir().join("aivys-covers"))
}

/// The blocking part of a scan: walks the folder, reads tags and covers, and
/// updates the "added-at" store. Kept synchronous so it can run on a blocking
/// thread pool via [`scan_directory`], never on the UI thread.
fn do_scan(base_path: &str, covers_dir: &Path) -> Vec<Track> {
    let base = Path::new(base_path);
    let store_path = added_at_store_path(base);

    // A missing store means this is the first time the folder is scanned: seed
    // `firstSeen` from each file's mtime so we don't lose the existing history.
    // Once the store exists, files it doesn't know about are genuinely new, so
    // we stamp them with `now()`. Either way, existing entries are never
    // changed, so metadata edits (which touch mtime) don't move tracks around.
    let store_exists = store_path.exists();
    let mut added_at = load_added_at(&store_path);
    let now = now_unix();
    let mut changed = false;

    let mut tracks = Vec::new();

    for entry in WalkDir::new(base).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();

        if !path.is_file() || !is_audio_file(path) {
            continue;
        }

        let file_mtime = read_modified(path);

        // Store the key relative to the library root so it is stable across
        // devices (absolute paths differ between machines).
        let rel_key = path
            .strip_prefix(base)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        let date_created = match added_at.get(&rel_key) {
            Some(existing) => *existing,
            None => {
                let first_seen = if store_exists { now } else { file_mtime };
                added_at.insert(rel_key, first_seen);
                changed = true;
                first_seen
            }
        };

        if let Some(track) = read_track(path, covers_dir, date_created) {
            tracks.push(track);
        }
    }

    if changed || !store_exists {
        save_added_at(&store_path, &added_at);
    }

    tracks
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn scan_directory(app: tauri::AppHandle, base_path: String) -> Vec<Track> {
    let covers_dir = resolve_covers_dir(&app);

    // Run the blocking filesystem/tag work off the UI thread so the webview
    // stays responsive (spinner keeps animating) during a large scan.
    tauri::async_runtime::spawn_blocking(move || do_scan(&base_path, &covers_dir))
        .await
        .unwrap_or_default()
}

/// Returns true if `path` exists and is a directory.
#[tauri::command]
pub(crate) fn validate_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}
