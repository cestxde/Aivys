import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ListRow, Playlist, Track, TrackStats, View } from "../types";
import { systemViewTracks, tagTracks } from "../utils/views";
import { notifyError } from "../utils/notify";

/**
 * Current track paths of a smart playlist, re-evaluated when its rules change
 * or when stats change (rules can depend on ratings, plays, favorites).
 */
const useSmartPaths = (playlist: Playlist | null, stats: Record<string, TrackStats>) => {
    const [result, setResult] = useState<{ id: string; paths: string[] } | null>(null);
    const id = playlist?.type === 'smart' ? playlist.id : null;
    const updatedAt = playlist?.updatedAt;

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        invoke<string[]>("get_smart_playlist_tracks", { id })
            .then(paths => {
                if (!cancelled) setResult({ id, paths });
            })
            .catch(e => notifyError("Could not evaluate the smart playlist", e));
        return () => {
            cancelled = true;
        };
    }, [id, updatedAt, stats]);

    return result && result.id === id ? result.paths : [];
};

const rowsOf = (tracks: Track[]): ListRow[] => tracks.map(track => ({ key: track.path, track }));

/**
 * The rows the track list shows for `view`, in the view's own order (sorting
 * is applied on top by the caller). Artists, albums and folders show
 * `groupTracks`.
 */
export const useViewRows = (
    view: View,
    files: Track[],
    stats: Record<string, TrackStats>,
    playlists: Playlist[],
    groupTracks: Track[] | null
) => {
    const playlist = view.kind === 'playlist'
        ? playlists.find(p => p.id === view.id) ?? null
        : null;
    const smartPaths = useSmartPaths(playlist, stats);

    const byRelPath = useMemo(() => new Map(files.map(f => [f.relPath, f])), [files]);

    const { rows, missingCount } = useMemo(() => {
        if (view.kind === 'system') {
            return { rows: rowsOf(systemViewTracks(files, view.id, stats)), missingCount: 0 };
        }
        if (view.kind === 'artist' || view.kind === 'album' || view.kind === 'folder') {
            return { rows: rowsOf(groupTracks ?? []), missingCount: 0 };
        }
        if (view.kind === 'tag') {
            return { rows: rowsOf(tagTracks(files, view.id, stats)), missingCount: 0 };
        }
        if (!playlist) return { rows: [], missingCount: 0 };

        if (playlist.type === 'smart') {
            const tracks = smartPaths.flatMap(path => byRelPath.get(path) ?? []);
            return { rows: rowsOf(tracks), missingCount: 0 };
        }

        // Entries whose file is gone stay in the playlist (it may come back),
        // they are just not listed.
        let missing = 0;
        const rows: ListRow[] = [];
        for (const item of playlist.items ?? []) {
            const track = byRelPath.get(item.path);
            if (track) rows.push({ key: item.id, track, itemId: item.id });
            else missing++;
        }
        return { rows, missingCount: missing };
    }, [view, files, stats, playlist, smartPaths, byRelPath, groupTracks]);

    return { rows, missingCount, playlist };
};
