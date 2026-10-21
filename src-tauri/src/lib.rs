use lofty::file::{AudioFile as LoftyAudioFile, FileType, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Track {
    name: String,
    path: String,
    duration: u32,

    // Core musical metadata
    title: Option<String>,
    artists: Vec<String>,
    album: Option<String>,
    album_artist: Option<String>,
    track_number: Option<u32>,
    disc_number: Option<u32>,
    year: Option<u32>,
    genre: Vec<String>,

    // Technical info
    bitrate: Option<u32>,
    sample_rate: Option<u32>,
    format: Option<String>,

    // Path to the extracted cover art file in the app data cache, if any.
    cover_path: Option<String>,

    // Timestamps (unix seconds)
    date_created: u64,
    file_mtime: u64,
    metadata_modified_at: u64,
}

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

/// Collect all non-empty text values for a given key, splitting on embedded NUL
/// characters (ID3v2.4 stores multi-value fields NUL-separated).
fn collect_strings(tag: &lofty::tag::Tag, key: ItemKey) -> Vec<String> {
    tag.get_strings(key)
        .flat_map(|value| value.split('\u{0}'))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

fn read_modified(path: &Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

/// Repairs "mojibake" tags/names whose original bytes were misread as Latin-1:
/// tries UTF-8 first, then Windows-1251. Only touches all-single-byte strings,
/// so genuine text (any char > U+00FF) is left untouched.
fn repair_mojibake(value: &str) -> String {
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

fn repair_opt(value: Option<String>) -> Option<String> {
    value.map(|v| repair_mojibake(&v))
}

/// Extract the first embedded picture from the tag, write it to `covers_dir`
/// (named by the content hash, so identical covers share one file), and return
/// the file path. Returns None if there is no picture or the write fails.
fn extract_cover(tag: &lofty::tag::Tag, covers_dir: &Path) -> Option<String> {
    let picture = tag.pictures().first()?;
    let data = picture.data();
    if data.is_empty() {
        return None;
    }

    let ext = picture
        .mime_type()
        .and_then(|mime| mime.ext())
        .unwrap_or("bin");
    let hash = blake3::hash(data).to_hex();
    let file_path = covers_dir.join(format!("{hash}.{ext}"));

    // Reuse an existing cache file for identical content.
    if !file_path.exists() {
        if std::fs::create_dir_all(covers_dir).is_err() {
            return None;
        }
        if std::fs::write(&file_path, data).is_err() {
            return None;
        }
    }

    Some(file_path.to_string_lossy().into_owned())
}

fn read_track(path: &Path, covers_dir: &Path) -> Option<Track> {
    let probed = Probe::open(path).ok()?.read().ok()?;

    let duration = probed.properties().duration().as_secs() as u32;
    let bitrate = probed.properties().audio_bitrate();
    let sample_rate = probed.properties().sample_rate();

    let format =
        FileType::from_path(path).map(|file_type| format!("{file_type:?}").to_ascii_lowercase());

    let tag = probed.primary_tag().or_else(|| probed.first_tag());

    let mut title = None;
    let mut artists = Vec::new();
    let mut album = None;
    let mut album_artist = None;
    let mut track_number = None;
    let mut disc_number = None;
    let mut year = None;
    let mut genre = Vec::new();
    let mut cover_path = None;

    if let Some(tag) = tag {
        cover_path = extract_cover(tag, covers_dir);

        title = tag
            .get_string(ItemKey::TrackTitle)
            .map(str::to_owned)
            .or_else(|| tag.title().map(|value| value.into_owned()));

        // Multi-artist: gather every value from the multi-value keys first.
        artists = collect_strings(tag, ItemKey::TrackArtist);
        artists.extend(collect_strings(tag, ItemKey::TrackArtists));
        if artists.is_empty() {
            if let Some(single) = tag.artist() {
                artists.push(single.into_owned());
            }
        }
        artists.dedup();

        album = tag
            .get_string(ItemKey::AlbumTitle)
            .map(str::to_owned)
            .or_else(|| tag.album().map(|value| value.into_owned()));

        album_artist = tag.get_string(ItemKey::AlbumArtist).map(str::to_owned);

        track_number = tag
            .get_string(ItemKey::TrackNumber)
            .and_then(|value| value.trim().parse::<u32>().ok());

        disc_number = tag
            .get_string(ItemKey::DiscNumber)
            .and_then(|value| value.trim().parse::<u32>().ok());

        year = tag
            .get_string(ItemKey::Year)
            .or_else(|| tag.get_string(ItemKey::RecordingDate))
            .and_then(|value| value.get(0..4))
            .and_then(|value| value.trim().parse::<u32>().ok());

        genre = collect_strings(tag, ItemKey::Genre);
    }

    let file_mtime = read_modified(path);

    let name = repair_mojibake(&path.file_name()?.to_string_lossy());

    Some(Track {
        name,
        path: path.to_string_lossy().into_owned(),
        duration,

        title: repair_opt(title),
        artists: artists.iter().map(|a| repair_mojibake(a)).collect(),
        album: repair_opt(album),
        album_artist: repair_opt(album_artist),
        track_number,
        disc_number,
        year,
        genre: genre.iter().map(|g| repair_mojibake(g)).collect(),

        bitrate,
        sample_rate,
        format,
        cover_path,

        // On a first scan the file has no prior "date added" record yet, so we
        // fall back to the file's mtime. A persistent store (see the roadmap)
        // will later keep this stable across metadata edits.
        date_created: file_mtime,
        file_mtime,
        metadata_modified_at: 0,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn scan_directory(app: tauri::AppHandle, base_path: String) -> Vec<Track> {
    let covers_dir = app
        .path()
        .app_data_dir()
        .map(|dir| dir.join("covers"))
        .unwrap_or_else(|_| std::env::temp_dir().join("aivys-covers"));

    let mut tracks = Vec::new();

    for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();

        if path.is_file() && is_audio_file(path) {
            if let Some(track) = read_track(path, &covers_dir) {
                tracks.push(track);
            }
        }
    }
    tracks
}

/// Returns true if `path` exists and is a directory.
#[tauri::command]
fn validate_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Show the main window. It starts hidden (see tauri.conf.json) so the user
/// never sees a white webview flash; the frontend calls this once it has
/// painted its first frame.
#[tauri::command]
fn show_main_window(window: tauri::Window) {
    let _ = window.show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            validate_directory,
            show_main_window
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Safety net: the window starts hidden and the frontend shows it
            // once painted. If that signal never arrives (e.g. a frontend
            // crash before first render), reveal it anyway after a few seconds
            // so the app is never stuck invisible.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(4));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
