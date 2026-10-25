import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TagCategory, Track, UserTag } from "../types";
import { notifyError } from "../utils/notify";
import { isTagSort, type TagSort } from "../utils/tags";
import { useStoredState } from "./useRemembered";
import { t } from "../i18n";

/** How tags are ordered (tags page and picker alike), kept on this device. */
export const useTagSort = () => useStoredState<TagSort>("tags.sort", "count", isTagSort);

/** A tag change: only the given fields are written. */
export interface TagChange {
    name?: string;
    color?: string;
    categoryIds?: string[];
}

/**
 * The library's user tags (`.aivys/tags.json`), sorted by name, and their
 * categories in order. Reloaded after every scan; changes go through the
 * backend and what it returns replaces the local copy. Failures are reported
 * and return null/false.
 */
export const useTags = (files: Track[]) => {
    const [loaded, setLoaded] = useState<UserTag[]>([]);
    const [loadedCategories, setLoadedCategories] = useState<TagCategory[]>([]);

    useEffect(() => {
        if (files.length === 0) return;
        let cancelled = false;
        Promise.all([invoke<UserTag[]>("list_tags"), invoke<TagCategory[]>("list_tag_categories")])
            .then(([tags, categories]) => {
                if (cancelled) return;
                setLoaded(tags);
                setLoadedCategories(categories);
            })
            .catch(e => notifyError(t("error.loadTags"), e));
        return () => {
            cancelled = true;
        };
    }, [files]);

    // An empty library shows none (not those of the library opened before).
    const empty = files.length === 0;
    const tags = useMemo(() => (empty ? [] : [...loaded].sort((a, b) => a.name.localeCompare(b.name))), [loaded, empty]);
    const categories = empty ? [] : loadedCategories;
    const byId = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags]);

    const upsert = useCallback((tag: UserTag) => {
        setLoaded(prev => prev.some(t => t.id === tag.id)
            ? prev.map(t => (t.id === tag.id ? tag : t))
            : [...prev, tag]);
    }, []);

    const create = useCallback(async (name: string, color: string, categoryIds: string[] = []): Promise<UserTag | null> => {
        try {
            const tag = await invoke<UserTag>("create_tag", { name, color, categoryIds });
            upsert(tag);
            return tag;
        } catch (e) {
            notifyError(t("error.createTag"), e);
            return null;
        }
    }, [upsert]);

    const update = useCallback(async (id: string, change: TagChange): Promise<UserTag | null> => {
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

    const createCategory = useCallback(async (name: string): Promise<TagCategory | null> => {
        try {
            const category = await invoke<TagCategory>("create_tag_category", { name });
            setLoadedCategories(prev => [...prev, category]);
            return category;
        } catch (e) {
            notifyError(t("error.saveCategory"), e);
            return null;
        }
    }, []);

    const renameCategory = useCallback(async (id: string, name: string) => {
        try {
            const category = await invoke<TagCategory>("rename_tag_category", { id, name });
            setLoadedCategories(prev => prev.map(c => (c.id === id ? category : c)));
        } catch (e) {
            notifyError(t("error.saveCategory"), e);
        }
    }, []);

    /** Delete the category; its tags stay, in their other categories or in none. */
    const removeCategory = useCallback(async (id: string) => {
        try {
            await invoke("delete_tag_category", { id });
            setLoadedCategories(prev => prev.filter(c => c.id !== id));
            setLoaded(prev => prev.map(tag => tag.categoryIds?.includes(id)
                ? { ...tag, categoryIds: tag.categoryIds.filter(other => other !== id) }
                : tag));
        } catch (e) {
            notifyError(t("error.deleteCategory"), e);
        }
    }, []);

    /** Put the categories in the order of `ids`. */
    const reorderCategories = useCallback(async (ids: string[]) => {
        // Shown at once; the backend's order replaces it.
        setLoadedCategories(prev => [...prev].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
        try {
            setLoadedCategories(await invoke<TagCategory[]>("reorder_tag_categories", { ids }));
        } catch (e) {
            notifyError(t("error.saveCategory"), e);
        }
    }, []);

    return {
        tags, byId, create, update, remove,
        categories, createCategory, renameCategory, removeCategory, reorderCategories,
    };
};
