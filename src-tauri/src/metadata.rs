//! Writing track tags: an edit from the metadata editor applied to audio
//! files, and undoing the last one.
//!
//! A file is never written in place: the edit goes into a copy next to it,
//! which then replaces the original, so a failure leaves the file as it was.
//! Before that the original is copied to `<app-data>/undo/`; undo puts those
//! copies back, for files nobody changed since.
//!
//! For the common formats the edit goes through the format's own tag
//! (ID3v2, Vorbis comments, MP4 ilst) split into lofty's generic view and
//! merged back, so frames the generic view cannot represent are kept.

use lofty::config::{ParseOptions, WriteOptions};
use lofty::file::{AudioFile, FileType, TaggedFileExt};
use lofty::flac::FlacFile;
use lofty::id3::v2::{FrameId, Id3v2Version};
use lofty::mp4::Mp4File;
use lofty::mpeg::MpegFile;
use lofty::ogg::{OggPictureStorage, OpusFile, SpeexFile, VorbisFile};
use lofty::picture::{Picture, PictureType};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey, MergeTag, SplitTag, Tag};
use serde::{Deserialize, Deserializer};
use std::fs::{self, File, OpenOptions};
use base64::Engine;
use std::borrow::Cow;
use std::io::{Cursor, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

/// A field that is present in the JSON, as `Some` (with `null` as `Some(None)`).
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(input: D) -> Result<Option<Option<T>>, D::Error> {
    Option::<T>::deserialize(input).map(Some)
}

/// The fields to change: an absent field is kept, `null` (or empty text) clears it.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MetadataEdit {
    #[serde(default, deserialize_with = "present")]
    title: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    artist: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    album: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    album_artist: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    genre: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    year: Option<Option<u32>>,
    #[serde(default, deserialize_with = "present")]
    track_number: Option<Option<u32>>,
    #[serde(default, deserialize_with = "present")]
    track_total: Option<Option<u32>>,
    #[serde(default, deserialize_with = "present")]
    disc_number: Option<Option<u32>>,
    /// A new cover (the image file's bytes, base64), or `null` to remove the cover.
    #[serde(default, deserialize_with = "present")]
    cover: Option<Option<String>>,
}

/// The cover part of an edit, with the image read once for all files.
type CoverChange = Option<Option<Picture>>;

/// The error with its causes: lofty's own message alone ("failed to write
/// Mpeg file") does not say what went wrong.
fn error(err: impl std::error::Error) -> String {
    let mut message = err.to_string();
    let mut source = err.source();
    while let Some(cause) = source {
        message.push_str(": ");
        message.push_str(&cause.to_string());
        source = cause.source();
    }
    message
}

fn set_text(tag: &mut Tag, keys: &[ItemKey], value: &Option<String>) {
    for key in keys {
        tag.remove_key(key.clone());
    }
    if let Some(value) = value.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        tag.insert_text(keys[0].clone(), value.to_owned());
    }
}

fn apply(tag: &mut Tag, edit: &MetadataEdit, cover: &CoverChange) {
    if let Some(value) = &edit.title {
        set_text(tag, &[ItemKey::TrackTitle], value);
    }
    if let Some(value) = &edit.artist {
        // One value as written; the artist rules split it for the library.
        set_text(tag, &[ItemKey::TrackArtist, ItemKey::TrackArtists], value);
    }
    if let Some(value) = &edit.album {
        set_text(tag, &[ItemKey::AlbumTitle], value);
    }
    if let Some(value) = &edit.album_artist {
        set_text(tag, &[ItemKey::AlbumArtist], value);
    }
    if let Some(value) = &edit.genre {
        set_text(tag, &[ItemKey::Genre], value);
    }
    if let Some(value) = edit.year {
        set_text(tag, &[ItemKey::RecordingDate, ItemKey::Year], &value.filter(|year| *year > 0).map(|year| year.to_string()));
    }
    // Zero counts as no number.
    if let Some(value) = edit.track_number {
        match value.filter(|n| *n > 0) {
            Some(number) => tag.set_track(number),
            None => tag.remove_track(),
        }
    }
    if let Some(value) = edit.track_total {
        match value.filter(|n| *n > 0) {
            Some(total) => tag.set_track_total(total),
            None => tag.remove_track_total(),
        }
    }
    if let Some(value) = edit.disc_number {
        match value.filter(|n| *n > 0) {
            Some(disc) => tag.set_disk(disc),
            None => tag.remove_disk(),
        }
    }
    if let Some(picture) = cover {
        while !tag.pictures().is_empty() {
            tag.remove_picture(0);
        }
        if let Some(picture) = picture {
            tag.push_picture(picture.clone());
        }
    }
}

