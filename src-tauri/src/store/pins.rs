use super::fsio::{default_schema_version, now_unix, read_json_or_default, write_json, SCHEMA_VERSION};
use super::{Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub(crate) const FILE: &str = "pins.json";

/// What can be pinned to the top of its list.
const KINDS: [&str; 4] = ["playlist", "album", "artist", "tag"];

/// `.aivys/pins.json`: playlists, albums, artists and tags pinned to the top
/// of their lists (§8.7).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PinsDoc {
    #[serde(default = "default_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default)]
    pub(crate) pins: Vec<PinDef>,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

impl Default for PinsDoc {
    fn default() -> Self {
        PinsDoc {
            schema_version: SCHEMA_VERSION,
            pins: Vec::new(),
            updated_at: 0,
            extra: Map::new(),
        }
    }
}

/// One pinned thing, by its kind and key (a playlist's or tag's id, an
/// artist's or album's key). Unpinning keeps the entry as a tombstone.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PinDef {
    pub(crate) kind: String,
    pub(crate) key: String,
    #[serde(default)]
    pub(crate) pinned_at: u64,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(default)]
    pub(crate) deleted_at: Option<u64>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

impl PinDef {
    fn is(&self, kind: &str, key: &str) -> bool {
        self.kind == kind && self.key == key
    }
}

/// What is pinned (not unpinned since).
pub(crate) fn list(store: &Store) -> Result<Vec<PinDef>, StoreError> {
    let doc: PinsDoc = read_json_or_default(&store.path(FILE))?.doc;
    Ok(doc.pins.into_iter().filter(|pin| pin.deleted_at.is_none()).collect())
}

/// Pin or unpin the `kind` thing at `key`; returns what is pinned then.
pub(crate) fn set(store: &Store, kind: &str, key: &str, pinned: bool) -> Result<Vec<PinDef>, StoreError> {
    if !KINDS.contains(&kind) {
        return Err(StoreError::Invalid(format!("cannot pin a {kind}")));
    }
    if key.is_empty() {
        return Err(StoreError::Invalid("pin key is empty".to_owned()));
    }
    let path = store.path(FILE);
    let mut doc = read_json_or_default::<PinsDoc>(&path)?.writable(&path)?;
    let now = now_unix();
    match doc.pins.iter_mut().find(|pin| pin.is(kind, key)) {
        Some(pin) => {
            if pinned && pin.deleted_at.is_some() {
                pin.pinned_at = now;
            }
            pin.deleted_at = if pinned { None } else { Some(now) };
            pin.updated_at = now;
        }
        None if pinned => doc.pins.push(PinDef {
            kind: kind.to_owned(),
            key: key.to_owned(),
            pinned_at: now,
            updated_at: now,
            deleted_at: None,
            extra: Map::new(),
        }),
        None => {}
    }
    doc.schema_version = SCHEMA_VERSION;
    doc.updated_at = now;
    write_json(&path, &doc)?;
    list(store)
}

/// Merge strategy: union by kind and key; for a pin on both sides the entry
/// with the greater `updatedAt` wins as a whole.
pub(crate) fn merge(a: PinsDoc, b: PinsDoc) -> PinsDoc {
    let mut merged = PinsDoc {
        updated_at: a.updated_at.max(b.updated_at),
        ..a
    };
    for other in b.pins {
        match merged.pins.iter_mut().find(|pin| pin.is(&other.kind, &other.key)) {
            Some(pin) if other.updated_at > pin.updated_at => *pin = other,
            Some(_) => {}
            None => merged.pins.push(other),
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_support::TempLibrary;

    fn pin(kind: &str, key: &str, updated_at: u64, deleted_at: Option<u64>) -> PinDef {
        PinDef {
            kind: kind.to_owned(),
            key: key.to_owned(),
            pinned_at: 1,
            updated_at,
            deleted_at,
            extra: Map::new(),
        }
    }

    #[test]
    fn pin_unpin_and_pin_again() {
        let lib = TempLibrary::new();
        let store = lib.open();
        assert!(list(&store).unwrap().is_empty());

        set(&store, "album", "a\u{1f}b", true).unwrap();
        set(&store, "tag", "t1", true).unwrap();
        let pinned = set(&store, "album", "a\u{1f}b", false).unwrap();
        assert_eq!(pinned.len(), 1);
        assert_eq!(pinned[0].kind, "tag");
        // Unpinning what is not pinned changes nothing.
        assert_eq!(set(&store, "artist", "x", false).unwrap().len(), 1);

        let pinned = set(&store, "album", "a\u{1f}b", true).unwrap();
        assert_eq!(pinned.len(), 2);
        let raw: PinsDoc = read_json_or_default(&store.path(FILE)).unwrap().doc;
        assert_eq!(raw.pins.len(), 2, "pinning again reuses the entry");

        assert!(set(&store, "track", "x", true).is_err());
        assert!(set(&store, "tag", "", true).is_err());
    }

    #[test]
    fn merge_keeps_the_newest_per_pin() {
        let a = PinsDoc { pins: vec![pin("tag", "1", 10, None), pin("album", "x", 10, None)], ..PinsDoc::default() };
        let b = PinsDoc { pins: vec![pin("tag", "1", 20, Some(20)), pin("artist", "y", 5, None)], ..PinsDoc::default() };
        let merged = merge(a, b);
        assert_eq!(merged.pins.len(), 3);
        assert_eq!(merged.pins[0].deleted_at, Some(20));
        assert_eq!(merged.pins[1].key, "x");
        assert_eq!(merged.pins[2].kind, "artist");
    }
}
