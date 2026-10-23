mod cover;
mod db;
mod library;
mod store;
mod text;
mod track;

use library::{scan_directory, validate_directory};
use store::commands::*;
use tauri::Manager;

/// Show the main window. It starts hidden (see tauri.conf.json) so the user
/// never sees a white webview flash; the frontend calls this once it has
/// painted its first frame.
#[tauri::command]
fn show_main_window(window: tauri::Window) {
    let _ = window.show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(StoreState::default())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            validate_directory,
            show_main_window,
            get_library_settings,
            set_visible_system_playlists,
            resolve_conflicts,
            record_play,
            record_complete,
            set_rating,
            set_favorite,
            set_track_tag,
            get_track_stats,
            get_system_playlist,
            list_tags,
            create_tag,
            update_tag,
            delete_tag,
            list_playlists,
            get_playlist,
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
            delete_tracks
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
