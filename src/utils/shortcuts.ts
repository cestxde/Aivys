import { useSyncExternalStore } from "react";
import { t } from "../i18n";

/**
 * Keyboard and mouse shortcuts, kept on this device (keyboards and mice
 * differ between computers). A binding is a string: modifiers, then a key's
 * `code` (the physical key, so it works in any layout) or a mouse button,
 * e.g. "Ctrl+ArrowRight", "Space", "Mouse4" (the side "back" button).
 */
export const SHORTCUT_ACTIONS = ["back", "forward", "playPause", "previous", "next", "volumeUp", "volumeDown", "undoEdit"] as const;
export type ShortcutAction = typeof SHORTCUT_ACTIONS[number];
export type Shortcuts = Record<ShortcutAction, string[]>;

export const DEFAULT_SHORTCUTS: Shortcuts = {
    back: ["Mouse4", "Alt+ArrowLeft"],
    forward: ["Mouse5", "Alt+ArrowRight"],
    playPause: ["Space"],
    previous: ["Ctrl+ArrowLeft"],
    next: ["Ctrl+ArrowRight"],
    volumeUp: ["Ctrl+ArrowUp"],
    volumeDown: ["Ctrl+ArrowDown"],
    undoEdit: ["Ctrl+KeyZ"],
};

const KEY = "aivys.shortcuts";

const load = (): Shortcuts => {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Record<string, unknown>> | null;
        if (!stored || typeof stored !== "object") return DEFAULT_SHORTCUTS;
        const result = { ...DEFAULT_SHORTCUTS };
        for (const action of SHORTCUT_ACTIONS) {
            const value = stored[action];
            if (Array.isArray(value) && value.every(item => typeof item === "string")) result[action] = value;
        }
        return result;
    } catch {
        return DEFAULT_SHORTCUTS;
    }
};

let shortcuts = load();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const save = (next: Shortcuts) => {
    shortcuts = next;
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        // Not remembered; it still applies until the app closes.
    }
    listeners.forEach(listener => listener());
};

export const useShortcuts = (): Shortcuts => useSyncExternalStore(subscribe, () => shortcuts);

/** Bind `binding` to `action`, taking it from any other action that had it. */
export const addShortcut = (action: ShortcutAction, binding: string) => {
    const next = { ...shortcuts };
    for (const other of SHORTCUT_ACTIONS) next[other] = next[other].filter(b => b !== binding);
    next[action] = [...next[action], binding];
    save(next);
};

export const removeShortcut = (action: ShortcutAction, binding: string) =>
    save({ ...shortcuts, [action]: shortcuts[action].filter(b => b !== binding) });

export const resetShortcuts = () => save(DEFAULT_SHORTCUTS);

export const isDefaultShortcuts = (current: Shortcuts) =>
    SHORTCUT_ACTIONS.every(action => current[action].join() === DEFAULT_SHORTCUTS[action].join());

const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight"]);

const withModifiers = (e: KeyboardEvent | MouseEvent, name: string) =>
    [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta", name].filter(Boolean).join("+");

/** The binding a key press stands for; null for a modifier alone. */
export const bindingOfKey = (e: KeyboardEvent): string | null =>
    !e.code || MODIFIER_CODES.has(e.code) ? null : withModifiers(e, e.code);

/**
 * The binding a mouse button stands for; null for the main, middle and
 * context buttons, which the app itself uses.
 */
export const bindingOfMouse = (e: MouseEvent): string | null =>
    e.button < 3 ? null : withModifiers(e, `Mouse${e.button + 1}`);

const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

const keyName = (code: string): string => {
    if (code === "Mouse4") return t("keys.mouseBack");
    if (code === "Mouse5") return t("keys.mouseForward");
    if (code.startsWith("Mouse")) return t("keys.mouse", { n: code.slice(5) });
    if (code === "Space") return t("keys.space");
    if (ARROWS[code]) return ARROWS[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
    return code;
};

/** How a binding reads: "Ctrl + →", "Mouse back". */
export const formatBinding = (binding: string): string =>
    binding.split("+").map(part => (part === "Meta" ? "Win" : ["Ctrl", "Alt", "Shift"].includes(part) ? part : keyName(part))).join(" + ");
