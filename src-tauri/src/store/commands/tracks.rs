use super::{with_store, StoreState};
use crate::library::{rescan_library, scan_lock};
use crate::metadata::{self, EditUndo, MetadataEdit};
use crate::store::events;
use crate::store::playlists;
use crate::store::{Store, StoreError};
use crate::track::Track;
use std::path::{Component, Path};
use tauri::{Manager, State};

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

fn resolve_track_files(app: &tauri::AppHandle, paths: &[String]) -> Result<Vec<std::path::PathBuf>, StoreError> {
    with_store(&app.state::<StoreState>(), |store| {
        paths
            .iter()
            .map(|path| {
                let key = store.track_key(path)?;
                let file = key.split('/').fold(store.root().to_path_buf(), |dir, part| dir.join(part));
                if file.is_file() { Ok(file) } else { Err(StoreError::NotFound(format!("track {key}"))) }
            })
            .collect::<Result<Vec<_>, _>>()
    })
}

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

/// File names that cannot be replaced right now (open in another program).
#[tauri::command]
pub(crate) async fn check_tracks_writable(app: tauri::AppHandle, paths: Vec<String>) -> Result<Vec<String>, StoreError> {
    let files = resolve_track_files(&app, &paths)?;
    Ok(files
        .iter()
        .filter(|file| metadata::ensure_replaceable(file).is_err())
        .map(|file| file_name(file))
        .collect())
}

/// Write `edit` into the tags of the tracks at `paths`; undo puts them back.
#[tauri::command]
pub(crate) async fn edit_tracks(app: tauri::AppHandle, paths: Vec<String>, edit: MetadataEdit) -> Result<EditResult, StoreError> {
    let files = resolve_track_files(&app, &paths)?;
    let handle = app.clone();
    change_files(app, move |app_data| {
        metadata::edit_files(app_data, &handle.state::<EditUndo>(), &files, &edit)
            .into_iter()
            .map(|(file, reason)| format!("{}: {reason}", file_name(&file)))
            .collect()
    })
    .await
}

/// One path with its own tag edit (bulk fill-from-name).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackEditSpec {
    path: String,
    edit: MetadataEdit,
}

/// Write a different edit into each track; one undo restores every file.
/// `shared` is merged under each edit (album fields / one cover for all).
#[tauri::command]
pub(crate) async fn edit_tracks_each(
    app: tauri::AppHandle,
    edits: Vec<TrackEditSpec>,
    shared: Option<MetadataEdit>,
) -> Result<EditResult, StoreError> {
    let paths: Vec<String> = edits.iter().map(|item| item.path.clone()).collect();
    let files = resolve_track_files(&app, &paths)?;
    let handle = app.clone();
    change_files(app, move |app_data| {
        let merged: Vec<MetadataEdit> = match &shared {
            Some(shared) => edits.iter().map(|item| metadata::merge_edit(shared, &item.edit)).collect(),
            None => edits.into_iter().map(|item| item.edit).collect(),
        };
        let jobs: Vec<_> = files.iter().zip(merged.iter()).map(|(file, edit)| (file.clone(), edit)).collect();
        metadata::edit_files_each(app_data, &handle.state::<EditUndo>(), &jobs)
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

/// One file rename: current track path (absolute or relative) and the new
/// basename (with the same extension).
#[derive(serde::Deserialize)]
pub(crate) struct RenameSpec {
    path: String,
    name: String,
}

/// Check that `name` is a bare file name that keeps the extension of `old_file`.
fn validate_rename_name(name: &str, old_file: &Path) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("name is empty".to_owned());
    }
    if name.starts_with('.') {
        return Err("name must not start with a dot".to_owned());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("name must not contain a path separator".to_owned());
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return Err("name must not end with a space or a dot".to_owned());
    }
    for ch in name.chars() {
        if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            return Err(format!("name contains a forbidden character ({ch:?})"));
        }
    }

    let path = Path::new(name);
    let mut components = path.components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => {}
        _ => return Err("name must be a bare file name".to_owned()),
    }

    let old_ext = old_file.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    let new_ext = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    if !old_ext.eq_ignore_ascii_case(new_ext) {
        return Err("extension must stay the same".to_owned());
    }
    Ok(name.to_owned())
}

/// Rename track files on disk and rewrite their paths in the journals,
/// playlists and added-at map, then rescan the library.
#[tauri::command]
pub(crate) async fn rename_tracks(app: tauri::AppHandle, renames: Vec<RenameSpec>) -> Result<EditResult, StoreError> {
    tauri::async_runtime::spawn_blocking(move || {
        let _scanning = scan_lock();
        let state = app.state::<StoreState>();
        let root = with_store(&state, |store| Ok(store.root().to_path_buf()))?;
        let failed = with_store(&state, |store| Ok(rename_track_files(store, &renames)))?;
        Ok(EditResult {
            tracks: rescan_library(&app, &root),
            failed,
        })
    })
    .await
    .map_err(|err| StoreError::Invalid(err.to_string()))?
}

fn rename_track_files(store: &Store, renames: &[RenameSpec]) -> Vec<String> {
    let mut failed = Vec::new();
    let mut moved: Vec<(String, String)> = Vec::new();

    for spec in renames {
        let old_key = match store.track_key(&spec.path) {
            Ok(key) => key,
            Err(err) => {
                failed.push(format!("{}: {err}", spec.path));
                continue;
            }
        };
        let old_file = old_key
            .split('/')
            .fold(store.root().to_path_buf(), |dir, part| dir.join(part));
        let label = file_name(&old_file);

        if !old_file.is_file() {
            failed.push(format!("{label}: not found"));
            continue;
        }

        let name = match validate_rename_name(&spec.name, &old_file) {
            Ok(name) => name,
            Err(reason) => {
                failed.push(format!("{label}: {reason}"));
                continue;
            }
        };

        let new_file = old_file.with_file_name(&name);
        let new_key = match old_key.rsplit_once('/') {
            Some((dir, _)) => format!("{dir}/{name}"),
            None => name.clone(),
        };

        if new_file != old_file {
            if new_file.exists() {
                failed.push(format!("{label}: a file named {name} already exists"));
                continue;
            }
            if let Err(err) = std::fs::rename(&old_file, &new_file) {
                failed.push(format!("{label}: {err}"));
                continue;
            }
        }

        if new_key != old_key {
            moved.push((old_key, new_key));
        }
    }

    for (old_key, new_key) in &moved {
        if let Err(err) = events::rename_path(store, old_key, new_key) {
            log::warn!("cannot rewrite journals for {old_key} → {new_key}: {err}");
        }
    }
    if let Err(err) = playlists::rename_paths(store, &moved) {
        log::warn!("cannot update playlists after rename: {err}");
    }
    let added_path = crate::store::index::added_at_path(store.root());
    for (old_key, new_key) in &moved {
        if !crate::store::index::rename_added_at(&added_path, old_key, new_key) {
            log::warn!("cannot move added-at for {old_key} → {new_key}");
        }
    }

    failed
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn move_to_trash(files: &[std::path::PathBuf]) -> Result<(), StoreError> {
    trash::delete_all(files).map_err(|err| StoreError::Invalid(format!("cannot move to the trash: {err}")))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn move_to_trash(_files: &[std::path::PathBuf]) -> Result<(), StoreError> {
    Err(StoreError::Invalid("deleting tracks is not supported on this platform yet".to_owned()))
}
