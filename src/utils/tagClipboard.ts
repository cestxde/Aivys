import { useSyncExternalStore } from "react";

/**
 * In-app clipboard of custom tag ids copied from a track. System clipboard is
 * not used: the ids are library-local UUIDs, and Android's WebView clipboard
 * is unreliable for this.
 */

const STORAGE_KEY = "aivys.tagClipboard";

const readStored = (): string[] => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) as unknown : [];
        return Array.isArray(parsed) && parsed.every(id => typeof id === "string") ? parsed : [];
    } catch {
        return [];
    }
};

let tagIds: string[] = readStored();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const write = (ids: string[]) => {
    tagIds = ids;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // Session storage full or blocked; the buffer still works until reload.
    }
    emit();
};

/** Remember these tag ids as the current clipboard. */
export const copyTagIds = (ids: string[]) => write([...ids]);

/** The ids last copied (empty when none). */
export const peekTagIds = (): readonly string[] => tagIds;

/** Subscribe to the clipboard for menus that show/hide Paste and Add. */
export const useTagClipboard = (): readonly string[] =>
    useSyncExternalStore(subscribe, peekTagIds, () => []);
