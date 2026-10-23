import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Playlist, TrackStats } from "../types";

/**
 * Current track paths of every smart playlist, for their counts and covers on
 * the playlists page. Evaluated only while `enabled`, again when playlists or
 * stats change (rules can depend on ratings, plays, favorites). A playlist
 * that fails to evaluate is just left out.
 */
export const useSmartPlaylistPaths = (
    playlists: Playlist[],
    stats: Record<string, TrackStats>,
    enabled: boolean
): Map<string, string[]> => {
    const [paths, setPaths] = useState<Map<string, string[]>>(() => new Map());

    useEffect(() => {
        if (!enabled) return;
        const smart = playlists.filter(p => p.type === "smart");
        let cancelled = false;
        Promise.all(smart.map(p =>
            invoke<string[]>("get_smart_playlist_tracks", { id: p.id })
                .then(result => [p.id, result] as const)
                .catch(() => null)
        )).then(results => {
            if (!cancelled) setPaths(new Map(results.filter(r => r !== null)));
        });
        return () => {
            cancelled = true;
        };
    }, [playlists, stats, enabled]);

    return paths;
};
