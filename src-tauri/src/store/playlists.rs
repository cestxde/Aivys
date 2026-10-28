use super::fsio::{atomic_write, default_schema_version, now_unix, read_json, write_json, SCHEMA_VERSION};
use super::{new_uuid, validate_uuid, Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

const PLAYLISTS_DIR: &str = "playlists";
const COVERS_DIR: &str = "playlists/covers";
const COVER_EXTENSIONS: [&str; 3] = ["jpg", "png", "webp"];

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PlaylistKind {
    Manual,
    Smart,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SortDir {
    #[default]
    Asc,
    Desc,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SortSpec {
    pub(crate) field: String,
    #[serde(default)]
    pub(crate) dir: SortDir,
}

impl SortSpec {
    fn manual() -> Self {
        SortSpec {
            field: "manual".to_owned(),
            dir: SortDir::Asc,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MatchMode {
    #[default]
    All,
    Any,
}

/// Smart-playlist condition (§8.4.3). `field`/`op` stay strings: unknown ones
/// must be preserved and only fail to match at evaluation time.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Condition {
    pub(crate) field: String,
    pub(crate) op: String,
    pub(crate) value: Value,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmartRules {
    #[serde(rename = "match", default)]
    pub(crate) match_mode: MatchMode,
    #[serde(default)]
    pub(crate) conditions: Vec<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) sort: Option<SortSpec>,
    #[serde(default)]
    pub(crate) limit: Option<u32>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaylistItem {
    pub(crate) id: String,
    pub(crate) path: String,
    #[serde(default)]
    pub(crate) added_at: u64,
    #[serde(default)]
    pub(crate) removed_at: Option<u64>,
    /// Reserved for rename recovery; always null in v1.
    #[serde(default)]
    pub(crate) content_hash: Option<String>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

/// `.aivys/playlists/<id>.json` (§8.4). Manual playlists carry `sort` and
/// `items`, smart ones carry `rules`.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Playlist {
    #[serde(default = "default_schema_version")]
    pub(crate) schema_version: u32,
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(rename = "type")]
    pub(crate) kind: PlaylistKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) sort: Option<SortSpec>,
    #[serde(default)]
    pub(crate) cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) items: Option<Vec<PlaylistItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) rules: Option<SmartRules>,
    #[serde(default)]
    pub(crate) created_at: u64,
    #[serde(default)]
    pub(crate) updated_at: u64,
    #[serde(default)]
    pub(crate) deleted_at: Option<u64>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

/// What the frontend gets: removed items are hidden, read-only is flagged.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaylistView {
    #[serde(flatten)]
    pub(crate) playlist: Playlist,
    pub(crate) read_only: bool,
    /// Absolute path of the cover image, for display.
    pub(crate) cover_path: Option<String>,
}

impl PlaylistView {
    fn new(store: &Store, mut playlist: Playlist, read_only: bool) -> Self {
        if let Some(items) = &mut playlist.items {
            items.retain(|item| item.removed_at.is_none());
        }
        let cover_path = cover_file(store, &playlist).map(|path| path.to_string_lossy().into_owned());
        PlaylistView {
            playlist,
            read_only,
            cover_path,
        }
    }
}

fn file_path(store: &Store, id: &str) -> PathBuf {
    store.path(&format!("{PLAYLISTS_DIR}/{id}.json"))
}

fn load_live(store: &Store, id: &str) -> Result<(Playlist, bool), StoreError> {
    validate_uuid(id)?;
    let loaded = read_json::<Playlist>(&file_path(store, id))?
        .ok_or_else(|| StoreError::NotFound(format!("playlist {id}")))?;
    if loaded.doc.deleted_at.is_some() {
        return Err(StoreError::NotFound(format!("playlist {id}")));
    }
    Ok((loaded.doc, loaded.read_only))
}

pub(crate) fn get(store: &Store, id: &str) -> Result<PlaylistView, StoreError> {
    let (playlist, read_only) = load_live(store, id)?;
    Ok(PlaylistView::new(store, playlist, read_only))
}

/// All live playlists, oldest first. Unreadable files are skipped.
pub(crate) fn list(store: &Store) -> Result<Vec<PlaylistView>, StoreError> {
    let entries = match std::fs::read_dir(store.path(PLAYLISTS_DIR)) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.into()),
    };

    let mut playlists = Vec::new();
    for path in entries.filter_map(|entry| entry.ok()).map(|entry| entry.path()) {
        // Only canonical `<uuid>.json`; this skips temp files and conflict copies.
        let is_playlist = path.extension().is_some_and(|ext| ext == "json")
            && path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .is_some_and(|stem| uuid::Uuid::parse_str(stem).is_ok());
        if !is_playlist {
            continue;
        }
        match read_json::<Playlist>(&path) {
            Ok(Some(loaded)) if loaded.doc.deleted_at.is_none() => {
                playlists.push(PlaylistView::new(store, loaded.doc, loaded.read_only))
            }
            Ok(_) => {}
            Err(err) => log::warn!("skipping playlist {}: {err}", path.display()),
        }
    }

    playlists.sort_by(|a, b| {
        a.playlist
            .created_at
            .cmp(&b.playlist.created_at)
            .then_with(|| a.playlist.name.cmp(&b.playlist.name))
    });
    Ok(playlists)
}

