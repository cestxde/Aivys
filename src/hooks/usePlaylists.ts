import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Playlist, SmartRules, SortSpec, Track } from "../types";
import { notifyError } from "../utils/notify";

/**
 * The library's playlists (`.aivys/playlists/`). Reloaded after every scan;
 * every change goes through the backend, and the returned playlist replaces
 * the local copy. Failures are reported and return null.
 */
export const usePlaylists = (files: Track[]) => {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);

    useEffect(() => {
        if (files.length === 0) return;
        let cancelled = false;
        invoke<Playlist[]>("list_playlists")
            .then(loaded => {
                if (!cancelled) setPlaylists(loaded);
            })
            .catch(e => notifyError("Could not load playlists", e));
        return () => {
            cancelled = true;
        };
    }, [files]);

    const upsert = useCallback((playlist: Playlist) => {
        setPlaylists(prev => prev.some(p => p.id === playlist.id)
            ? prev.map(p => (p.id === playlist.id ? playlist : p))
            : [...prev, playlist]);
    }, []);

    /** Run a command that returns the updated playlist. */
    const change = useCallback(async (
        command: string,
        args: Record<string, unknown>,
        failure: string
    ): Promise<Playlist | null> => {
        try {
            const playlist = await invoke<Playlist>(command, args);
            upsert(playlist);
            return playlist;
        } catch (e) {
            notifyError(failure, e);
            return null;
        }
    }, [upsert]);

    const createManual = useCallback((name: string) =>
        change("create_manual_playlist", { name }, "Could not create the playlist"), [change]);

    const createSmart = useCallback((name: string, rules: SmartRules) =>
        change("create_smart_playlist", { name, rules }, "Could not create the smart playlist"), [change]);

    const rename = useCallback((id: string, name: string) =>
        change("rename_playlist", { id, name }, "Could not rename the playlist"), [change]);

    const setSort = useCallback((id: string, sort: SortSpec) =>
        change("set_playlist_sort", { id, sort }, "Could not save the playlist order"), [change]);

    const setRules = useCallback((id: string, rules: SmartRules) =>
        change("set_playlist_rules", { id, rules }, "Could not save the rules"), [change]);

    const addTracks = useCallback((id: string, paths: string[]) =>
        change("add_to_playlist", { id, paths }, "Could not add to the playlist"), [change]);

    const removeItems = useCallback((id: string, itemIds: string[]) =>
        change("remove_from_playlist", { id, itemIds }, "Could not remove from the playlist"), [change]);

    const setCover = useCallback((id: string, sourcePath: string) =>
        change("set_playlist_cover", { id, sourcePath }, "Could not set the cover"), [change]);

    const clearCover = useCallback((id: string) =>
        change("clear_playlist_cover", { id }, "Could not remove the cover"), [change]);

    /** Reorder immediately, then persist (restoring the old order on failure). */
    const reorder = useCallback(async (id: string, itemIds: string[]) => {
        let previous: Playlist | undefined;
        setPlaylists(prev => prev.map(p => {
            if (p.id !== id || !p.items) return p;
            previous = p;
            const byId = new Map(p.items.map(item => [item.id, item]));
            const items = itemIds.flatMap(itemId => byId.get(itemId) ?? []);
            return { ...p, items };
        }));
        const saved = await change("reorder_playlist", { id, itemIds }, "Could not save the new order");
        if (!saved && previous) upsert(previous);
    }, [change, upsert]);

    const remove = useCallback(async (id: string): Promise<boolean> => {
        try {
            await invoke("delete_playlist", { id });
            setPlaylists(prev => prev.filter(p => p.id !== id));
            return true;
        } catch (e) {
            notifyError("Could not delete the playlist", e);
            return false;
        }
    }, []);

    return {
        playlists,
        createManual, createSmart, rename, setSort, setRules,
        addTracks, removeItems, reorder, remove, setCover, clearCover,
    };
};