/// `tag` with the edit applied, keeping what lofty's generic view leaves out.
fn edited<T>(tag: T, edit: &MetadataEdit, cover: &CoverChange) -> T
where
    T: SplitTag,
    T::Remainder: MergeTag<Merged = T>,
{
    let (rest, mut generic) = tag.split_tag();
    apply(&mut generic, edit, cover);
    rest.merge_tag(generic)
}

fn save(audio: &impl AudioFile, file: &mut File, options: WriteOptions) -> Result<(), String> {
    file.seek(SeekFrom::Start(0)).map_err(error)?;
    audio.save_to(file, options).map_err(error)
}

/// Write the edit into `target`, an audio file of `file_type`.
fn write_tags(target: &Path, file_type: FileType, edit: &MetadataEdit, cover: &CoverChange) -> Result<(), String> {
    let mut file = OpenOptions::new().read(true).write(true).open(target).map_err(error)?;
    let parse = ParseOptions::new();
    let mut options = WriteOptions::default();
    match file_type {
        FileType::Mpeg => {
            let mut audio = MpegFile::read_from(&mut file, parse).map_err(error)?;
            let mut tag = audio.remove_id3v2().unwrap_or_default();
            // Files tagged for older players stay readable by them.
            if tag.original_version() == Id3v2Version::V3 {
                options.use_id3v23(true);
            }
            // User-defined text frames skip the generic view: the edit never
            // touches them, and lofty maps some of them (TXXX:WORK) to keys it
            // then cannot write back.
            let user_text: Vec<_> = tag.remove(&FrameId::Valid(Cow::Borrowed("TXXX"))).collect();
            let mut tag = edited(tag, edit, cover);
            for frame in user_text {
                tag.insert(frame);
            }
            audio.set_id3v2(tag);
            save(&audio, &mut file, options)
        }
        FileType::Flac => {
            let mut audio = FlacFile::read_from(&mut file, parse).map_err(error)?;
            // FLAC keeps pictures beside the tag; a new cover replaces them too.
            if cover.is_some() {
                while !audio.pictures().is_empty() {
                    audio.remove_picture(0);
                }
            }
            let tag = audio.remove_vorbis_comments().unwrap_or_default();
            audio.set_vorbis_comments(edited(tag, edit, cover));
            save(&audio, &mut file, options)
        }
        FileType::Mp4 => {
            let mut audio = Mp4File::read_from(&mut file, parse).map_err(error)?;
            let tag = audio.remove_ilst().unwrap_or_default();
            audio.set_ilst(edited(tag, edit, cover));
            save(&audio, &mut file, options)
        }
        FileType::Vorbis => {
            let mut audio = VorbisFile::read_from(&mut file, parse).map_err(error)?;
            let tag = audio.remove_vorbis_comments();
            audio.set_vorbis_comments(edited(tag, edit, cover));
            save(&audio, &mut file, options)
        }
        FileType::Opus => {
            let mut audio = OpusFile::read_from(&mut file, parse).map_err(error)?;
            let tag = audio.remove_vorbis_comments();
            audio.set_vorbis_comments(edited(tag, edit, cover));
            save(&audio, &mut file, options)
        }
        FileType::Speex => {
            let mut audio = SpeexFile::read_from(&mut file, parse).map_err(error)?;
            let tag = audio.remove_vorbis_comments();
            audio.set_vorbis_comments(edited(tag, edit, cover));
            save(&audio, &mut file, options)
        }
        // The rest through the generic view of the file's main tag.
        _ => {
            let mut tagged = lofty::read_from(&mut file).map_err(error)?;
            if tagged.primary_tag().is_none() {
                tagged.insert_tag(Tag::new(tagged.primary_tag_type()));
            }
            if let Some(tag) = tagged.primary_tag_mut() {
                apply(tag, edit, cover);
            }
            file.seek(SeekFrom::Start(0)).map_err(error)?;
            tagged.save_to(&mut file, options).map_err(error)
        }
    }
}

/// Replace `path` with a copy of it changed by `fill`; on failure the file
/// stays as it was.
fn replace_file(path: &Path, fill: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    let name = path.file_name().ok_or("no file name")?.to_string_lossy();
    // Not an audio extension: a scan running meanwhile skips it.
    let temp = path.with_file_name(format!(".{name}.aivys-edit"));
    let result = fs::copy(path, &temp)
        .map_err(error)
        .and_then(|_| fill(&temp))
        .and_then(|_| fs::rename(&temp, path).map_err(error));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// What the file looks like now: modification time and size.
fn stamp(path: &Path) -> Option<(u128, u64)> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    Some((modified, meta.len()))
}

