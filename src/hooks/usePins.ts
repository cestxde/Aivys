import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types";
import { notifyError } from "../utils/notify";
import { t } from "../i18n";

/** What can be pinned to the top of its list. */
export type PinKind = "playlist" | "album" | "artist" | "tag";

interface Pin {
    kind: PinKind;
    /** A playlist's or tag's id, an artist's or album's group key. */
    key: string;
}

const id = (kind: PinKind, key: string) => `${kind}\u001f${key}`;

/** `items` with the pinned ones first, each part in its given order. */
export const pinnedFirst = <T,>(items: T[], isPinned: (item: T) => boolean): T[] => [
    ...items.filter(isPinned),
    ...items.filter(item => !isPinned(item)),
];

/**
 * Playlists, albums, artists and tags pinned to the top of their lists
 * (`.aivys/pins.json`, shared by the library's devices). Reloaded after every
 * scan; a change shows at once and the backend's list then replaces it.
 */
export const usePins = (files: Track[]) => {
    const [loaded, setLoaded] = useState<Pin[]>([]);

    useEffect(() => {
        if (files.length === 0) return;
        let cancelled = false;
        invoke<Pin[]>("list_pins")
            .then(pins => {
                if (!cancelled) setLoaded(pins);
            })
            .catch(e => notifyError(t("error.loadPins"), e));
        return () => {
            cancelled = true;
        };
    }, [files]);

    // An empty library pins nothing (not what the library opened before did).
    const empty = files.length === 0;
    const pinned = useMemo(() => new Set(empty ? [] : loaded.map(pin => id(pin.kind, pin.key))), [loaded, empty]);

    const isPinned = useCallback((kind: PinKind, key: string) => pinned.has(id(kind, key)), [pinned]);

    const setPinned = useCallback(async (kind: PinKind, key: string, pin: boolean) => {
        setLoaded(prev => pin
            ? [...prev.filter(p => id(p.kind, p.key) !== id(kind, key)), { kind, key }]
            : prev.filter(p => id(p.kind, p.key) !== id(kind, key)));
        try {
            setLoaded(await invoke<Pin[]>("set_pinned", { kind, key, pinned: pin }));
        } catch (e) {
            notifyError(t("error.savePin"), e);
        }
    }, []);

    return { isPinned, setPinned };
};
