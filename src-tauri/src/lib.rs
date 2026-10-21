use lofty::file::{AudioFile as LoftyAudioFile, FileType, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;
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

fn read_track(path: &Path) -> Option<Track> {
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

    if let Some(tag) = tag {
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

    Some(Track {
        name: path.file_name()?.to_string_lossy().into_owned(),
        path: path.to_string_lossy().into_owned(),
        duration,

        title,
        artists,
        album,
        album_artist,
        track_number,
        disc_number,
        year,
        genre,

        bitrate,
        sample_rate,
        format,

        // On a first scan the file has no prior "date added" record yet, so we
        // fall back to the file's mtime. A persistent store (see the roadmap)
        // will later keep this stable across metadata edits.
        date_created: file_mtime,
        file_mtime,
        metadata_modified_at: 0,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn scan_directory(base_path: String) -> Vec<Track> {
    let mut tracks = Vec::new();

    for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();

        if path.is_file() && is_audio_file(path) {
            if let Some(track) = read_track(path) {
                tracks.push(track);
            }
        }
    }
    tracks
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_directory])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