fn clean_name(name: &str) -> Result<String, StoreError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(StoreError::Invalid("playlist name is empty".to_owned()));
    }
    Ok(name.to_owned())
}

fn create(store: &Store, name: &str, kind: PlaylistKind, rules: Option<SmartRules>) -> Result<PlaylistView, StoreError> {
    let now = now_unix();
    let manual = kind == PlaylistKind::Manual;
    let playlist = Playlist {
        schema_version: SCHEMA_VERSION,
        id: new_uuid(),
        name: clean_name(name)?,
        kind,
        sort: manual.then(SortSpec::manual),
        cover: None,
        items: manual.then(Vec::new),
        rules,
        created_at: now,
        updated_at: now,
        deleted_at: None,
        extra: Map::new(),
    };
    write_json(&file_path(store, &playlist.id), &playlist)?;
    Ok(PlaylistView::new(store, playlist, false))
}

pub(crate) fn create_manual(store: &Store, name: &str) -> Result<PlaylistView, StoreError> {
    create(store, name, PlaylistKind::Manual, None)
}

pub(crate) fn create_smart(store: &Store, name: &str, rules: SmartRules) -> Result<PlaylistView, StoreError> {
    create(store, name, PlaylistKind::Smart, Some(rules))
}

/// Read the playlist fresh from disk, apply `change`, bump `updatedAt` and
/// write it back.
fn modify(
    store: &Store,
    id: &str,
    change: impl FnOnce(&mut Playlist, u64) -> Result<(), StoreError>,
) -> Result<PlaylistView, StoreError> {
    let path = file_path(store, id);
    let (mut playlist, read_only) = load_live(store, id)?;
    if read_only {
        return Err(StoreError::NewerSchema(path));
    }
    let now = now_unix();
    change(&mut playlist, now)?;
    playlist.schema_version = SCHEMA_VERSION;
    playlist.updated_at = now;
    write_json(&path, &playlist)?;
    Ok(PlaylistView::new(store, playlist, false))
}

fn manual_items(playlist: &mut Playlist) -> Result<&mut Vec<PlaylistItem>, StoreError> {
    if playlist.kind != PlaylistKind::Manual {
        return Err(StoreError::Invalid("not a manual playlist".to_owned()));
    }
    Ok(playlist.items.get_or_insert_with(Vec::new))
}

pub(crate) fn rename(store: &Store, id: &str, name: &str) -> Result<PlaylistView, StoreError> {
    let name = clean_name(name)?;
    modify(store, id, |playlist, _| {
        playlist.name = name;
        Ok(())
    })
}

