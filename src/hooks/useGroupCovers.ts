import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types";
import type { TrackGroup } from "../utils/groups";
import { notifyError } from "../utils/notify";
import { t } from "../i18n";

/** What can have a cover of its own. */
export type CoverKind = "album" | "artist";

interface GroupCover {
    kind: CoverKind;
    /** The album's or artist's group key. */
    key: string;
    /** The image's path. */
    path: string;
}

const id = (kind: CoverKind, key: string) => `${kind}\u001f${key}`;

/**
 * Covers chosen for albums and artists over their tracks' art
 * (`.aivys/covers.json`, shared by the library's devices). Reloaded after
 * every scan.
 */
export const useGroupCovers = (files: Track[]) => {
    const [loaded, setLoaded] = useState<GroupCover[]>([]);

    useEffect(() => {
        if (files.length === 0) return;
        let cancelled = false;
        invoke<GroupCover[]>("list_group_covers")
            .then(covers => {
                if (!cancelled) setLoaded(covers);
            })
            .catch(e => notifyError(t("error.loadCovers"), e));
        return () => {
            cancelled = true;
        };
    }, [files]);

    // An empty library has none (not what the library opened before had).
    const empty = files.length === 0;
    const byId = useMemo(
        () => new Map(empty ? [] : loaded.map(cover => [id(cover.kind, cover.key), cover.path])),
        [loaded, empty],
    );

    /** `groups` with their chosen covers (the same objects where there is none). */
    const withCovers = useCallback((kind: CoverKind, groups: TrackGroup[]): TrackGroup[] =>
        byId.size === 0 ? groups : groups.map(group => {
            const cover = byId.get(id(kind, group.key));
            return cover ? { ...group, cover } : group;
        }), [byId]);

    /** Give the album or artist the image (base64), or with null its tracks' art again. */
    const setCover = useCallback(async (kind: CoverKind, key: string, data: string | null) => {
        try {
            setLoaded(await invoke<GroupCover[]>("set_group_cover", { kind, key, data }));
        } catch (e) {
            notifyError(t("error.setCover"), e);
        }
    }, []);

    return { withCovers, setCover };
};
