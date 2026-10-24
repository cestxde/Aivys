import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Values that outlive a page component: opening a playlist unmounts the
 * playlists page, and coming back should find its filter and scroll position
 * as they were. Kept for the session only.
 */
const values = new Map<string, unknown>();

/** `useState` whose value is remembered under `key` when the component unmounts. */
export const useRememberedState = <T,>(key: string, initial: T) => {
    const [value, setValue] = useState<T>(() => (values.has(key) ? values.get(key) as T : initial));
    const set = useCallback((next: T) => {
        values.set(key, next);
        setValue(next);
    }, [key]);
    return [value, set] as const;
};

/** The scroll position of a container, restored under `key`. Attach `ref` and `onScroll`. */
export const useRememberedScroll = (key: string) => {
    const ref = useRef<HTMLDivElement>(null);
    const scrollKey = `scroll:${key}`;

    // Before paint, so the page never shows at the top first.
    useLayoutEffect(() => {
        if (ref.current) ref.current.scrollTop = (values.get(scrollKey) as number | undefined) ?? 0;
    }, [scrollKey]);

    const onScroll = useCallback(() => {
        if (ref.current) values.set(scrollKey, ref.current.scrollTop);
    }, [scrollKey]);

    return { ref, onScroll };
};

/** `useState` kept on this device across launches (a view preference), as JSON under `aivys.<key>`. */
export const useStoredState = <T,>(key: string, initial: T, valid: (value: unknown) => value is T) => {
    const storageKey = `aivys.${key}`;
    const [value, setValue] = useState<T>(() => {
        try {
            const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
            return valid(stored) ? stored : initial;
        } catch {
            return initial;
        }
    });
    const set = useCallback((next: T) => {
        setValue(next);
        try {
            localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            // Not remembered; fine.
        }
    }, [storageKey]);
    return [value, set] as const;
};