pub(crate) fn set_sort(store: &Store, id: &str, sort: SortSpec) -> Result<PlaylistView, StoreError> {
    modify(store, id, |playlist, _| {
        if playlist.kind != PlaylistKind::Manual {
            return Err(StoreError::Invalid("smart playlists sort via rules".to_owned()));
        }
        playlist.sort = Some(sort);
        Ok(())
    })
}

pub(crate) fn set_rules(store: &Store, id: &str, rules: SmartRules) -> Result<PlaylistView, StoreError> {
    modify(store, id, |playlist, _| {
        if playlist.kind != PlaylistKind::Smart {
            return Err(StoreError::Invalid("not a smart playlist".to_owned()));
        }
        playlist.rules = Some(rules);
        Ok(())
    })
}

/// Append tracks (already normalized track keys) to a manual playlist.
pub(crate) fn add_tracks(store: &Store, id: &str, paths: Vec<String>) -> Result<PlaylistView, StoreError> {
    modify(store, id, |playlist, now| {
        let items = manual_items(playlist)?;
        items.extend(paths.into_iter().map(|path| PlaylistItem {
            id: new_uuid(),
            path,
            added_at: now,
            removed_at: None,
            content_hash: None,
            extra: Map::new(),
        }));
        Ok(())
    })
}

/// Tombstone items (`removedAt`); they stay in the file for merging.
pub(crate) fn remove_items(store: &Store, id: &str, item_ids: Vec<String>) -> Result<PlaylistView, StoreError> {
    modify(store, id, |playlist, now| {
        let items = manual_items(playlist)?;
        for item_id in item_ids {
            let item = items
                .iter_mut()
                .find(|item| item.id == item_id)
                .ok_or_else(|| StoreError::NotFound(format!("playlist item {item_id}")))?;
            item.removed_at.get_or_insert(now);
        }
        Ok(())
    })
}

/// Set the order of a manual playlist. `item_ids` must list every live item
/// exactly once; removed items keep their place at the end.
pub(crate) fn reorder(store: &Store, id: &str, item_ids: Vec<String>) -> Result<PlaylistView, StoreError> {
    modify(store, id, |playlist, _| {
        let items = manual_items(playlist)?;
        let live: HashSet<&str> = items
            .iter()
            .filter(|item| item.removed_at.is_none())
            .map(|item| item.id.as_str())
            .collect();
        let requested: HashSet<&str> = item_ids.iter().map(String::as_str).collect();
        if requested.len() != item_ids.len() || requested != live {
            return Err(StoreError::Invalid(
                "reorder must list every playlist item exactly once".to_owned(),
            ));
        }

        let mut by_id: HashMap<String, PlaylistItem> =
            items.drain(..).map(|item| (item.id.clone(), item)).collect();
        let mut reordered: Vec<PlaylistItem> =
            item_ids.iter().filter_map(|item_id| by_id.remove(item_id)).collect();
        let mut removed: Vec<PlaylistItem> = by_id.into_values().collect();
        removed.sort_by_key(|item| item.removed_at);
        reordered.extend(removed);
        *items = reordered;
        Ok(())
    })
}

/// Tombstone the playlist and drop its cover image.
pub(crate) fn delete(store: &Store, id: &str) -> Result<(), StoreError> {
    modify(store, id, |playlist, now| {
        playlist.deleted_at = Some(now);
        playlist.cover = None;
        Ok(())
    })?;
    remove_cover_files(store, id, None);
    Ok(())
}

