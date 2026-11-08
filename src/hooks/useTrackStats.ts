import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EMPTY_STATS, type Track, type TrackStats, type UserTag } from "../types";
import { impliedTagIds } from "../utils/tags";
import { notifyError } from "../utils/notify";
import { t, type MessageKey } from "../i18n";

type StatsMap = Record<string, TrackStats>;

/** What the user tried to do, per command, for error notices. */
const FAILED_MESSAGES: Record<string, MessageKey> = {
    set_favorite: "error.saveFavorite",
    set_rating: "error.saveRating",
    record_play: "error.recordPlay",
    record_complete: "error.recordPlay",
    set_track_tag: "error.saveTag",
};

const nowUnix = () => Math.floor(Date.now() / 1000);

const NO_STATS: StatsMap = {};

/**
 * Per-track favorites, ratings, tags and play statistics from the library's
 * `.aivys/` journals, keyed by `Track.relPath`. Reloaded after every scan;
 * user actions update the local copy immediately and are then persisted.
 *
 * `tagById` is used so assigning a tag also shows the ones it implies, before
 * the backend writes them.
 */
export const useTrackStats = (files: Track[], tagById: Map<string, UserTag> = new Map()) => {
    const [stats, setStats] = useState<StatsMap>({});
    // Latest state for callbacks that toggle a value.
    const statsRef = useRef(stats);
    useEffect(() => {
        statsRef.current = stats;
    }, [stats]);
    const tagByIdRef = useRef(tagById);
    useEffect(() => {
        tagByIdRef.current = tagById;
    }, [tagById]);

    const reload = useCallback(async () => {
        try {
            setStats(await invoke<StatsMap>("get_track_stats"));
        } catch (e) {
            notifyError(t("error.loadStats"), e);
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
            .catch(e => notifyError(t("error.loadStats"), e));
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
            notifyError(t(FAILED_MESSAGES[command] ?? "error.saveChange"), e);
            reload();
        }
    }, [reload]);

    /** Add tracks to favorites or remove them (those already in that state are skipped). */
    const setFavorite = useCallback((tracks: Track[], favorite: boolean) => {
        for (const track of tracks) {
            if ((statsRef.current[track.relPath]?.favorite ?? false) === favorite) continue;
            patch(track.relPath, () => ({ favorite, favoritedAt: favorite ? nowUnix() : null }));
            persist("set_favorite", { path: track.relPath, favorite });
        }
    }, [patch, persist]);

    const toggleFavorite = useCallback((track: Track) => {
        setFavorite([track], !(statsRef.current[track.relPath]?.favorite ?? false));
    }, [setFavorite]);

    /** `rating` is 1-5, or 0 to clear. */
    const setRating = useCallback((track: Track, rating: number) => {
        patch(track.relPath, () => ({ rating: rating > 0 ? rating : null }));
        persist("set_rating", { path: track.relPath, rating });
    }, [patch, persist]);

    /** Assign or remove a tag on tracks (those already in that state are skipped). */
    const setTrackTag = useCallback((tracks: Track[], tagId: string, assigned: boolean) => {
        // Assigning also adds implied tags locally; the backend writes them too.
        const extra = assigned ? impliedTagIds(tagId, tagByIdRef.current) : [];
        for (const track of tracks) {
            const current = statsRef.current[track.relPath]?.tags ?? [];
            if (current.includes(tagId) === assigned) continue;
            patch(track.relPath, ({ tags }) => {
                if (!assigned) return { tags: tags.filter(id => id !== tagId) };
                const next = new Set(tags);
                next.add(tagId);
                for (const id of extra) next.add(id);
                return { tags: [...next] };
            });
            persist("set_track_tag", { path: track.relPath, tagId, assigned });
        }
    }, [patch, persist]);

    /** Give each track exactly `tagIds` (unknown ids already filtered by the caller). */
    const replaceTags = useCallback((tracks: Track[], tagIds: string[]) => {
        const want = new Set(tagIds);
        for (const track of tracks) {
            const current = statsRef.current[track.relPath]?.tags ?? [];
            for (const tagId of current) {
                if (!want.has(tagId)) setTrackTag([track], tagId, false);
            }
            for (const tagId of tagIds) {
                if (!current.includes(tagId)) setTrackTag([track], tagId, true);
            }
        }
    }, [setTrackTag]);

    /** Assign every id in `tagIds` that the track does not already have. */
    const addTags = useCallback((tracks: Track[], tagIds: string[]) => {
        for (const tagId of tagIds) setTrackTag(tracks, tagId, true);
    }, [setTrackTag]);

    const recordPlay = useCallback((track: Track) => {
        patch(track.relPath, current => ({ playCount: current.playCount + 1, lastPlayedAt: nowUnix() }));
        persist("record_play", { path: track.relPath });
    }, [patch, persist]);

    const recordComplete = useCallback((track: Track) => {
        patch(track.relPath, () => ({ lastPlayedAt: nowUnix() }));
        persist("record_complete", { path: track.relPath });
    }, [patch, persist]);

    /** Plays that happened while the page was gone (Android, the app swiped away): `at` is when, in Unix seconds. */
    const recordMissed = useCallback(async (events: { track: Track; kind: "play" | "complete"; at: number }[]) => {
        if (events.length === 0) return;
        for (const { track, kind, at } of events) {
            await persist(kind === "play" ? "record_play" : "record_complete", { path: track.relPath, at });
        }
        reload();
    }, [persist, reload]);

    // An empty library shows none (not those of the library opened before).
    return {
        stats: files.length > 0 ? stats : NO_STATS,
        reload,
        setFavorite,
        toggleFavorite,
        setRating,
        setTrackTag,
        replaceTags,
        addTags,
        recordPlay,
        recordComplete,
        recordMissed,
    };
};
