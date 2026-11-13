use super::{with_library, StoreState};
use crate::db::search::SearchHit;
use crate::store::StoreError;
use tauri::State;

/// Tracks matching a search box query, best first, with how each matched.
#[tauri::command]
pub(crate) async fn search_tracks(
    state: State<'_, StoreState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, StoreError> {
    with_library(&state, |library| {
        let db = library
            .db()
            .ok_or_else(|| StoreError::Invalid("library index is unavailable".to_owned()))?;
        db.search(&query, limit.unwrap_or(100))
            .map_err(|err| StoreError::Invalid(format!("search failed: {err}")))
    })
}