fn read_picture(data: &str) -> Result<Picture, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(error)?;
    let mut picture = Picture::from_reader(&mut Cursor::new(bytes)).map_err(error)?;
    picture.set_pic_type(PictureType::CoverFront);
    Ok(picture)
}

/// An edited file, its original's copy, and how it looked after the edit.
struct Backup {
    file: PathBuf,
    copy: PathBuf,
    written: Option<(u128, u64)>,
}

/// The last edit's originals, for undo.
#[derive(Default)]
pub(crate) struct EditUndo(Mutex<Vec<Backup>>);

fn undo_dir(app_data: &Path) -> PathBuf {
    app_data.join("undo")
}

/// Forget the copies of a previous run (undo lasts until the app closes).
pub(crate) fn clear_undo(app_data: &Path) {
    let _ = fs::remove_dir_all(undo_dir(app_data));
}

/// Apply `edit` to `files`; the files that could not be changed, with why.
pub(crate) fn edit_files(app_data: &Path, undo: &EditUndo, files: &[PathBuf], edit: &MetadataEdit) -> Vec<(PathBuf, String)> {
    let cover: CoverChange = match &edit.cover {
        None => None,
        Some(None) => Some(None),
        Some(Some(data)) => match read_picture(data) {
            Ok(picture) => Some(Some(picture)),
            Err(err) => return files.iter().map(|file| (file.clone(), format!("cover: {err}"))).collect(),
        },
    };

    let mut backups = undo.0.lock().unwrap_or_else(|e| e.into_inner());
    backups.clear();
    let dir = undo_dir(app_data);
    let _ = fs::remove_dir_all(&dir);
    if let Err(err) = fs::create_dir_all(&dir) {
        return files.iter().map(|file| (file.clone(), format!("undo copy: {err}"))).collect();
    }

    let mut failed = Vec::new();
    for (index, file) in files.iter().enumerate() {
        let copy = dir.join(index.to_string());
        let result = fs::copy(file, &copy).map_err(error).and_then(|_| {
            let file_type = FileType::from_path(file)
                .or_else(|| Probe::open(file).ok()?.guess_file_type().ok()?.file_type())
                .ok_or("unknown audio format")?;
            replace_file(file, |temp| write_tags(temp, file_type, edit, &cover))
        });
        match result {
            Ok(()) => backups.push(Backup { file: file.clone(), copy, written: stamp(file) }),
            Err(err) => {
                let _ = fs::remove_file(&copy);
                failed.push((file.clone(), err));
            }
        }
    }
    failed
}

