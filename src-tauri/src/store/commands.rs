//! Tauri commands over the open library's `.aivys/` store. Track paths may be
//! passed as absolute paths or as library-relative keys (`Track.relPath`).
//!
//! Commands are `async` so the file work runs off the UI thread.

use super::conflicts::ConflictReport;
use super::events::{self, EventKind, TrackStats};
use super::playlists::{self, PlaylistView, SmartRules, SortSpec};
use super::settings::{self, LibrarySettings};
use crate::artists::ArtistRules;
use super::tags::{self, TagDef};
use super::{conflicts, Store, StoreError};
use crate::db::search::SearchHit;
use crate::db::LibraryDb;
use crate::library::{rescan_library, scan_lock};
use crate::metadata::{self, EditUndo, MetadataEdit};
use crate::track::Track;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Manager, State};

/// The currently open library: its `.aivys/` store and, when it could be
/// opened, its local index.
pub(crate) struct Library {
    store: Store,
    db: Option<LibraryDb>,
}

impl Library {
    /// The index, synced with the journals on disk (which a sync tool may have
    /// changed since the last call). `None` if the index is unavailable.
    fn synced_db(&mut self) -> Option<&LibraryDb> {
        let db = self.db.as_mut()?;
        match db.sync_events(&self.store) {
            Ok(_) => Some(db),
            Err(err) => {
                log::warn!("cannot sync journals into the index: {err}");
                None
            }
        }
    }
}

#[derive(Default)]
pub(crate) struct StoreState(Mutex<Option<Library>>);

/// Open the store for `base_path` and make it current. Called by the scan, so
/// the store always matches the library on screen.
pub(crate) fn open_store(app: &tauri::AppHandle, base_path: &Path) -> Result<(), StoreError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| StoreError::Invalid(format!("no app-data directory: {err}")))?;
    let store = Store::open(base_path, &app_data)?;
    let db = match LibraryDb::open(&app_data, base_path) {
        Ok(db) => Some(db),
        Err(err) => {
            log::warn!("cannot open library index: {err}");
            None
        }
    };
    let mut library = Library { store, db };
    library.synced_db();

    let state = app.state::<StoreState>();
    let mut guard = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(library);
    Ok(())
}

fn with_library<R>(
    state: &State<'_, StoreState>,
    f: impl FnOnce(&mut Library) -> Result<R, StoreError>,
) -> Result<R, StoreError> {
    let mut guard = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    f(guard.as_mut().ok_or(StoreError::NotOpen)?)
}

fn with_store<R>(
    state: &State<'_, StoreState>,
    f: impl FnOnce(&mut Store) -> Result<R, StoreError>,
) -> Result<R, StoreError> {
    with_library(state, |library| f(&mut library.store))
}

fn record(state: &State<'_, StoreState>, path: &str, kind: EventKind, value: Option<i64>, tag_id: Option<String>) -> Result<(), StoreError> {
    with_store(state, |store| {
        let key = store.track_key(path)?;
        events::append(store, &key, kind, value, tag_id)
    })
}

// ---- Library settings ----

#[tauri::command]
pub(crate) async fn get_library_settings(state: State<'_, StoreState>) -> Result<LibrarySettings, StoreError> {
    with_store(&state, |store| settings::load(store))
}

/// Save how artist tags are split; a rescan applies it.
#[tauri::command]
pub(crate) async fn set_artist_rules(state: State<'_, StoreState>, rules: ArtistRules) -> Result<LibrarySettings, StoreError> {
    with_store(&state, |store| settings::set_artist_rules(store, rules))
}

/// The built-in artist rules, for "reset to defaults".
#[tauri::command]
pub(crate) async fn default_artist_rules() -> ArtistRules {
    ArtistRules::default()
}

