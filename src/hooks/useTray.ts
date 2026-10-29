import { useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../i18n";

// Whether closing the window only hides it in the tray (this device only).
const KEY = "aivys.closeToTray";

const load = (): boolean => {
    try {
        return localStorage.getItem(KEY) === "true";
    } catch {
        return false;
    }
};

let closeToTray = load();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useCloseToTray = () => useSyncExternalStore(subscribe, () => closeToTray);

export const setCloseToTray = (value: boolean) => {
    closeToTray = value;
    try {
        localStorage.setItem(KEY, String(value));
    } catch {
        // Not remembered; it still applies until the app closes.
    }
    listeners.forEach(listener => listener());
};

/**
 * The tray icon's menu in the app's language (tray.rs), and closing the
 * window: with `closeToTray` it only hides, the music going on, until the
 * tray shows it again or quits. Desktop only (`enabled`).
 */
export const useTray = (enabled: boolean, language: string) => {
    useEffect(() => {
        if (!enabled) return;
        invoke("set_tray_labels", {
            labels: {
                show: t("tray.show"),
                toggle: t("tray.toggle"),
                previous: t("player.previous"),
                next: t("player.next"),
                quit: t("tray.quit"),
            },
        }).catch(console.error);
    }, [enabled, language]);

    useEffect(() => {
        if (!enabled) return;
        const window = getCurrentWindow();
        const unlisten = window.onCloseRequested((event) => {
            if (!closeToTray) return;
            event.preventDefault();
            window.hide().catch(console.error);
        });
        return () => {
            unlisten.then(stop => stop()).catch(() => {});
        };
    }, [enabled]);
};