/// Put the last edit's originals back. Returns the files that were left as
/// they are: changed since the edit, or failing to restore.
pub(crate) fn undo_edit(app_data: &Path, undo: &EditUndo) -> Vec<PathBuf> {
    let backups = std::mem::take(&mut *undo.0.lock().unwrap_or_else(|e| e.into_inner()));
    let mut skipped = Vec::new();
    for backup in backups {
        let unchanged = backup.written.is_some() && stamp(&backup.file) == backup.written;
        let restored = unchanged
            && replace_file(&backup.file, |temp| fs::copy(&backup.copy, temp).map(|_| ()).map_err(error)).is_ok();
        if !restored {
            skipped.push(backup.file);
        }
    }
    clear_undo(app_data);
    skipped
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("aivys-edit-test-{}", crate::store::new_uuid()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A small valid MPEG file: silent frames behind an ID3v2.3 tag with an
    /// extra frame lofty's generic view does not carry (PRIV) and a
    /// user-defined one it maps to a key it cannot write back (TXXX:WORK).
    fn write_mp3(path: &Path) {
        let mut bytes = Vec::new();
        // ID3v2.3 header + TIT2 "Old" + PRIV "x\0data" + TXXX "WORK" = "Opus".
        let frames: Vec<u8> = [
            [b"TIT2".as_slice(), &[0, 0, 0, 4, 0, 0, 0], b"Old"].concat(),
            [b"PRIV".as_slice(), &[0, 0, 0, 6, 0, 0], b"x\0data"].concat(),
            [b"TXXX".as_slice(), &[0, 0, 0, 10, 0, 0, 0], b"WORK\0Opus"].concat(),
        ]
        .concat();
        let size = frames.len() as u32;
        let syncsafe = [(size >> 21) as u8 & 0x7f, (size >> 14) as u8 & 0x7f, (size >> 7) as u8 & 0x7f, size as u8 & 0x7f];
        bytes.extend_from_slice(b"ID3\x03\x00\x00");
        bytes.extend_from_slice(&syncsafe);
        bytes.extend_from_slice(&frames);
        // MPEG-1 Layer III, 128 kbps, 44.1 kHz: 417-byte frames.
        for _ in 0..20 {
            bytes.extend_from_slice(&[0xFF, 0xFB, 0x90, 0x00]);
            bytes.resize(bytes.len() + 413, 0);
        }
        fs::write(path, bytes).unwrap();
    }

    fn read(path: &Path) -> Tag {
        let tagged = lofty::read_from_path(path).unwrap();
        tagged.primary_tag().unwrap().clone()
    }

    #[test]
    fn edit_keeps_other_frames_and_undo_restores() {
        let dir = temp_dir();
        let song = dir.join("song.mp3");
        write_mp3(&song);
        let original = fs::read(&song).unwrap();

        let edit: MetadataEdit = serde_json::from_str(r#"{"title":"New","artist":"A & B","year":2020,"trackNumber":3,"trackTotal":12}"#).unwrap();
        let undo = EditUndo::default();
        let failed = edit_files(&dir, &undo, &[song.clone()], &edit);
        assert!(failed.is_empty(), "{failed:?}");

        let tag = read(&song);
        assert_eq!(tag.title().as_deref(), Some("New"));
        assert_eq!(tag.artist().as_deref(), Some("A & B"));
        assert_eq!(tag.track(), Some(3));
        assert_eq!(tag.track_total(), Some(12));
        let written = fs::read(&song).unwrap();
        assert!(written.windows(4).any(|w| w == b"PRIV"), "the PRIV frame must survive");
        assert!(written.windows(9).any(|w| w == b"WORK\0Opus"), "the TXXX frame must survive");
        assert_eq!(&written[3..4], &[3], "an ID3v2.3 tag stays 2.3");
        assert!(!dir.join(".song.mp3.aivys-edit").exists());

        assert!(undo_edit(&dir, &undo).is_empty());
        assert_eq!(fs::read(&song).unwrap(), original);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn undo_skips_files_changed_since() {
        let dir = temp_dir();
        let song = dir.join("song.mp3");
        write_mp3(&song);
        let undo = EditUndo::default();
        let edit: MetadataEdit = serde_json::from_str(r#"{"album":"X"}"#).unwrap();
        assert!(edit_files(&dir, &undo, &[song.clone()], &edit).is_empty());

        std::thread::sleep(std::time::Duration::from_millis(20));
        let edit: MetadataEdit = serde_json::from_str(r#"{"album":"Changed elsewhere"}"#).unwrap();
        write_tags(&song, FileType::Mpeg, &edit, &None).unwrap();

        assert_eq!(undo_edit(&dir, &undo), vec![song.clone()]);
        assert_eq!(read(&song).album().as_deref(), Some("Changed elsewhere"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cover_is_replaced_and_removed() {
        // A 1×1 PNG.
        const PNG: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1,
            0x08, 0x06, 0, 0, 0, 0x1F, 0x15, 0xC4, 0x89, 0, 0, 0, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0, 0x01,
            0, 0, 0x05, 0, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let dir = temp_dir();
        let song = dir.join("song.mp3");
        write_mp3(&song);
        let undo = EditUndo::default();

        let image = base64::engine::general_purpose::STANDARD.encode(PNG);
        let edit = MetadataEdit { cover: Some(Some(image)), ..Default::default() };
        assert!(edit_files(&dir, &undo, &[song.clone()], &edit).is_empty());
        let tag = read(&song);
        assert_eq!(tag.pictures().len(), 1);
        assert_eq!(tag.pictures()[0].data(), PNG);
        assert_eq!(tag.title().as_deref(), Some("Old"), "other fields are kept");

        let edit = MetadataEdit { cover: Some(None), ..Default::default() };
        assert!(edit_files(&dir, &undo, &[song.clone()], &edit).is_empty());
        assert!(read(&song).pictures().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn absent_fields_are_kept_and_null_clears() {
        let dir = temp_dir();
        let song = dir.join("song.mp3");
        write_mp3(&song);
        let undo = EditUndo::default();
        let edit: MetadataEdit = serde_json::from_str(r#"{"album":"Kept"}"#).unwrap();
        assert!(edit_files(&dir, &undo, &[song.clone()], &edit).is_empty());
        let edit: MetadataEdit = serde_json::from_str(r#"{"title":null}"#).unwrap();
        assert!(edit_files(&dir, &undo, &[song.clone()], &edit).is_empty());
        let tag = read(&song);
        assert_eq!(tag.title(), None);
        assert_eq!(tag.album().as_deref(), Some("Kept"));
        let _ = fs::remove_dir_all(&dir);
    }
}
