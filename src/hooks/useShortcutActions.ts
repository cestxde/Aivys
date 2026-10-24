import { useEffect, useRef } from "react";
import {
    bindingOfKey, bindingOfMouse, SHORTCUT_ACTIONS, useShortcuts,
    type ShortcutAction, type Shortcuts,
} from "../utils/shortcuts";

/** Held down, these repeat; the others act once per press. */
const REPEATING: ShortcutAction[] = ["volumeUp", "volumeDown"];

const actionOf = (shortcuts: Shortcuts, binding: string | null): ShortcutAction | null =>
    binding ? SHORTCUT_ACTIONS.find(action => shortcuts[action].includes(binding)) ?? null : null;

/**
 * Something else has the input: a text field (its keys are its own), an open
 * dialog, menu or cover viewer.
 */
const busy = (target: EventTarget | null) =>
    !!document.querySelector(".dialog-backdrop, .context-menu, .cover-viewer-backdrop")
    || (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]"));

/** Run the actions of the shortcuts set in the settings. */
export const useShortcutActions = (handlers: Record<ShortcutAction, () => void>) => {
    const shortcuts = useShortcuts();
    // The listeners read the latest handlers without re-subscribing.
    const latest = useRef(handlers);
    useEffect(() => {
        latest.current = handlers;
    });

    useEffect(() => {
        // A Space bound here must not also press the focused button on release.
        let swallowKeyUp: string | null = null;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented || busy(e.target)) return;
            const action = actionOf(shortcuts, bindingOfKey(e));
            if (!action) return;
            e.preventDefault();
            swallowKeyUp = e.code;
            if (e.repeat && !REPEATING.includes(action)) return;
            latest.current[action]();
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code !== swallowKeyUp) return;
            swallowKeyUp = null;
            e.preventDefault();
        };
        const onMouseDown = (e: MouseEvent) => {
            if (busy(e.target)) return;
            const action = actionOf(shortcuts, bindingOfMouse(e));
            if (!action) return;
            e.preventDefault();
            latest.current[action]();
        };
        // The webview would otherwise go back in its own history on the side buttons.
        const onMouseUp = (e: MouseEvent) => {
            if (bindingOfMouse(e)) e.preventDefault();
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [shortcuts]);
};
