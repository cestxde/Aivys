import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types";
import { notifyError } from "../utils/notify";
import { t } from "../i18n";

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

    const scan = useCallback(async (basePath: string): Promise<Track[] | null> => {
        if (!basePath) return null;
        setIsLoading(true);
        setError(null);
        try {
            const result = await invoke<Track[]>("scan_directory", { basePath });
            setFiles(result);
            return result;
        } catch (e) {
            notifyError(t("error.scan"), e);
            setError(String(e));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { files, setFiles, isLoading, error, validate, scan };
};
