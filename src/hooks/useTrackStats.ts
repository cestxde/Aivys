import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EMPTY_STATS, type Track, type TrackStats } from "../types";
import { notifyError } from "../utils/notify";

type StatsMap = Record<string, TrackStats>;

/** What the user tried to do, per command, for error notices. */
const FAILED_MESSAGES: Record<string, string> = {
    set_favorite: "Could not save favorite",
    set_rating: "Could not save rating",
    record_play: "Could not record the play",
    record_complete: "Could not record the play",
};

const nowUnix = () => Math.floor(Date.now() / 1000);

/**
 * Per-track favorites, ratings and play statistics from the library's
 * `.aivys/` journals, keyed by `Track.relPath`. Reloaded after every scan;
 * user actions update the local copy immediately and are then persisted.
 */
export const useTrackStats = (files: Track[]) => {
    const [stats, setStats] = useState<StatsMap>({});
    // Latest state for callbacks that toggle a value.
    const statsRef = useRef(stats);
    useEffect(() => {
        statsRef.current = stats;
    }, [stats]);

    const reload = useCallback(async () => {
        try {
            setStats(await invoke<StatsMap>("get_track_stats"));
        } catch (e) {
            notifyError("Could not load favorites and play history", e);
        }
    }, []);

    // A scan (re)opens the library, so fresh files mean fresh stats.
    useEffect(() => {
        if (files.length === 0) return;
        let cancelled = false;
        invoke<StatsMap>("get_track_stats")
            .then(loaded => {
                if (!cancelled) setStats(loaded);
            })
            .catch(e => notifyError("Could not load favorites and play history", e));
        return () => {
            cancelled = true;
        };
    }, [files]);

    const patch = useCallback((relPath: string, change: (current: TrackStats) => Partial<TrackStats>) => {
        setStats(prev => {
            const current = prev[relPath] ?? EMPTY_STATS;
            return { ...prev, [relPath]: { ...current, ...change(current) } };
        });
    }, []);

    // Persist an action; on failure fall back to what is actually stored.
    const persist = useCallback(async (command: string, args: Record<string, unknown>) => {
        try {
            await invoke(command, args);
        } catch (e) {
            notifyError(FAILED_MESSAGES[command] ?? "Could not save the change", e);
            reload();
        }
    }, [reload]);

    const toggleFavorite = useCallback((track: Track) => {
        const favorite = !(statsRef.current[track.relPath]?.favorite ?? false);
        patch(track.relPath, () => ({ favorite, favoritedAt: favorite ? nowUnix() : null }));
        persist("set_favorite", { path: track.relPath, favorite });
    }, [patch, persist]);

    /** `rating` is 1-5, or 0 to clear. */
    const setRating = useCallback((track: Track, rating: number) => {
        patch(track.relPath, () => ({ rating: rating > 0 ? rating : null }));
        persist("set_rating", { path: track.relPath, rating });
    }, [patch, persist]);

    const recordPlay = useCallback((track: Track) => {
        patch(track.relPath, current => ({ playCount: current.playCount + 1, lastPlayedAt: nowUnix() }));
        persist("record_play", { path: track.relPath });
    }, [patch, persist]);

    const recordComplete = useCallback((track: Track) => {
        patch(track.relPath, () => ({ lastPlayedAt: nowUnix() }));
        persist("record_complete", { path: track.relPath });
    }, [patch, persist]);

    return { stats, reload, toggleFavorite, setRating, recordPlay, recordComplete };
};
