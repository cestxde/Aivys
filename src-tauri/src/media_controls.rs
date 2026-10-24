//! The system's media controls (Windows: System Media Transport Controls):
//! what plays, with its cover, in the volume flyout, quick settings and on
//! the lock screen, and the media keys of keyboards and headsets, which work
//! while the window is in the background.
//!
//! A press is sent to the frontend as a `media-control` event
//! (`{ "action": "play" | "pause" | "next" | "previous" | "stop" | "seek", "position"?: seconds }`);
//! the frontend reports what plays with `set_media_state`. Elsewhere the
//! command does nothing.
//!
//! WebView2 would register a session of its own for the playing `<audio>`
//! (titled after the page, taking the media keys without knowing of next or
//! previous): `tauri.conf.json` turns it off (`HardwareMediaKeyHandling`).

use serde::{Deserialize, Serialize};

/// What plays, as the frontend reports it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    /// "playing", "paused", or "none" (nothing loaded: the controls hide).
    status: String,
    /// The track's file, to tell a new track from a status change.
    path: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    cover_path: Option<String>,
    /// Seconds.
    duration: f64,
    position: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaControl {
    action: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<f64>,
}

#[tauri::command]
pub async fn set_media_state(state: MediaState) {
    #[cfg(windows)]
    imp::update(&state);
    #[cfg(not(windows))]
    let _ = state;
}

