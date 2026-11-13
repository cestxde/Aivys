use super::{with_library, with_store, Library, StoreState};
use crate::store::playlists::{self, PlaylistView, SmartRules, SortSpec};
use crate::store::StoreError;
use tauri::State;

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

/// Give the playlist an image (its bytes, base64) as its cover.
#[tauri::command]
pub(crate) async fn set_playlist_cover(
    state: State<'_, StoreState>,
    id: String,
    data: String,
) -> Result<PlaylistView, StoreError> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|err| StoreError::Invalid(format!("cover is not base64: {err}")))?;
    with_store(&state, |store| playlists::set_cover(store, &id, &bytes))
}

#[tauri::command]
pub(crate) async fn clear_playlist_cover(state: State<'_, StoreState>, id: String) -> Result<PlaylistView, StoreError> {
    with_store(&state, |store| playlists::clear_cover(store, &id))
}

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
