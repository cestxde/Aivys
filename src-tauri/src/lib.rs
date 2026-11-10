mod artists;
mod cover;
mod db;
mod library;
mod media_controls;
mod metadata;
mod scripts;
mod store;
mod taskbar;
mod text;
mod track;
mod tray;

use library::{cached_tracks, list_folders, scan_directory, validate_directory};
use store::commands::*;
use media_controls::set_media_state;
use taskbar::set_taskbar_state;
use tray::set_tray_labels;
use tauri::Manager;

/// Show the main window. It starts hidden (see tauri.conf.json) so the user
/// never sees a white webview flash; the frontend calls this once it has
/// painted its first frame.
#[tauri::command]
fn show_main_window(window: tauri::Window) {
    let _ = window.show();
}

/// The app, for the activity to ask for a window (`open_window`).
#[cfg(target_os = "android")]
static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Android: the activity of an app swiped away from the recent apps is gone and
/// its window with it, while the process lives on for the music
/// (PlaybackService.kt). Opening the app again makes a new activity, which has
/// no window: only the process's first activity gets the one made at startup.
/// `MainActivity` calls this for the others.
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_aivys_app_MainActivity_openWindow(
    _env: *mut std::ffi::c_void,
    _activity: *mut std::ffi::c_void,
) {
    let Some(app) = APP.get().cloned() else { return };
    // Not on the activity's (UI) thread: the window is made by the event loop,
    // which needs that thread for the webview.
    std::thread::spawn(move || {
        // An activity made anew with its window kept (the screen rotated) has it.
        if app.get_webview_window("main").is_some() {
            return;
        }
        let Some(config) = app.config().app.windows.first() else { return };
        let built = tauri::WebviewWindowBuilder::from_config(&app, config).and_then(|window| window.build());
        if let Err(err) = built {
            log::error!("cannot open the window again: {err}");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    // Reopen the window where and as big as it was closed. Visibility is not
    // restored: the window stays hidden until the frontend has painted.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all() - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        // Updates from the GitHub releases (endpoint and key in tauri.conf.json),
        // and the restart into the new version.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Launch with the OS login session (Windows Run key / Launch Agents).
        .plugin(tauri_plugin_autostart::Builder::new().build());

    builder
        .manage(StoreState::default())
        .manage(metadata::EditUndo::default())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            cached_tracks,
            validate_directory,
            list_folders,
            show_main_window,
            set_taskbar_state,
            set_media_state,
            set_tray_labels,
            get_library_settings,
            set_artist_rules,
            set_include_mp4,
            default_artist_rules,
            resolve_conflicts,
            take_opening_conflicts,
            record_play,
            record_complete,
            set_rating,
            set_favorite,
            set_track_tag,
            get_track_stats,
            get_play_counts,
            list_tags,
            create_tag,
            update_tag,
            delete_tag,
            merge_tags,
            list_tag_categories,
            create_tag_category,
            rename_tag_category,
            delete_tag_category,
            reorder_tag_categories,
            list_pins,
            set_pinned,
            list_group_covers,
            set_group_cover,
            list_playlists,
            create_manual_playlist,
            create_smart_playlist,
            rename_playlist,
            set_playlist_sort,
            set_playlist_rules,
            add_to_playlist,
            remove_from_playlist,
            reorder_playlist,
            delete_playlist,
            set_playlist_cover,
            clear_playlist_cover,
            get_smart_playlist_tracks,
            preview_smart_playlist,
            search_tracks,
            delete_tracks,
            edit_tracks,
            undo_track_edit,
            rename_tracks
        ])
        .setup(|app| {
            #[cfg(target_os = "android")]
            let _ = APP.set(app.handle().clone());

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            taskbar::install(app);
            media_controls::install(app);
            tray::install(app);
            if let Ok(app_data) = app.path().app_data_dir() {
                metadata::clear_undo(&app_data);
            }

            // Safety net: the window starts hidden and the frontend shows it
            // once painted. If that signal never arrives (e.g. a frontend
            // crash before first render), reveal it anyway after a few seconds
            // so the app is never stuck invisible.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(4));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // Android: the app swiped away from the recent apps closes its
            // window, but the music plays on in its service (PlaybackService.kt),
            // in this process; it reopens with a new window.
            #[cfg(target_os = "android")]
            if let tauri::RunEvent::ExitRequested { api, .. } = _event {
                api.prevent_exit();
            }
        });
}

#[cfg(test)]
mod tests {
    /// Every command in `generate_handler!` must be allowed by a permission in
    /// `permissions/` that the default capability grants; otherwise Tauri
    /// rejects calls from the frontend with "not allowed by ACL".
    #[test]
    fn every_command_is_allowed() {
        let source = include_str!("lib.rs");
        let start = source.find("generate_handler![").expect("handler list") + "generate_handler![".len();
        let end = start + source[start..].find(']').expect("end of handler list");
        let commands: Vec<&str> = source[start..end]
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .collect();

        let capability = include_str!("../capabilities/default.json");
        let permissions = [
            include_str!("../permissions/scan.toml"),
            include_str!("../permissions/library.toml"),
            include_str!("../permissions/taskbar.toml"),
        ];
        let granted: Vec<&str> = permissions
            .iter()
            .filter(|toml| {
                toml.lines()
                    .filter_map(|line| line.trim().strip_prefix("identifier = "))
                    .any(|id| capability.contains(id.trim()))
            })
            .copied()
            .collect();

        let missing: Vec<&str> = commands
            .into_iter()
            .filter(|command| !granted.iter().any(|toml| toml.contains(&format!("\"{command}\""))))
            .collect();
        assert!(missing.is_empty(), "commands without a permission: {missing:?}");
    }
}