/// Connect the main window to the system's media controls.
pub fn install(app: &tauri::App) {
    #[cfg(windows)]
    imp::install(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod imp {
    use super::{MediaControl, MediaState};
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::{factory, HSTRING};
    use windows::Foundation::{TimeSpan, TypedEventHandler};
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs, SystemMediaTransportControls,
        SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsTimelineProperties,
    };
    use windows::Storage::StorageFile;
    use windows::Storage::Streams::RandomAccessStreamReference;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

    struct Controls {
        smtc: SystemMediaTransportControls,
        /// The track shown, so a status change does not redo the cover.
        shown: Option<String>,
    }

    static CONTROLS: Mutex<Option<Controls>> = Mutex::new(None);

    /// The app's icon as a file, the picture of a track without a cover: an
    /// open flyout keeps showing the previous cover when the picture is just
    /// removed.
    static PLACEHOLDER: OnceLock<PathBuf> = OnceLock::new();
    const PLACEHOLDER_IMAGE: &[u8] = include_bytes!("../icons/128x128@2x.png");

    fn emit(app: &AppHandle, action: &'static str, position: Option<f64>) {
        let _ = app.emit("media-control", MediaControl { action, position });
    }

    pub fn install(app: &tauri::App) {
        let Some(window) = app.get_webview_window("main") else { return };
        let Ok(handle) = window.hwnd() else { return };
        if let Ok(dir) = app.path().app_data_dir() {
            let path = dir.join("covers").join("aivys-placeholder.png");
            let written = std::fs::create_dir_all(dir.join("covers")).and_then(|_| std::fs::write(&path, PLACEHOLDER_IMAGE));
            if written.is_ok() {
                let _ = PLACEHOLDER.set(path);
            }
        }
        match connect(HWND(handle.0), app.handle().clone()) {
            Ok(smtc) => *CONTROLS.lock().unwrap_or_else(|e| e.into_inner()) = Some(Controls { smtc, shown: None }),
            Err(err) => log::warn!("system media controls unavailable: {err}"),
        }
    }

    fn connect(hwnd: HWND, app: AppHandle) -> windows::core::Result<SystemMediaTransportControls> {
        let interop = factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
        let smtc: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd)? };
        smtc.SetIsPlayEnabled(true)?;
        smtc.SetIsPauseEnabled(true)?;
        smtc.SetIsStopEnabled(true)?;
        smtc.SetIsNextEnabled(true)?;
        smtc.SetIsPreviousEnabled(true)?;
        // Hidden until something is loaded.
        smtc.SetIsEnabled(false)?;

        let pressed = app.clone();
        smtc.ButtonPressed(&TypedEventHandler::<SystemMediaTransportControls, SystemMediaTransportControlsButtonPressedEventArgs>::new(
            move |_, args| {
                let Some(args) = args.as_ref() else { return Ok(()) };
                let action = match args.Button()? {
                    SystemMediaTransportControlsButton::Play => "play",
                    SystemMediaTransportControlsButton::Pause => "pause",
                    SystemMediaTransportControlsButton::Stop => "stop",
                    SystemMediaTransportControlsButton::Next => "next",
                    SystemMediaTransportControlsButton::Previous => "previous",
                    _ => return Ok(()),
                };
                emit(&pressed, action, None);
                Ok(())
            },
        ))?;
        smtc.PlaybackPositionChangeRequested(&TypedEventHandler::<SystemMediaTransportControls, PlaybackPositionChangeRequestedEventArgs>::new(
            move |_, args| {
                let Some(args) = args.as_ref() else { return Ok(()) };
                // In 100 ns units.
                let position = args.RequestedPlaybackPosition()?.Duration as f64 / 10_000_000.0;
                emit(&app, "seek", Some(position));
                Ok(())
            },
        ))?;
        Ok(smtc)
    }

    fn span(seconds: f64) -> TimeSpan {
        TimeSpan::from(Duration::from_secs_f64(seconds.max(0.0)))
    }

    fn text(value: &Option<String>) -> HSTRING {
        HSTRING::from(value.as_deref().unwrap_or(""))
    }

    pub fn update(state: &MediaState) {
        let mut guard = CONTROLS.lock().unwrap_or_else(|e| e.into_inner());
        let Some(controls) = guard.as_mut() else { return };
        if let Err(err) = apply(controls, state) {
            log::warn!("cannot update the system media controls: {err}");
        }
    }

    fn apply(controls: &mut Controls, state: &MediaState) -> windows::core::Result<()> {
        let smtc = &controls.smtc;
        let status = match state.status.as_str() {
            "playing" => MediaPlaybackStatus::Playing,
            "paused" => MediaPlaybackStatus::Paused,
            _ => {
                controls.shown = None;
                smtc.SetPlaybackStatus(MediaPlaybackStatus::Closed)?;
                smtc.DisplayUpdater()?.ClearAll()?;
                return smtc.SetIsEnabled(false);
            }
        };
        smtc.SetIsEnabled(true)?;
        smtc.SetPlaybackStatus(status)?;

        if controls.shown != state.path {
            let display = smtc.DisplayUpdater()?;
            display.ClearAll()?;
            display.SetType(MediaPlaybackType::Music)?;
            let music = display.MusicProperties()?;
            music.SetTitle(&text(&state.title))?;
            music.SetArtist(&text(&state.artist))?;
            music.SetAlbumTitle(&text(&state.album))?;
            music.SetAlbumArtist(&text(&state.album_artist))?;
            // Without a (readable) cover, the app's icon; only failing that, none.
            // Set either way: `ClearAll` keeps the previous track's picture.
            let picture = |path: &str| {
                StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
                    .and_then(|operation| operation.join())
                    .and_then(|file| RandomAccessStreamReference::CreateFromFile(&file))
                    .ok()
            };
            let thumbnail = state
                .cover_path
                .as_deref()
                .and_then(picture)
                .or_else(|| PLACEHOLDER.get().and_then(|path| picture(&path.to_string_lossy())));
            display.SetThumbnail(thumbnail.as_ref())?;
            display.Update()?;
            controls.shown = state.path.clone();
        }

        // The flyout's seek bar.
        let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
        timeline.SetStartTime(span(0.0))?;
        timeline.SetMinSeekTime(span(0.0))?;
        timeline.SetEndTime(span(state.duration))?;
        timeline.SetMaxSeekTime(span(state.duration))?;
        timeline.SetPosition(span(state.position.min(state.duration)))?;
        smtc.UpdateTimelineProperties(&timeline)
    }
}
