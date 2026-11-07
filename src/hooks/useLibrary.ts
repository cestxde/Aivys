import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types";
import { notifyError } from "../utils/notify";
import { t } from "../i18n";

/** Whether two scans found the same tracks, as far as the page can tell. */
const sameTracks = (a: Track[], b: Track[]) => a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

/**
 * Owns the track library: the scanned file list and the scan operation.
 * Kept separate from playback so it can later be backed by a database instead
 * of a directory scan, without touching the player.
 */
export const useLibrary = () => {
    const [files, setFiles] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** Check whether a folder still exists on disk. */
    const validate = useCallback(async (path: string): Promise<boolean> => {
        try {
            return await invoke<boolean>("validate_directory", { path });
        } catch {
            return false;
        }
    }, []);

    // The folder the library was last asked for: a background scan of another one is dropped.
    const current = useRef("");

    /**
     * The library as the last scan left it, at once and without checking the
     * folder (`scan` in the background does that after). Null when it was
     * not scanned yet.
     */
    const loadIndexed = useCallback(async (basePath: string): Promise<Track[] | null> => {
        if (!basePath) return null;
        current.current = basePath;
        try {
            const result = await invoke<Track[]>("cached_tracks", { basePath });
            if (result.length === 0) return null;
            setFiles(result);
            return result;
        } catch (e) {
            console.error(e);
            return null;
        }
    }, []);

    /**
     * Scan the folder. In the background the library stays as it is, shown,
     * (it was loaded with `loadIndexed`) and is replaced when the scan found
     * a change.
     */
    const scan = useCallback(async (basePath: string, options: { background?: boolean } = {}): Promise<Track[] | null> => {
        if (!basePath) return null;
        const background = options.background ?? false;
        current.current = basePath;
        if (!background) {
            setIsLoading(true);
            setError(null);
        }
        try {
            const result = await invoke<Track[]>("scan_directory", { basePath, reuseStore: background });
            if (!background) {
                setFiles(result);
            } else if (current.current === basePath) {
                setFiles(shown => sameTracks(shown, result) ? shown : result);
            }
            return result;
        } catch (e) {
            notifyError(t("error.scan"), e);
            if (!background) setError(String(e));
            return null;
        } finally {
            if (!background) setIsLoading(false);
        }
    }, []);

    return { files, setFiles, isLoading, error, validate, scan, loadIndexed };
};
