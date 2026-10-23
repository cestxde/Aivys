import { getCurrentWindow } from "@tauri-apps/api/window";

/** The user's choice; "system" follows the OS setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

// Device-local; index.html reads the same key before the first paint.
const KEY = "aivys.theme";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export const loadThemePreference = (): ThemePreference => {
    try {
        const stored = localStorage.getItem(KEY);
        return stored === "light" || stored === "dark" ? stored : "system";
    } catch {
        return "system";
    }
};

export const saveThemePreference = (preference: ThemePreference) => {
    try {
        if (preference === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, preference);
    } catch {
        // Not remembered; fine.
    }
};

/** Apply a preference: the page's colors and the native title bar. */
export const applyTheme = (preference: ThemePreference) => {
    const dark = preference === "dark" || (preference === "system" && darkQuery().matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    // null lets the window follow the OS again.
    getCurrentWindow()
        .setTheme(preference === "system" ? null : preference)
        .catch(e => console.warn("cannot set the window theme", e));
};

/** Re-apply when the OS switches between light and dark. Returns the unsubscribe. */
export const followSystemTheme = (onChange: () => void): (() => void) => {
    const query = darkQuery();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
};
