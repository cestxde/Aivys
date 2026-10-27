/**
 * The screen edges the system draws over on Android (status bar and camera
 * cutout, navigation bar, keyboard), as the CSS variables `--safe-top`,
 * `--safe-right`, `--safe-bottom` and `--safe-left`. The app's activity
 * (`SafeInsets.kt`) gives them; elsewhere they stay unset (0 in the CSS).
 */
interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

const bridge = (window as unknown as { AivysInsets?: { get(): string } }).AivysInsets;

const apply = () => {
    if (!bridge) return;
    try {
        const insets = JSON.parse(bridge.get()) as Insets;
        const style = document.documentElement.style;
        for (const side of ["top", "right", "bottom", "left"] as const) {
            style.setProperty(`--safe-${side}`, `${insets[side]}px`);
        }
    } catch {
        // Unreadable: keep the last ones.
    }
};

/** Keep the variables current (the activity fires `aivys-insets` on a change). */
export const trackSafeArea = () => {
    if (!bridge) return;
    apply();
    window.addEventListener("aivys-insets", apply);
};
