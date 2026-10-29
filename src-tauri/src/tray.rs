//! The tray icon (desktop): a click shows the window, its menu plays, pauses
//! and skips, and quits the app. Its playback items are sent to the frontend
//! as the media keys' are (`media-control`, see media_controls.rs). The
//! frontend gives the menu's texts in its language (`set_tray_labels`) and
//! decides whether closing the window only hides it here.

use serde::Deserialize;

/// The menu's texts, in the app's language.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels {
    show: String,
    toggle: String,
    previous: String,
    next: String,
    quit: String,
}

#[tauri::command]
pub fn set_tray_labels(app: tauri::AppHandle, labels: TrayLabels) {
    #[cfg(desktop)]
    imp::set_labels(&app, &labels);
    #[cfg(not(desktop))]
    let _ = (app, labels);
}

/// Put the icon in the tray.
pub fn install(app: &tauri::App) {
    #[cfg(desktop)]
    if let Err(err) = imp::install(app) {
        log::warn!("cannot add the tray icon: {err}");
    }
    #[cfg(not(desktop))]
    let _ = app;
}

#[cfg(desktop)]
mod imp {
    use super::TrayLabels;
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::{AppHandle, Emitter, Manager, Wry};

    /// The menu's items, to give them new texts.
    struct TrayItems {
        show: MenuItem<Wry>,
        toggle: MenuItem<Wry>,
        previous: MenuItem<Wry>,
        next: MenuItem<Wry>,
        quit: MenuItem<Wry>,
    }

    /// The window shown again, in front (it may have been hidden by closing it).
    fn show_window(app: &AppHandle) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }

    pub(super) fn install(app: &tauri::App) -> tauri::Result<()> {
        // English until the frontend gives its texts.
        let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
        let items = TrayItems {
            show: item("show", "Show Aivys")?,
            toggle: item("toggle", "Play / pause")?,
            previous: item("previous", "Previous track")?,
            next: item("next", "Next track")?,
            quit: item("quit", "Quit")?,
        };
        let separator = PredefinedMenuItem::separator(app)?;
        let separator2 = PredefinedMenuItem::separator(app)?;
        let menu = Menu::with_items(
            app,
            &[&items.show, &separator, &items.toggle, &items.previous, &items.next, &separator2, &items.quit],
        )?;

        let mut builder = TrayIconBuilder::with_id("main")
            .tooltip("Aivys")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "show" => show_window(app),
                "quit" => app.exit(0),
                action @ ("toggle" | "previous" | "next") => {
                    let _ = app.emit("media-control", serde_json::json!({ "action": action }));
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_window(tray.app_handle());
                }
            });
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
        builder.build(app)?;
        app.manage(items);
        Ok(())
    }

    pub(super) fn set_labels(app: &AppHandle, labels: &TrayLabels) {
        let Some(items) = app.try_state::<TrayItems>() else {
            return;
        };
        let _ = items.show.set_text(&labels.show);
        let _ = items.toggle.set_text(&labels.toggle);
        let _ = items.previous.set_text(&labels.previous);
        let _ = items.next.set_text(&labels.next);
        let _ = items.quit.set_text(&labels.quit);
    }
}
