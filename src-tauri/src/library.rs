use crate::artists::{ArtistRules, Splitter};
use crate::db::{LibraryDb, ScannedTrack};
use crate::store::commands::{artist_rules, open_store};
use crate::store::fsio::now_unix;
use crate::store::index::{added_at_path, load_added_at, save_added_at};
use crate::track::{read_modified, read_track, Track};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
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

/// An audio file found by the walk, with what change detection needs.
struct FoundFile {
    path: PathBuf,
    rel_key: String,
    mtime_ns: i64,
    size: i64,
    date_created: u64,
}

fn mtime_ns(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos() as i64)
        .unwrap_or(0)
}

/// Walk the library and resolve each file's stable "date added", updating the
/// "added-at" store.
fn find_files(base: &Path) -> Vec<FoundFile> {
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

    let mut files = Vec::new();

    for entry in WalkDir::new(base).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();

        if !path.is_file() || !is_audio_file(path) {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };

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
                let first_seen = if store_exists { now } else { read_modified(path) };
                added_at.insert(rel_key.clone(), first_seen);
                changed = true;
                first_seen
            }
        };

        files.push(FoundFile {
            path: path.to_path_buf(),
            rel_key,
            mtime_ns: mtime_ns(&meta),
            size: meta.len() as i64,
            date_created,
        });
    }

    if changed || !store_exists {
        save_added_at(&store_path, &added_at);
    }

    files
}

fn read_found(file: &FoundFile, covers_dir: &Path, splitter: &Splitter) -> Option<Track> {
    let mut track = read_track(&file.path, covers_dir, file.date_created, splitter)?;
    track.rel_path = file.rel_key.clone();
    track.file_size = file.size as u64;
    Some(track)
}

/// Scan through the index: only files that are new or changed since the last
/// scan (by mtime and size), or whose cached cover is gone, have their tags
/// read again. Artists of cached files follow `rules` without a re-read.
fn scan_cached(
    db: &mut LibraryDb,
    base: &Path,
    files: &[FoundFile],
    covers_dir: &Path,
    rules: &ArtistRules,
) -> rusqlite::Result<Vec<Track>> {
    let splitter = Splitter::new(rules);
    let mut cached = db.cached_files()?;

    let mut upserts = Vec::new();
    let mut added_at_updates = Vec::new();
    // Files that vanished, plus files that changed but can no longer be read.
    let mut removed = Vec::new();

    for file in files {
        let fresh = cached.remove(&file.rel_key).filter(|entry| {
            entry.mtime_ns == file.mtime_ns
                && entry.size == file.size
                && entry.cover_path.as_deref().map_or(true, |cover| Path::new(cover).exists())
        });

        match fresh {
            Some(entry) => {
                // "Date added" can still move, e.g. merged from another device.
                if entry.added_at != file.date_created {
                    added_at_updates.push((file.rel_key.clone(), file.date_created));
                }
            }
            None => match read_found(file, covers_dir, &splitter) {
                Some(track) => upserts.push(ScannedTrack {
                    track,
                    mtime_ns: file.mtime_ns,
                    size: file.size,
                }),
                None => removed.push(file.rel_key.clone()),
            },
        }
    }
    removed.extend(cached.into_keys());

    log::info!(
        "scan: {} files, {} re-read, {} removed",
        files.len(),
        upserts.len(),
        removed.len()
    );
    db.apply_scan(&upserts, &added_at_updates, &removed)?;
    db.derive_artists(rules, !upserts.is_empty() || !removed.is_empty())?;
    db.load_tracks(base)
}