/// The open library's artist rules, for the scan (defaults when unreadable).
pub(crate) fn artist_rules(app: &tauri::AppHandle) -> ArtistRules {
    let state = app.state::<StoreState>();
    with_store(&state, |store| settings::load(store).map(|settings| settings.artists)).unwrap_or_else(|err| {
        log::warn!("cannot read the artist rules: {err}");
        ArtistRules::default()
    })
}

#[tauri::command]
pub(crate) async fn resolve_conflicts(state: State<'_, StoreState>) -> Result<ConflictReport, StoreError> {
    with_store(&state, conflicts::resolve)
}

// ---- Per-track events ----

#[tauri::command]
pub(crate) async fn record_play(state: State<'_, StoreState>, path: String) -> Result<(), StoreError> {
    record(&state, &path, EventKind::Play, None, None)
}

#[tauri::command]
pub(crate) async fn record_complete(state: State<'_, StoreState>, path: String) -> Result<(), StoreError> {
    record(&state, &path, EventKind::Complete, None, None)
}

/// `rating` is 1–5, or 0 to clear.
#[tauri::command]
pub(crate) async fn set_rating(state: State<'_, StoreState>, path: String, rating: u8) -> Result<(), StoreError> {
    if rating > 5 {
        return Err(StoreError::Invalid(format!("rating must be 0-5: {rating}")));
    }
    record(&state, &path, EventKind::Rating, Some(i64::from(rating)), None)
}

#[tauri::command]
pub(crate) async fn set_favorite(state: State<'_, StoreState>, path: String, favorite: bool) -> Result<(), StoreError> {
    let kind = if favorite { EventKind::Favorite } else { EventKind::Unfavorite };
    record(&state, &path, kind, None, None)
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn set_track_tag(
    state: State<'_, StoreState>,
    path: String,
    tag_id: String,
    assigned: bool,
) -> Result<(), StoreError> {
    with_store(&state, |store| {
        if assigned && !tags::list(store)?.iter().any(|tag| tag.id == tag_id) {
            return Err(StoreError::NotFound(format!("tag {tag_id}")));
        }
        let key = store.track_key(&path)?;
        let kind = if assigned { EventKind::Tag } else { EventKind::Untag };
        events::append(store, &key, kind, None, Some(tag_id))
    })
}

/// Derived state straight from the journals; used when the index is unavailable.
fn stats_from_journals(store: &Store) -> Result<HashMap<String, TrackStats>, StoreError> {
    let deleted_tags = tags::deleted_ids(store).unwrap_or_else(|err| {
        log::warn!("cannot read tags.json: {err}");
        Default::default()
    });
    Ok(events::derive(&events::read_all(store)?, &deleted_tags))
}

/// Derived state of every track that has any, keyed by relative path.
#[tauri::command]
pub(crate) async fn get_track_stats(state: State<'_, StoreState>) -> Result<HashMap<String, TrackStats>, StoreError> {
    with_library(&state, |library| {
        if let Some(db) = library.synced_db() {
            match db.track_stats() {
                Ok(stats) => return Ok(stats),
                Err(err) => log::warn!("index query failed: {err}"),
            }
        }
        stats_from_journals(&library.store)
    })
}

// ---- Track files ----

/// Move track files to the system trash. Their `.aivys` data is kept: playlist
/// entries show as missing, and everything is back if a file is restored.
#[tauri::command]
pub(crate) async fn delete_tracks(state: State<'_, StoreState>, paths: Vec<String>) -> Result<(), StoreError> {
    with_store(&state, |store| {
        let mut files = Vec::with_capacity(paths.len());
        for path in &paths {
            let key = store.track_key(path)?;
            // Native separators: the Windows shell rejects "/" in paths.
            let file = key.split('/').fold(store.root().to_path_buf(), |dir, part| dir.join(part));
            if !file.is_file() {
                return Err(StoreError::NotFound(format!("track {key}")));
            }
            files.push(file);
        }
        move_to_trash(&files)
    })
}

// ---- Tag editing ----

/// The library after an edit (or its undo), and the files left unchanged
/// ("name: reason" for an edit).
#[derive(serde::Serialize)]
pub(crate) struct EditResult {
    tracks: Vec<Track>,
    failed: Vec<String>,
}

fn file_name(path: &Path) -> String {
    path.file_name().map_or_else(|| path.to_string_lossy(), |name| name.to_string_lossy()).into_owned()
}

/// Run `edit` on the open library's files under the scan lock, then rescan it.
async fn change_files(
    app: tauri::AppHandle,
    edit: impl FnOnce(&Path) -> Vec<String> + Send + 'static,
) -> Result<EditResult, StoreError> {
    tauri::async_runtime::spawn_blocking(move || {
        let _scanning = scan_lock();
        let root = with_store(&app.state::<StoreState>(), |store| Ok(store.root().to_path_buf()))?;
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|err| StoreError::Invalid(format!("no app-data directory: {err}")))?;
        let failed = edit(&app_data);
        Ok(EditResult { tracks: rescan_library(&app, &root), failed })
    })
    .await
    .map_err(|err| StoreError::Invalid(err.to_string()))?
}