/// Copy an image into `playlists/covers/<id>.<ext>` and reference it.
/// Give the playlist the image `bytes` as its cover; its type is taken from
/// the bytes (a picked file's name may have no extension, as on Android).
pub(crate) fn set_cover(store: &Store, id: &str, bytes: &[u8]) -> Result<PlaylistView, StoreError> {
    if load_live(store, id)?.1 {
        return Err(StoreError::NewerSchema(file_path(store, id)));
    }

    let ext = super::covers::image_extension(bytes)
        .ok_or_else(|| StoreError::Invalid("cover must be a jpg, png or webp image".to_owned()))?;

    let file_name = format!("{id}.{ext}");
    atomic_write(&store.path(&format!("{COVERS_DIR}/{file_name}")), bytes)?;

    let view = modify(store, id, |playlist, _| {
        playlist.cover = Some(format!("covers/{file_name}"));
        Ok(())
    })?;
    remove_cover_files(store, id, Some(&file_name));
    Ok(view)
}

pub(crate) fn clear_cover(store: &Store, id: &str) -> Result<PlaylistView, StoreError> {
    let view = modify(store, id, |playlist, _| {
        playlist.cover = None;
        Ok(())
    })?;
    remove_cover_files(store, id, None);
    Ok(view)
}

/// Absolute path of a playlist's cover image, if it has one.
fn cover_file(store: &Store, playlist: &Playlist) -> Option<PathBuf> {
    let cover = playlist.cover.as_deref()?;
    // The reference is relative to `playlists/` and must stay inside covers/.
    let name = cover.strip_prefix("covers/")?;
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return None;
    }
    Some(store.path(&format!("{COVERS_DIR}/{name}")))
}

/// Delete `covers/<id>.*` files other than `keep`.
fn remove_cover_files(store: &Store, id: &str, keep: Option<&str>) {
    for ext in COVER_EXTENSIONS {
        let name = format!("{id}.{ext}");
        if keep == Some(name.as_str()) {
            continue;
        }
        let path = store.path(&format!("{COVERS_DIR}/{name}"));
        if path.exists() {
            if let Err(err) = std::fs::remove_file(&path) {
                log::warn!("cannot remove {}: {err}", path.display());
            }
        }
    }
}

/// After a merge, remove cover images the playlist no longer references.
pub(crate) fn cleanup_orphan_covers(store: &Store, playlist: &Playlist) {
    let keep = playlist
        .cover
        .as_deref()
        .and_then(|cover| cover.strip_prefix("covers/"));
    remove_cover_files(store, &playlist.id, keep);
}

fn min_removed(a: Option<u64>, b: Option<u64>) -> Option<u64> {
    match (a, b) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, None) => a,
        (None, b) => b,
    }
}

