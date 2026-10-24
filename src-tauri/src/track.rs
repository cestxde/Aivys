use crate::artists::{display_line, Splitter};
use crate::cover::extract_cover;
use crate::text::{repair_mojibake, repair_opt};
use lofty::file::{AudioFile as LoftyAudioFile, FileType, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Track {
    pub(crate) name: String,
    pub(crate) path: String,
    // Path relative to the library root with `/` separators: the key used by
    // everything stored in `.aivys/`. Filled in by the scan.
    pub(crate) rel_path: String,
    pub(crate) duration: u32,

    // Core musical metadata
    pub(crate) title: Option<String>,
    pub(crate) artists: Vec<String>,
    pub(crate) album: Option<String>,
    pub(crate) album_artist: Option<String>,
    pub(crate) track_number: Option<u32>,
    // How many tracks the album (or its disc) has, by the tags ("4/12").
    pub(crate) track_total: Option<u32>,
    pub(crate) disc_number: Option<u32>,
    pub(crate) year: Option<u32>,
    pub(crate) genre: Vec<String>,

    // Technical info
    pub(crate) bitrate: Option<u32>,
    pub(crate) sample_rate: Option<u32>,
    pub(crate) format: Option<String>,

    // Path to the extracted cover art file in the app data cache, if any.
    pub(crate) cover_path: Option<String>,

    // Timestamps (unix seconds)
    pub(crate) date_created: u64,
    pub(crate) file_mtime: u64,
    pub(crate) metadata_modified_at: u64,

    // File size in bytes.
    pub(crate) file_size: u64,

    // The artist tags as written, for display ("A & B"); `artists` are the
    // separate artists split from them, for grouping.
    pub(crate) artist_line: String,

    // Artists of this track left out of the artist list (met too rarely).
    pub(crate) unlisted_artists: Vec<String>,

    // The artist tag values as read, before splitting (kept by the index so
    // new splitting rules apply without reading the file again).
    #[serde(skip)]
    pub(crate) artist_tags: Vec<String>,
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

/// Returns the file's modification time as unix seconds (0 if unavailable).
pub(crate) fn read_modified(path: &Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

pub(crate) fn read_track(path: &Path, covers_dir: &Path, date_created: u64, splitter: &Splitter) -> Option<Track> {
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
    let mut track_total = None;
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

        album = tag
            .get_string(ItemKey::AlbumTitle)
            .map(str::to_owned)
            .or_else(|| tag.album().map(|value| value.into_owned()));

        album_artist = tag.get_string(ItemKey::AlbumArtist).map(str::to_owned);

        // "4" or "4/12".
        let track_field = tag.get_string(ItemKey::TrackNumber).map(|value| value.trim().to_owned());
        track_number = track_field
            .as_deref()
            .and_then(|value| value.split('/').next())
            .and_then(|value| value.trim().parse::<u32>().ok());
        track_total = tag
            .track_total()
            .or_else(|| track_field.as_deref()?.split('/').nth(1)?.trim().parse::<u32>().ok())
            .filter(|total| *total > 0);

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
    let artist_tags: Vec<String> = artists.iter().map(|a| repair_mojibake(a)).collect();

    Some(Track {
        name,
        path: path.to_string_lossy().into_owned(),
        rel_path: String::new(),
        duration,

        title: repair_opt(title),
        artists: splitter.split(&artist_tags),
        album: repair_opt(album),
        album_artist: repair_opt(album_artist),
        track_number,
        track_total,
        disc_number,
        year,
        genre: genre.iter().map(|g| repair_mojibake(g)).collect(),

        bitrate,
        sample_rate,
        format,
        cover_path,

        // `date_created` is resolved by the caller from the persistent
        // "added-at" store, so it stays stable across metadata edits.
        date_created,
        file_mtime,
        metadata_modified_at: 0,
        file_size: std::fs::metadata(path).map_or(0, |meta| meta.len()),
        artist_line: display_line(&artist_tags),
        unlisted_artists: Vec::new(),
        artist_tags,
    })
}
