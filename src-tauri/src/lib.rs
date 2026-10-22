mod cover;
mod library;
mod text;
mod track;

use library::{scan_directory, validate_directory};
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
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            validate_directory,
            show_main_window
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
