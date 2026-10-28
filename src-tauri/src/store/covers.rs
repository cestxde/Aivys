use super::fsio::{atomic_write, default_schema_version, now_unix, read_json_or_default, write_json, SCHEMA_VERSION};
use super::{new_uuid, Store, StoreError};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;

pub(crate) const FILE: &str = "covers.json";

/// Where the images are, inside `.aivys/`.
const DIR: &str = "covers";

/// What can have a cover of its own here.
const KINDS: [&str; 2] = ["album", "artist"];

/// `.aivys/covers.json`: covers the user chose for albums and artists, over
/// the ones their tracks have (§8.8).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CoversDoc {
    #[serde(default = "default_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default)]
    pub(crate) covers: Vec<CoverDef>,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

impl Default for CoversDoc {
    fn default() -> Self {
        CoversDoc {
            schema_version: SCHEMA_VERSION,
            covers: Vec::new(),
            updated_at: 0,
            extra: Map::new(),
        }
    }
}

/// An album's or artist's cover, by its kind and key (as pins have them):
/// `file` is the image's name in `.aivys/covers/`. Going back to the tracks'
/// cover keeps the entry as a tombstone.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CoverDef {
    pub(crate) kind: String,
    pub(crate) key: String,
    #[serde(default)]
    pub(crate) file: Option<String>,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(default)]
    pub(crate) deleted_at: Option<u64>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

impl CoverDef {
    fn is(&self, kind: &str, key: &str) -> bool {
        self.kind == kind && self.key == key
    }
}

/// A cover as the app shows it: the image's absolute path.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GroupCover {
    pub(crate) kind: String,
    pub(crate) key: String,
    pub(crate) path: PathBuf,
}

/// The image's path for a `file` name, if it is a plain name in `covers/`.
fn image_path(store: &Store, file: &str) -> Option<PathBuf> {
    if file.is_empty() || file.contains(['/', '\\']) || file.contains("..") {
        return None;
    }
    Some(store.path(&format!("{DIR}/{file}")))
}

/// The covers set (not taken back since) whose images are there.
pub(crate) fn list(store: &Store) -> Result<Vec<GroupCover>, StoreError> {
    let doc: CoversDoc = read_json_or_default(&store.path(FILE))?.doc;
    Ok(doc
        .covers
        .into_iter()
        .filter(|cover| cover.deleted_at.is_none())
        .filter_map(|cover| {
            let path = image_path(store, cover.file.as_deref()?)?;
            path.is_file().then_some(GroupCover { kind: cover.kind, key: cover.key, path })
        })
        .collect())
}

/// The image type of `bytes`, by their first bytes: its file extension.
pub(crate) fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

/// Give the `kind` thing at `key` the image `data` (base64) as its cover, or
/// with `None` go back to its tracks' cover; returns the covers then.
pub(crate) fn set(store: &Store, kind: &str, key: &str, data: Option<&str>) -> Result<Vec<GroupCover>, StoreError> {
    if !KINDS.contains(&kind) {
        return Err(StoreError::Invalid(format!("a {kind} has no cover of its own")));
    }
    if key.is_empty() {
        return Err(StoreError::Invalid("cover key is empty".to_owned()));
    }
    // A new name each time: a cover shown before is not taken from the cache.
    let file = match data {
        Some(data) => {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|err| StoreError::Invalid(format!("cover is not base64: {err}")))?;
            let ext = image_extension(&bytes)
                .ok_or_else(|| StoreError::Invalid("cover must be a jpg, png or webp image".to_owned()))?;
            let name = format!("{}.{ext}", new_uuid());
            atomic_write(&store.path(&format!("{DIR}/{name}")), &bytes)?;
            Some(name)
        }
        None => None,
    };

    let path = store.path(FILE);
    let mut doc = read_json_or_default::<CoversDoc>(&path)?.writable(&path)?;
    let now = now_unix();
    let deleted_at = if file.is_some() { None } else { Some(now) };
    let mut replaced = None;
    match doc.covers.iter_mut().find(|cover| cover.is(kind, key)) {
        Some(cover) => {
            replaced = std::mem::replace(&mut cover.file, file);
            cover.deleted_at = deleted_at;
            cover.updated_at = now;
        }
        None if file.is_some() => doc.covers.push(CoverDef {
            kind: kind.to_owned(),
            key: key.to_owned(),
            file,
            updated_at: now,
            deleted_at,
            extra: Map::new(),
        }),
        None => {}
    }
    doc.schema_version = SCHEMA_VERSION;
    doc.updated_at = now;
    write_json(&path, &doc)?;
    // Only the image this entry had goes: another device's image may be here
    // before the entry that refers to it.
    if let Some(old) = replaced.as_deref().and_then(|name| image_path(store, name)) {
        let _ = std::fs::remove_file(old);
    }
    list(store)
}

