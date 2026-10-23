use crate::store::commands::open_store;
use crate::store::fsio::now_unix;
use crate::store::index::{added_at_path, load_added_at, save_added_at};
use crate::track::{read_modified, read_track, Track};
use std::path::{Path, PathBuf};
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
    let store_path = added_at_path(base);

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
                added_at.insert(rel_key.clone(), first_seen);
                changed = true;
                first_seen
            }
        };

        if let Some(mut track) = read_track(path, covers_dir, date_created) {
            track.rel_path = rel_key;
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
    tauri::async_runtime::spawn_blocking(move || {
        // Open `.aivys/` first: it merges sync conflicts (including
        // added-at.json) before the scan reads them.
        if let Err(err) = open_store(&app, Path::new(&base_path)) {
            log::warn!("cannot open .aivys store: {err}");
        }
        do_scan(&base_path, &covers_dir)
    })
    .await
    .unwrap_or_default()
}

/// Returns true if `path` exists and is a directory.
#[tauri::command]
pub(crate) fn validate_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}
