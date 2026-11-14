//! Tauri commands over the open library's `.aivys/` store. Track paths may be
//! passed as absolute paths or as library-relative keys (`Track.relPath`).
//!
//! Commands are `async` so the file work runs off the UI thread.

mod covers;
mod events;
mod playlists;
mod search;
mod settings;
mod tags;
mod tracks;

use super::{Store, StoreError};
use crate::db::LibraryDb;
use std::sync::Mutex;
use tauri::{Manager, State};

/// The currently open library: its `.aivys/` store and, when it could be
/// opened, its local index.
pub(crate) struct Library {
    pub(super) store: Store,
    db: Option<LibraryDb>,
}

impl Library {
    /// The index, synced with the journals on disk (which a sync tool may have
    /// changed since the last call). `None` if the index is unavailable.
    pub(super) fn synced_db(&mut self) -> Option<&LibraryDb> {
        let db = self.db.as_mut()?;
        match db.sync_events_if_changed(&self.store) {
            Ok(_) => Some(db),
            Err(err) => {
                log::warn!("cannot sync journals into the index: {err}");
                None
            }
        }
    }

    pub(super) fn db(&self) -> Option<&LibraryDb> {
        self.db.as_ref()
    }
}

#[derive(Default)]
pub(crate) struct StoreState(pub(super) Mutex<Option<Library>>);

/// Open the store for `base_path` and make it current. Called by the scan, so
/// the store always matches the library on screen. Opens the index once here;
/// the scan must reuse this connection (a second open blocks rebuilds on Windows).
pub(crate) fn open_store(app: &tauri::AppHandle, base_path: &std::path::Path) -> Result<(), StoreError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| StoreError::Invalid(format!("no app-data directory: {err}")))?;
    let store = Store::open(base_path, &app_data)?;
    let db = match LibraryDb::open(&app_data, base_path) {
        Ok(db) => Some(db),
        Err(err) => {
            log::warn!(
                "cannot open library index ({err}); search and writing-system filter unavailable until restart"
            );
            None
        }
    };
    let mut library = Library { store, db };
    // In full on opening: whatever the quick checks could miss is corrected here.
    if let Some(db) = library.db.as_mut() {
        if let Err(err) = db.sync_events(&library.store) {
            log::warn!("cannot sync journals into the index: {err}");
        }
    }

    let state = app.state::<StoreState>();
    let mut guard = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(library);
    Ok(())
}

/// Borrow the open library's index. Prefer this over `LibraryDb::open` so the
/// scan and the store share one connection.
pub(crate) fn with_library_index<R>(
    app: &tauri::AppHandle,
    f: impl FnOnce(&mut LibraryDb) -> R,
) -> Option<R> {
    let state = app.state::<StoreState>();
    let mut guard = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    Some(f(guard.as_mut()?.db.as_mut()?))
}

pub(super) fn with_library<R>(
    state: &State<'_, StoreState>,
    f: impl FnOnce(&mut Library) -> Result<R, StoreError>,
) -> Result<R, StoreError> {
    let mut guard = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    f(guard.as_mut().ok_or(StoreError::NotOpen)?)
}

pub(super) fn with_store<R>(
    state: &State<'_, StoreState>,
    f: impl FnOnce(&mut Store) -> Result<R, StoreError>,
) -> Result<R, StoreError> {
    with_library(state, |library| f(&mut library.store))
}

pub(super) fn record(
    state: &State<'_, StoreState>,
    path: &str,
    kind: super::events::EventKind,
    value: Option<i64>,
    tag_id: Option<String>,
) -> Result<(), StoreError> {
    record_at(state, path, kind, value, tag_id, None)
}

/// `at`: when the event happened (Unix seconds), if not just now.
pub(super) fn record_at(
    state: &State<'_, StoreState>,
    path: &str,
    kind: super::events::EventKind,
    value: Option<i64>,
    tag_id: Option<String>,
    at: Option<u64>,
) -> Result<(), StoreError> {
    with_store(state, |store| {
        let key = store.track_key(path)?;
        match at {
            Some(ts) => super::events::append_at(store, &key, kind, value, tag_id, ts),
            None => super::events::append(store, &key, kind, value, tag_id),
        }
    })
}

pub(crate) use covers::{list_group_covers, list_pins, set_group_cover, set_pinned};
pub(crate) use events::{
    get_listen_seconds, get_play_counts, get_track_stats, record_complete, record_listen, record_play,
    set_favorite, set_rating, set_track_artist_link, set_track_hidden, set_track_tag,
};
pub(crate) use playlists::{
    add_to_playlist, clear_playlist_cover, create_manual_playlist, create_smart_playlist, delete_playlist,
    get_smart_playlist_tracks, list_playlists, preview_smart_playlist, remove_from_playlist, rename_playlist,
    reorder_playlist, set_playlist_cover, set_playlist_rules, set_playlist_sort,
};
pub(crate) use search::search_tracks;
pub(crate) use settings::{
    artist_rules, default_artist_rules, get_library_settings, include_mp4, resolve_conflicts, set_artist_rules,
    set_include_mp4, take_opening_conflicts,
};
pub(crate) use tags::{
    create_tag, create_tag_category, delete_tag, delete_tag_category, list_tag_categories, list_tags, merge_tags,
    rename_tag_category, reorder_tag_categories, update_tag,
};
pub(crate) use tracks::{delete_tracks, edit_tracks, edit_tracks_each, rename_tracks, undo_track_edit};
