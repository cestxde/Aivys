import { bindingOfKey, isBound } from "./shortcuts";

/**
 * The webview behaves as an app, not a browser: no browser menu on a right
 * click (where the app has no menu of its own), no reloading, printing,
 * page search, zooming, viewing the source or saving the page, and images
 * are not dragged out. Text fields and selected text keep their menu (to
 * cut, copy and paste). In development, reloading and the dev tools stay.
 */
const BROWSER_KEYS: { code: string; ctrl?: boolean; shift?: boolean; devOnly?: boolean }[] = [
    { code: "F5", devOnly: true },
    { code: "KeyR", ctrl: true, devOnly: true },
    { code: "KeyR", ctrl: true, shift: true, devOnly: true },
    { code: "KeyI", ctrl: true, shift: true, devOnly: true },
    { code: "F12", devOnly: true },
    { code: "F3" },
    { code: "F7" },
    { code: "KeyP", ctrl: true },
    { code: "KeyF", ctrl: true },
    { code: "KeyG", ctrl: true },
    { code: "KeyU", ctrl: true },
    { code: "KeyS", ctrl: true },
    { code: "KeyJ", ctrl: true },
    { code: "Equal", ctrl: true },
    { code: "Minus", ctrl: true },
    { code: "Digit0", ctrl: true },
    { code: "NumpadAdd", ctrl: true },
    { code: "NumpadSubtract", ctrl: true },
    { code: "Numpad0", ctrl: true },
];

const isField = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest("input, textarea, [contenteditable]");

export const behaveAsApp = () => {
    // Bubbling, after the app's own handlers: those prevent it where they open a menu.
    window.addEventListener("contextmenu", (e) => {
        const selected = !!window.getSelection()?.toString();
        if (!isField(e.target) && !selected) e.preventDefault();
    });

    window.addEventListener("keydown", (e) => {
        const ctrl = e.ctrlKey || e.metaKey;
        const browser = BROWSER_KEYS.some(key =>
            key.code === e.code && !!key.ctrl === ctrl && !!key.shift === e.shiftKey
            && !(key.devOnly && import.meta.env.DEV));
        // A key bound to a shortcut is the app's (useShortcutActions handles it).
        if (browser && !isBound(bindingOfKey(e))) e.preventDefault();
    }, true);

    // Ctrl+wheel zooms the page.
    window.addEventListener("wheel", (e) => {
        if (e.ctrlKey) e.preventDefault();
    }, { passive: false });

    window.addEventListener("dragstart", (e) => {
        if (e.target instanceof HTMLImageElement) e.preventDefault();
    });
};