/// Write `edit` into the tags of the tracks at `paths`; undo puts them back.
#[tauri::command]
pub(crate) async fn edit_tracks(app: tauri::AppHandle, paths: Vec<String>, edit: MetadataEdit) -> Result<EditResult, StoreError> {
    let files = with_store(&app.state::<StoreState>(), |store| {
        paths
            .iter()
            .map(|path| {
                let key = store.track_key(path)?;
                let file = key.split('/').fold(store.root().to_path_buf(), |dir, part| dir.join(part));
                if file.is_file() { Ok(file) } else { Err(StoreError::NotFound(format!("track {key}"))) }
            })
            .collect::<Result<Vec<_>, _>>()
    })?;
    let handle = app.clone();
    change_files(app, move |app_data| {
        metadata::edit_files(app_data, &handle.state::<EditUndo>(), &files, &edit)
            .into_iter()
            .map(|(file, reason)| format!("{}: {reason}", file_name(&file)))
            .collect()
    })
    .await
}

/// Put back the tags the last edit replaced (files changed since are kept).
#[tauri::command]
pub(crate) async fn undo_track_edit(app: tauri::AppHandle) -> Result<EditResult, StoreError> {
    let handle = app.clone();
    change_files(app, move |app_data| {
        metadata::undo_edit(app_data, &handle.state::<EditUndo>()).iter().map(|file| file_name(file)).collect()
    })
    .await
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn move_to_trash(files: &[std::path::PathBuf]) -> Result<(), StoreError> {
    trash::delete_all(files).map_err(|err| StoreError::Invalid(format!("cannot move to the trash: {err}")))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn move_to_trash(_files: &[std::path::PathBuf]) -> Result<(), StoreError> {
    Err(StoreError::Invalid("deleting tracks is not supported on this platform yet".to_owned()))
}

// ---- User tags ----

#[tauri::command]
pub(crate) async fn list_tags(state: State<'_, StoreState>) -> Result<Vec<TagDef>, StoreError> {
    with_store(&state, |store| tags::list(store))
}

#[tauri::command]
pub(crate) async fn create_tag(state: State<'_, StoreState>, name: String, color: String) -> Result<TagDef, StoreError> {
    with_store(&state, |store| tags::create(store, &name, &color))
}

#[tauri::command]
pub(crate) async fn update_tag(
    state: State<'_, StoreState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> Result<TagDef, StoreError> {
    with_store(&state, |store| tags::update(store, &id, name.as_deref(), color.as_deref()))
}

#[tauri::command]
pub(crate) async fn delete_tag(state: State<'_, StoreState>, id: String) -> Result<(), StoreError> {
    with_store(&state, |store| tags::delete(store, &id))
}

// ---- Playlists ----

#[tauri::command]
pub(crate) async fn list_playlists(state: State<'_, StoreState>) -> Result<Vec<PlaylistView>, StoreError> {
    with_store(&state, |store| playlists::list(store))
}

#[tauri::command]
pub(crate) async fn create_manual_playlist(state: State<'_, StoreState>, name: String) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::create_manual(store, &name))
}

#[tauri::command]
pub(crate) async fn create_smart_playlist(
    state: State<'_, StoreState>,
    name: String,
    rules: SmartRules,
) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::create_smart(store, &name, rules))
}