/// Merge strategy: union by kind and key; for a cover on both sides the entry
/// with the greater `updatedAt` wins as a whole.
pub(crate) fn merge(a: CoversDoc, b: CoversDoc) -> CoversDoc {
    let mut merged = CoversDoc {
        updated_at: a.updated_at.max(b.updated_at),
        ..a
    };
    for other in b.covers {
        match merged.covers.iter_mut().find(|cover| cover.is(&other.kind, &other.key)) {
            Some(cover) if other.updated_at > cover.updated_at => *cover = other,
            Some(_) => {}
            None => merged.covers.push(other),
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_support::TempLibrary;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nrest";

    fn encoded(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    fn cover(kind: &str, key: &str, updated_at: u64, deleted_at: Option<u64>) -> CoverDef {
        CoverDef {
            kind: kind.to_owned(),
            key: key.to_owned(),
            file: Some(format!("{key}.png")),
            updated_at,
            deleted_at,
            extra: Map::new(),
        }
    }

    #[test]
    fn set_replace_and_take_back() {
        let lib = TempLibrary::new();
        let store = lib.open();
        assert!(list(&store).unwrap().is_empty());

        let covers = set(&store, "album", "a\u{1f}b", Some(&encoded(PNG))).unwrap();
        assert_eq!(covers.len(), 1);
        let first = covers[0].path.clone();
        assert!(first.is_file());
        assert_eq!(first.extension().unwrap(), "png");

        // A new image replaces the old one, under a new name.
        let covers = set(&store, "album", "a\u{1f}b", Some(&encoded(PNG))).unwrap();
        assert_eq!(covers.len(), 1);
        assert_ne!(covers[0].path, first);
        assert!(!first.exists(), "the replaced image is deleted");

        set(&store, "artist", "x", Some(&encoded(PNG))).unwrap();
        let covers = set(&store, "album", "a\u{1f}b", None).unwrap();
        assert_eq!(covers.len(), 1);
        assert_eq!(covers[0].kind, "artist");
        let raw: CoversDoc = read_json_or_default(&store.path(FILE)).unwrap().doc;
        assert_eq!(raw.covers.len(), 2, "taking a cover back keeps a tombstone");

        assert!(set(&store, "tag", "x", Some(&encoded(PNG))).is_err());
        assert!(set(&store, "album", "", Some(&encoded(PNG))).is_err());
        assert!(set(&store, "album", "y", Some(&encoded(b"not an image"))).is_err());
    }

    #[test]
    fn merge_keeps_the_newest_per_cover() {
        let a = CoversDoc { covers: vec![cover("album", "1", 10, None), cover("album", "x", 10, None)], ..CoversDoc::default() };
        let b = CoversDoc { covers: vec![cover("album", "1", 20, Some(20)), cover("artist", "y", 5, None)], ..CoversDoc::default() };
        let merged = merge(a, b);
        assert_eq!(merged.covers.len(), 3);
        assert_eq!(merged.covers[0].deleted_at, Some(20));
        assert_eq!(merged.covers[1].key, "x");
        assert_eq!(merged.covers[2].kind, "artist");
    }
}