/// The blocking part of a scan: walks the folder, reads tags and covers, and
/// updates the "added-at" store and the local index. Kept synchronous so it can
/// run on a blocking thread pool via [`scan_directory`], never on the UI thread.
fn do_scan(base_path: &str, covers_dir: &Path, app_data: Option<&Path>, rules: &ArtistRules) -> Vec<Track> {
    let base = Path::new(base_path);
    let files = find_files(base);

    let db = app_data.and_then(|app_data| match LibraryDb::open(app_data, base) {
        Ok(db) => Some(db),
        Err(err) => {
            log::warn!("cannot open library index: {err}");
            None
        }
    });
    if let Some(mut db) = db {
        match scan_cached(&mut db, base, &files, covers_dir, rules) {
            Ok(tracks) => return tracks,
            Err(err) => log::warn!("library index failed, scanning without it: {err}"),
        }
    }

    let splitter = Splitter::new(rules);
    files.iter().filter_map(|file| read_found(file, covers_dir, &splitter)).collect()
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn scan_directory(app: tauri::AppHandle, base_path: String) -> Vec<Track> {
    let covers_dir = resolve_covers_dir(&app);
    let app_data = app.path().app_data_dir().ok();

    // Run the blocking filesystem/tag work off the UI thread so the webview
    // stays responsive (spinner keeps animating) during a large scan.
    tauri::async_runtime::spawn_blocking(move || {
        // One scan at a time: two at once would race on the index and the
        // added-at store (e.g. a rescan requested while one is running).
        static SCAN: Mutex<()> = Mutex::new(());
        let _scanning = SCAN.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        // Open `.aivys/` first: it merges sync conflicts (including
        // added-at.json) before the scan reads them.
        if let Err(err) = open_store(&app, Path::new(&base_path)) {
            log::warn!("cannot open .aivys store: {err}");
        }
        do_scan(&base_path, &covers_dir, app_data.as_deref(), &artist_rules(&app))
    })
    .await
    .unwrap_or_default()
}

/// Returns true if `path` exists and is a directory.
#[tauri::command]
pub(crate) fn validate_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tiny valid PCM WAV file with `samples` silent 16-bit mono samples.
    fn write_wav(path: &Path, samples: u32) {
        let data_len = samples * 2;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
        bytes.extend_from_slice(&1u16.to_le_bytes()); // mono
        bytes.extend_from_slice(&8000u32.to_le_bytes());
        bytes.extend_from_slice(&16000u32.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        bytes.resize(bytes.len() + data_len as usize, 0);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn rescan_reads_only_changed_files() {
        let base = std::env::temp_dir().join(format!("aivys-scan-test-{}", crate::store::new_uuid()));
        let root = base.join("library");
        let app_data = base.join("app-data");
        let covers = app_data.join("covers");
        write_wav(&root.join("Artist").join("one.wav"), 8000);
        write_wav(&root.join("two.wav"), 8000);
        let root_str = root.to_string_lossy().into_owned();

        let tracks = do_scan(&root_str, &covers, Some(&app_data), &ArtistRules::default());
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].rel_path, "Artist/one.wav");
        assert_eq!(tracks[0].path, root.join("Artist").join("one.wav").to_string_lossy());

        // Mark the cached rows; a file that is re-read loses the mark.
        let conn = rusqlite::Connection::open(crate::db::db_path(&app_data, &root)).unwrap();
        conn.execute("UPDATE tracks SET title = 'cached'", []).unwrap();
        drop(conn);

        write_wav(&root.join("two.wav"), 16000);
        std::fs::remove_file(root.join("Artist").join("one.wav")).unwrap();
        write_wav(&root.join("three.wav"), 8000);

        let tracks = do_scan(&root_str, &covers, Some(&app_data), &ArtistRules::default());
        let titles: Vec<(&str, Option<&str>)> = tracks
            .iter()
            .map(|t| (t.rel_path.as_str(), t.title.as_deref()))
            .collect();
        assert_eq!(titles, vec![("three.wav", None), ("two.wav", None)]);
        assert_eq!(tracks[1].duration, 2);

        write_wav(&root.join("four.wav"), 8000);
        let conn = rusqlite::Connection::open(crate::db::db_path(&app_data, &root)).unwrap();
        conn.execute("UPDATE tracks SET title = 'cached'", []).unwrap();
        drop(conn);
        let tracks = do_scan(&root_str, &covers, Some(&app_data), &ArtistRules::default());
        let cached = tracks.iter().filter(|t| t.title.as_deref() == Some("cached")).count();
        assert_eq!(cached, 2, "unchanged files must come from the index");

        let _ = std::fs::remove_dir_all(&base);
    }
}
