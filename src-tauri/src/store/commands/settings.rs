use super::{with_store, StoreState};
use crate::artists::ArtistRules;
use crate::store::conflicts::{self, ConflictReport};
use crate::store::settings::{self, LibrarySettings};
use crate::store::StoreError;
use tauri::{Manager, State};

#[tauri::command]
pub(crate) async fn get_library_settings(state: State<'_, StoreState>) -> Result<LibrarySettings, StoreError> {
    with_store(&state, |store| settings::load(store))
}

/// Save how artist tags are split; a rescan applies it.
#[tauri::command]
pub(crate) async fn set_artist_rules(state: State<'_, StoreState>, rules: ArtistRules) -> Result<LibrarySettings, StoreError> {
    with_store(&state, |store| settings::set_artist_rules(store, rules))
}

/// Whether `.mp4` files are scanned; a rescan applies it.
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn set_include_mp4(state: State<'_, StoreState>, include_mp4: bool) -> Result<LibrarySettings, StoreError> {
    with_store(&state, |store| settings::set_include_mp4(store, include_mp4))
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

/// Whether the open library scans `.mp4` (false when unreadable).
pub(crate) fn include_mp4(app: &tauri::AppHandle) -> bool {
    let state = app.state::<StoreState>();
    with_store(&state, |store| settings::load(store).map(|settings| settings.include_mp4)).unwrap_or_else(|err| {
        log::warn!("cannot read includeMp4: {err}");
        false
    })
}

/// What the conflict pass on opening the library did, once; null if it
/// found nothing (or was asked already).
#[tauri::command]
pub(crate) async fn take_opening_conflicts(state: State<'_, StoreState>) -> Result<Option<ConflictReport>, StoreError> {
    with_store(&state, |store| Ok(store.take_opening_conflicts()))
}

#[tauri::command]
pub(crate) async fn resolve_conflicts(state: State<'_, StoreState>) -> Result<ConflictReport, StoreError> {
    with_store(&state, conflicts::resolve)
}
