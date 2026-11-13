use super::{with_store, StoreState};
use crate::store::covers::{self, GroupCover};
use crate::store::pins::{self, PinDef};
use crate::store::StoreError;
use tauri::State;

/// What is pinned to the top of its list.
#[tauri::command]
pub(crate) async fn list_pins(state: State<'_, StoreState>) -> Result<Vec<PinDef>, StoreError> {
    with_store(&state, |store| pins::list(store))
}

/// Pin or unpin a playlist, album, artist or tag (`kind`) by its key; returns what is pinned then.
#[tauri::command]
pub(crate) async fn set_pinned(state: State<'_, StoreState>, kind: String, key: String, pinned: bool) -> Result<Vec<PinDef>, StoreError> {
    with_store(&state, |store| pins::set(store, &kind, &key, pinned))
}

/// The covers chosen for albums and artists.
#[tauri::command]
pub(crate) async fn list_group_covers(state: State<'_, StoreState>) -> Result<Vec<GroupCover>, StoreError> {
    with_store(&state, |store| covers::list(store))
}

/// Give an album or artist (`kind`, by its key) an image (base64) as its
/// cover, or with `null` its tracks' cover again; returns the covers then.
#[tauri::command]
pub(crate) async fn set_group_cover(
    state: State<'_, StoreState>,
    kind: String,
    key: String,
    data: Option<String>,
) -> Result<Vec<GroupCover>, StoreError> {
    with_store(&state, |store| covers::set(store, &kind, &key, data.as_deref()))
}
