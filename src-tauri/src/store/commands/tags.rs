use super::{with_store, StoreState};
use crate::store::tags::{self, CategoryDef, TagDef};
use crate::store::StoreError;
use tauri::State;

#[tauri::command]
pub(crate) async fn list_tags(state: State<'_, StoreState>) -> Result<Vec<TagDef>, StoreError> {
    with_store(&state, |store| tags::list(store))
}

#[tauri::command]
pub(crate) async fn create_tag(
    state: State<'_, StoreState>,
    name: String,
    color: String,
    category_ids: Option<Vec<String>>,
    implies: Option<Vec<String>>,
) -> Result<TagDef, StoreError> {
    with_store(&state, |store| {
        tags::create(
            store,
            &name,
            &color,
            category_ids.as_deref().unwrap_or_default(),
            implies.as_deref().unwrap_or_default(),
        )
    })
}

#[tauri::command]
pub(crate) async fn update_tag(
    state: State<'_, StoreState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
    category_ids: Option<Vec<String>>,
    implies: Option<Vec<String>>,
) -> Result<TagDef, StoreError> {
    with_store(&state, |store| {
        tags::update(
            store,
            &id,
            name.as_deref(),
            color.as_deref(),
            category_ids.as_deref(),
            implies.as_deref(),
        )
    })
}

#[tauri::command]
pub(crate) async fn delete_tag(state: State<'_, StoreState>, id: String) -> Result<(), StoreError> {
    with_store(&state, |store| tags::delete(store, &id))
}

/// Merge tag `from` into `into`: its tracks, categories, pin and smart-playlist
/// rules go to `into`, then `from` is deleted. Returns `into`.
#[tauri::command]
pub(crate) async fn merge_tags(state: State<'_, StoreState>, from: String, into: String) -> Result<TagDef, StoreError> {
    with_store(&state, |store| tags::merge_into(store, &from, &into))
}

#[tauri::command]
pub(crate) async fn list_tag_categories(state: State<'_, StoreState>) -> Result<Vec<CategoryDef>, StoreError> {
    with_store(&state, |store| tags::list_categories(store))
}

#[tauri::command]
pub(crate) async fn create_tag_category(state: State<'_, StoreState>, name: String) -> Result<CategoryDef, StoreError> {
    with_store(&state, |store| tags::create_category(store, &name))
}

#[tauri::command]
pub(crate) async fn rename_tag_category(state: State<'_, StoreState>, id: String, name: String) -> Result<CategoryDef, StoreError> {
    with_store(&state, |store| tags::rename_category(store, &id, &name))
}

#[tauri::command]
pub(crate) async fn delete_tag_category(state: State<'_, StoreState>, id: String) -> Result<(), StoreError> {
    with_store(&state, |store| tags::delete_category(store, &id))
}

/// The categories in the order of `ids`; returns them all, in order.
#[tauri::command]
pub(crate) async fn reorder_tag_categories(state: State<'_, StoreState>, ids: Vec<String>) -> Result<Vec<CategoryDef>, StoreError> {
    with_store(&state, |store| tags::reorder_categories(store, &ids))
}