/// Merge strategy (§8.4): the newer document wins for everything except
/// manual items, which are a union by id where removal wins. The newer
/// document decides the order; items only the older one knows are appended.
pub(crate) fn merge(a: Playlist, b: Playlist) -> Playlist {
    let (mut newer, older) = if b.updated_at > a.updated_at { (b, a) } else { (a, b) };
    if newer.kind != PlaylistKind::Manual || older.kind != PlaylistKind::Manual {
        return newer;
    }

    let older_items = older.items.unwrap_or_default();
    let older_removed: HashMap<&str, Option<u64>> = older_items
        .iter()
        .map(|item| (item.id.as_str(), item.removed_at))
        .collect();

    let mut items = newer.items.take().unwrap_or_default();
    for item in &mut items {
        if let Some(removed_at) = older_removed.get(item.id.as_str()) {
            item.removed_at = min_removed(item.removed_at, *removed_at);
        }
    }

    let known: HashSet<String> = items.iter().map(|item| item.id.clone()).collect();
    items.extend(older_items.iter().filter(|item| !known.contains(&item.id)).cloned());

    newer.items = Some(items);
    newer
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_support::TempLibrary;

    fn item(id: &str, removed_at: Option<u64>) -> PlaylistItem {
        PlaylistItem {
            id: id.to_owned(),
            path: format!("{id}.flac"),
            added_at: 1,
            removed_at,
            content_hash: None,
            extra: Map::new(),
        }
    }

    fn manual(name: &str, updated_at: u64, items: Vec<PlaylistItem>) -> Playlist {
        Playlist {
            schema_version: 1,
            id: "3b2e0000-0000-4000-8000-000000000000".to_owned(),
            name: name.to_owned(),
            kind: PlaylistKind::Manual,
            sort: Some(SortSpec::manual()),
            cover: None,
            items: Some(items),
            rules: None,
            created_at: 1,
            updated_at,
            deleted_at: None,
            extra: Map::new(),
        }
    }

    fn ids(playlist: &Playlist) -> Vec<(String, Option<u64>)> {
        playlist
            .items
            .as_ref()
            .unwrap()
            .iter()
            .map(|item| (item.id.clone(), item.removed_at))
            .collect()
    }

    #[test]
    fn merge_unions_items_and_removal_wins() {
        let a = manual("Old", 10, vec![item("1", None), item("2", None), item("3", None)]);
        let b = manual("New", 20, vec![item("2", None), item("1", Some(15)), item("4", None)]);

        let merged = merge(a, b);
        assert_eq!(merged.name, "New");
        assert_eq!(
            ids(&merged),
            vec![
                ("2".to_owned(), None),
                ("1".to_owned(), Some(15)),
                ("4".to_owned(), None),
                ("3".to_owned(), None),
            ]
        );

        // An older copy that still has the item live does not resurrect it.
        let a = manual("A", 30, vec![item("1", None)]);
        let b = manual("B", 20, vec![item("1", Some(15))]);
        assert_eq!(ids(&merge(a, b)), vec![("1".to_owned(), Some(15))]);
    }

    #[test]
    fn tombstone_wins_unless_edited_later() {
        let mut deleted = manual("Gone", 20, vec![]);
        deleted.deleted_at = Some(20);
        let live = manual("Live", 10, vec![]);
        assert_eq!(merge(live.clone(), deleted.clone()).deleted_at, Some(20));

        let edited = manual("Edited", 30, vec![]);
        assert_eq!(merge(deleted, edited).deleted_at, None);
    }

    #[test]
    fn manual_playlist_lifecycle() {
        let lib = TempLibrary::new();
        let store = lib.open();

        let created = create_manual(&store, "Evening").unwrap();
        let id = created.playlist.id.clone();

        let view = add_tracks(&store, &id, vec!["a.flac".into(), "b.flac".into(), "c.flac".into()]).unwrap();
        let item_ids: Vec<String> = view.playlist.items.unwrap().iter().map(|i| i.id.clone()).collect();

        remove_items(&store, &id, vec![item_ids[1].clone()]).unwrap();
        let view = reorder(&store, &id, vec![item_ids[2].clone(), item_ids[0].clone()]).unwrap();
        let paths: Vec<String> = view.playlist.items.unwrap().into_iter().map(|i| i.path).collect();
        assert_eq!(paths, vec!["c.flac", "a.flac"]);

        // The removed item is still in the file as a tombstone.
        let on_disk = read_json::<Playlist>(&file_path(&store, &id)).unwrap().unwrap().doc;
        assert_eq!(on_disk.items.unwrap().len(), 3);

        assert!(reorder(&store, &id, vec![item_ids[0].clone()]).is_err());

        assert_eq!(list(&store).unwrap().len(), 1);
        delete(&store, &id).unwrap();
        assert!(list(&store).unwrap().is_empty());
        assert!(get(&store, &id).is_err());
        assert!(file_path(&store, &id).exists());
    }

    #[test]
    fn newer_schema_is_read_only() {
        let lib = TempLibrary::new();
        let store = lib.open();
        let id = create_manual(&store, "Mine").unwrap().playlist.id;

        let path = file_path(&store, &id);
        let mut value: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        value["schemaVersion"] = 99.into();
        value["futureField"] = "keep me".into();
        std::fs::write(&path, value.to_string()).unwrap();

        assert!(get(&store, &id).unwrap().read_only);
        assert!(matches!(rename(&store, &id, "X"), Err(StoreError::NewerSchema(_))));
        assert!(std::fs::read_to_string(&path).unwrap().contains("futureField"));
    }
}
