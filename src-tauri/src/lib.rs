use lofty::file::AudioFile as LoftyAudioFile;
use lofty::probe::Probe;
use serde::Serialize;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[derive(Serialize)]
struct AudioFile {
    name: String,
    path: String,
    duration: u32,
    modified: u64,
}

#[tauri::command(rename_all = "camelCase")]
fn scan_directory(base_path: String) -> Vec<AudioFile> {
    let mut audio_files = Vec::new();

    for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();

        if path.is_file() && path.extension().map_or(false, |ext| ext == "mp3") {
            let duration = Probe::open(path)
                .ok()
                .and_then(|probed| probed.read().ok())
                .map(|tagged| tagged.properties().duration().as_secs() as u32)
                .unwrap_or(0);

            let modified = std::fs::metadata(path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0); // Если не удалось прочитать, будет 0

            audio_files.push(AudioFile {
                name: path.file_name().unwrap().to_string_lossy().into_owned(),
                path: path.to_string_lossy().into_owned(),
                duration,
                modified,
            });
        }
    }
    audio_files
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_directory])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
