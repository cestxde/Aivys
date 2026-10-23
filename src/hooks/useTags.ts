import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Track, UserTag } from "../types";
import { notifyError } from "../utils/notify";
import { t } from "../i18n";

/**
 * The library's user tags (`.aivys/tags.json`), sorted by name. Reloaded
 * after every scan; changes go through the backend and the returned tag
 * replaces the local copy. Failures are reported and return null/false.
 */
export const useTags = (files: Track[]) => {
    const [loaded, setLoaded] = useState<UserTag[]>([]);

    useEffect(() => {
        if (files.length === 0) return;
        let cancelled = false;
        invoke<UserTag[]>("list_tags")
            .then(tags => {
                if (!cancelled) setLoaded(tags);
            })
            .catch(e => notifyError(t("error.loadTags"), e));
        return () => {
            cancelled = true;
        };
    }, [files]);

    const tags = useMemo(() => [...loaded].sort((a, b) => a.name.localeCompare(b.name)), [loaded]);
    const byId = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags]);

    const upsert = useCallback((tag: UserTag) => {
        setLoaded(prev => prev.some(t => t.id === tag.id)
            ? prev.map(t => (t.id === tag.id ? tag : t))
            : [...prev, tag]);
    }, []);

    const create = useCallback(async (name: string, color: string): Promise<UserTag | null> => {
        try {
            const tag = await invoke<UserTag>("create_tag", { name, color });
            upsert(tag);
            return tag;
        } catch (e) {
            notifyError(t("error.createTag"), e);
            return null;
        }
    }, [upsert]);

    const update = useCallback(async (id: string, change: { name?: string; color?: string }): Promise<UserTag | null> => {
        try {
            const tag = await invoke<UserTag>("update_tag", { id, ...change });
            upsert(tag);
            return tag;
        } catch (e) {
            notifyError(t("error.saveTag"), e);
            return null;
        }
    }, [upsert]);

    /** Delete the tag; its assignments are ignored from then on (reload stats). */
    const remove = useCallback(async (id: string): Promise<boolean> => {
        try {
            await invoke("delete_tag", { id });
            setLoaded(prev => prev.filter(t => t.id !== id));
            return true;
        } catch (e) {
            notifyError(t("error.deleteTag"), e);
            return false;
        }
    }, []);

    return { tags, byId, create, update, remove };
};
