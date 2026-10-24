//! Windows taskbar: previous, play/pause and next buttons in the window's
//! thumbnail preview (hovering the app's taskbar icon). A click is sent to
//! the frontend as a `taskbar-button` event ("previous", "toggle", "next");
//! the frontend tells which of play/pause to show with `set_taskbar_state`.
//! Elsewhere the command does nothing.

use serde::Deserialize;
use tauri::AppHandle;

/// Tooltips, in the interface language.
#[derive(Clone, Default, Deserialize)]
pub struct TaskbarTips {
    previous: String,
    play: String,
    pause: String,
    next: String,
}

#[tauri::command]
pub fn set_taskbar_state(app: AppHandle, playing: bool, has_track: bool, tips: TaskbarTips) {
    #[cfg(windows)]
    imp::update(&app, imp::State { playing, has_track, tips });
    #[cfg(not(windows))]
    let _ = (app, playing, has_track, tips);
}

/// Watch the main window for the taskbar's messages.
pub fn install(app: &tauri::App) {
    #[cfg(windows)]
    imp::install(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod imp {
    use super::TaskbarTips;
    use std::cell::RefCell;
    use std::sync::{Mutex, OnceLock};
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HGDIOBJ};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_DISABLED, THBF_ENABLED, THBN_CLICKED,
        THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        ChangeWindowMessageFilterEx, CreateIconIndirect, DestroyIcon, RegisterWindowMessageW, HICON, ICONINFO,
        MSGFLT_ALLOW, SM_CXSMICON, WM_COMMAND,
    };

    const PREVIOUS: u32 = 1;
    const TOGGLE: u32 = 2;
    const NEXT: u32 = 3;

    #[derive(Clone, Default)]
    pub struct State {
        pub playing: bool,
        pub has_track: bool,
        pub tips: TaskbarTips,
    }

    struct Shared {
        app: AppHandle,
        /// "TaskbarButtonCreated": the buttons can be added (again, after an
        /// Explorer restart).
        created: u32,
        state: Mutex<State>,
    }

    static SHARED: OnceLock<Shared> = OnceLock::new();

    // The taskbar object lives on the window's (main) thread, where its
    // messages arrive.
    thread_local! {
        static TASKBAR: RefCell<Option<Taskbar>> = const { RefCell::new(None) };
    }

    pub fn install(app: &tauri::App) {
        let Some(window) = app.get_webview_window("main") else { return };
        let Ok(handle) = window.hwnd() else { return };
        let hwnd = HWND(handle.0);
        unsafe {
            let created = RegisterWindowMessageW(w!("TaskbarButtonCreated"));
            let shared = Shared { app: app.handle().clone(), created, state: Mutex::new(State::default()) };
            if SHARED.set(shared).is_err() {
                return;
            }
            // Also when running elevated, Explorer's messages must get through.
            let _ = ChangeWindowMessageFilterEx(hwnd, created, MSGFLT_ALLOW, None);
            let _ = ChangeWindowMessageFilterEx(hwnd, WM_COMMAND, MSGFLT_ALLOW, None);
            let _ = SetWindowSubclass(hwnd, Some(subclass), 1, 0);
        }
    }

    pub fn update(app: &AppHandle, state: State) {
        let Some(shared) = SHARED.get() else { return };
        *shared.state.lock().unwrap_or_else(|e| e.into_inner()) = state;
        let _ = app.run_on_main_thread(|| {
            TASKBAR.with(|taskbar| {
                if let Some(taskbar) = taskbar.borrow().as_ref() {
                    taskbar.refresh();
                }
            })
        });
    }

    unsafe extern "system" fn subclass(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if let Some(shared) = SHARED.get() {
            if message == shared.created {
                TASKBAR.with(|taskbar| *taskbar.borrow_mut() = Taskbar::create(hwnd));
            } else if message == WM_COMMAND && (wparam.0 >> 16) as u32 & 0xffff == THBN_CLICKED {
                let button = match wparam.0 as u32 & 0xffff {
                    PREVIOUS => Some("previous"),
                    TOGGLE => Some("toggle"),
                    NEXT => Some("next"),
                    _ => None,
                };
                if let Some(button) = button {
                    let _ = shared.app.emit("taskbar-button", button);
                    return LRESULT(0);
                }
            }
        }
        unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
    }

    struct Taskbar {
        list: ITaskbarList3,
        hwnd: HWND,
        icons: Icons,
    }

    impl Taskbar {
        fn create(hwnd: HWND) -> Option<Self> {
            unsafe {
                let list: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER).ok()?;
                list.HrInit().ok()?;
                let size = GetSystemMetricsForDpi(SM_CXSMICON, GetDpiForWindow(hwnd)).max(16);
                let taskbar = Taskbar { list, hwnd, icons: Icons::new(size) };
                taskbar.list.ThumbBarAddButtons(hwnd, &taskbar.buttons()).ok()?;
                Some(taskbar)
            }
        }

        fn refresh(&self) {
            unsafe {
                let _ = self.list.ThumbBarUpdateButtons(self.hwnd, &self.buttons());
            }
        }

        fn buttons(&self) -> [THUMBBUTTON; 3] {
            let state = SHARED
                .get()
                .map(|shared| shared.state.lock().unwrap_or_else(|e| e.into_inner()).clone())
                .unwrap_or_default();
            let icons = &self.icons;
            let (toggle_icon, toggle_tip) =
                if state.playing { (icons.pause, &state.tips.pause) } else { (icons.play, &state.tips.play) };
            [
                button(PREVIOUS, icons.previous, &state.tips.previous, state.has_track),
                button(TOGGLE, toggle_icon, toggle_tip, state.has_track),
                button(NEXT, icons.next, &state.tips.next, state.has_track),
            ]
        }
    }

    fn button(id: u32, icon: HICON, tip: &str, enabled: bool) -> THUMBBUTTON {
        let mut text = [0u16; 260];
        for (slot, unit) in text.iter_mut().zip(tip.encode_utf16().take(259)) {
            *slot = unit;
        }
        THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: id,
            iBitmap: 0,
            hIcon: icon,
            szTip: text,
            dwFlags: if enabled { THBF_ENABLED } else { THBF_DISABLED },
        }
    }

    /// The button glyphs, drawn at the size the taskbar asks for.
    struct Icons {
        previous: HICON,
        play: HICON,
        pause: HICON,
        next: HICON,
    }

    impl Icons {
        fn new(size: i32) -> Self {
            Icons {
                previous: draw(size, |u, v| next_shape(1.0 - u, v)),
                play: draw(size, |u, v| triangle(u, v, 0.3, 0.8)),
                pause: draw(size, |u, v| (0.2..=0.8).contains(&v) && ((0.27..=0.43).contains(&u) || (0.57..=0.73).contains(&u))),
                next: draw(size, next_shape),
            }
        }
    }

    impl Drop for Icons {
        fn drop(&mut self) {
            for icon in [self.previous, self.play, self.pause, self.next] {
                unsafe {
                    let _ = DestroyIcon(icon);
                }
            }
        }
    }

    /// A triangle pointing right, from `left` to its tip at `right`, in the unit square.
    fn triangle(u: f32, v: f32, left: f32, right: f32) -> bool {
        let t = (u - left) / (right - left);
        (0.0..=1.0).contains(&t) && (v - 0.5).abs() <= 0.3 * (1.0 - t)
    }

    fn next_shape(u: f32, v: f32) -> bool {
        triangle(u, v, 0.22, 0.64) || ((0.66..=0.78).contains(&u) && (0.2..=0.8).contains(&v))
    }

    /// A white icon of `size` pixels covering `shape` (unit square, y down), antialiased.
    fn draw(size: i32, shape: impl Fn(f32, f32) -> bool) -> HICON {
        const SAMPLES: usize = 4;
        let n = size as usize;
        let mut pixels = vec![0u8; n * n * 4];
        for y in 0..n {
            for x in 0..n {
                let mut hits = 0;
                for sy in 0..SAMPLES {
                    for sx in 0..SAMPLES {
                        let u = (x as f32 + (sx as f32 + 0.5) / SAMPLES as f32) / size as f32;
                        let v = (y as f32 + (sy as f32 + 0.5) / SAMPLES as f32) / size as f32;
                        if shape(u, v) {
                            hits += 1;
                        }
                    }
                }
                let at = (y * n + x) * 4;
                pixels[at..at + 4].copy_from_slice(&[255, 255, 255, (hits * 255 / (SAMPLES * SAMPLES)) as u8]);
            }
        }
        // Monochrome rows are padded to 16 bits; with an alpha channel the mask is unused.
        let mask_bits = vec![0u8; n.div_ceil(16) * 2 * n];
        unsafe {
            let color = CreateBitmap(size, size, 1, 32, Some(pixels.as_ptr().cast()));
            let mask = CreateBitmap(size, size, 1, 1, Some(mask_bits.as_ptr().cast()));
            let info = ICONINFO { fIcon: true.into(), xHotspot: 0, yHotspot: 0, hbmMask: mask, hbmColor: color };
            let icon = CreateIconIndirect(&info).unwrap_or_default();
            let _ = DeleteObject(HGDIOBJ(color.0));
            let _ = DeleteObject(HGDIOBJ(mask.0));
            icon
        }
    }
}