#[tauri::command]
pub(crate) async fn rename_playlist(state: State<'_, StoreState>, id: String, name: String) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::rename(store, &id, &name))
}

#[tauri::command]
pub(crate) async fn set_playlist_sort(state: State<'_, StoreState>, id: String, sort: SortSpec) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::set_sort(store, &id, sort))
}

#[tauri::command]
pub(crate) async fn set_playlist_rules(
    state: State<'_, StoreState>,
    id: String,
    rules: SmartRules,
) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::set_rules(store, &id, rules))
}

#[tauri::command]
pub(crate) async fn add_to_playlist(
    state: State<'_, StoreState>,
    id: String,
    paths: Vec<String>,
) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| {
        let keys = paths
            .iter()
            .map(|path| store.track_key(path))
            .collect::<Result<Vec<_>, _>>()?;
        playlists::add_tracks(store, &id, keys)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn remove_from_playlist(
    state: State<'_, StoreState>,
    id: String,
    item_ids: Vec<String>,
) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::remove_items(store, &id, item_ids))
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn reorder_playlist(
    state: State<'_, StoreState>,
    id: String,
    item_ids: Vec<String>,
) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::reorder(store, &id, item_ids))
}

#[tauri::command]
pub(crate) async fn delete_playlist(state: State<'_, StoreState>, id: String) -> Result<(), StoreError> {
    with_store(&state, |store| playlists::delete(store, &id))
}

/// Copy the image at `source_path` in as the playlist's cover.
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn set_playlist_cover(
    state: State<'_, StoreState>,
    id: String,
    source_path: String,
) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::set_cover(store, &id, Path::new(&source_path)))
}

#[tauri::command]
pub(crate) async fn clear_playlist_cover(state: State<'_, StoreState>, id: String) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::clear_cover(store, &id))
}

// ---- Smart playlist evaluation ----

fn smart_tracks(library: &mut Library, rules: &SmartRules) -> Result<Vec<String>, StoreError> {
    let db = library
        .synced_db()
        .ok_or_else(|| StoreError::Invalid("library index is unavailable".to_owned()))?;
    db.smart_playlist(rules)
        .map_err(|err| StoreError::Invalid(format!("smart playlist query failed: {err}")))
}

/// Relative paths of the tracks a smart playlist currently contains.
#[tauri::command]
pub(crate) async fn get_smart_playlist_tracks(state: State<'_, StoreState>, id: String) -> Result<Vec<String>, StoreError> {
    with_library(&state, |library| {
        let rules = playlists::get(&library.store, &id)?
            .playlist
            .rules
            .ok_or_else(|| StoreError::Invalid("not a smart playlist".to_owned()))?;
        smart_tracks(library, &rules)
    })
}

/// Evaluate rules without saving them, e.g. for a live preview in the editor.
#[tauri::command]
pub(crate) async fn preview_smart_playlist(
    state: State<'_, StoreState>,
    rules: SmartRules,
) -> Result<Vec<String>, StoreError> {
    with_library(&state, |library| smart_tracks(library, &rules))
}

// ---- Search ----

/// Tracks matching a search box query, best first, with how each matched.
#[tauri::command]
pub(crate) async fn search_tracks(
    state: State<'_, StoreState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, StoreError> {
    with_library(&state, |library| {
        let db = library
            .db
            .as_ref()
            .ok_or_else(|| StoreError::Invalid("library index is unavailable".to_owned()))?;
        db.search(&query, limit.unwrap_or(100))
            .map_err(|err| StoreError::Invalid(format!("search failed: {err}")))
    })
}
