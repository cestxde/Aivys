import { useCallback, useState } from "react";
import type { View } from "../types";
import { DEFAULT_SORT, type ListDisplay, type SortField, type ViewSort } from "../utils/sort";

/**
 * Views that share a remembered sort: one per built-in view, one for all
 * tags, all artists, ... A manual playlist keeps its sort in its own file.
 */
export type SortScope =
    | 'library' | 'favorites' | 'recentlyPlayed' | 'mostPlayed'
    | 'tag' | 'artist' | 'album' | 'folder' | 'smart';

export const sortScopeOf = (view: View, playlistType: 'manual' | 'smart' | null): SortScope | null => {
    switch (view.kind) {
        case 'system': return view.id;
        case 'tag':
        case 'artist':
        case 'album':
        case 'folder': return view.kind;
        case 'playlist': return playlistType === 'smart' ? 'smart' : null;
        default: return null;
    }
};

const NEWEST: ViewSort = { field: 'addedAt', dir: 'desc' };

/** The library and tags have no order of their own worth keeping. */
const DEFAULTS: Record<SortScope, ViewSort> = {
    library: NEWEST,
    tag: NEWEST,
    favorites: DEFAULT_SORT,
    recentlyPlayed: DEFAULT_SORT,
    mostPlayed: DEFAULT_SORT,
    artist: DEFAULT_SORT,
    album: DEFAULT_SORT,
    folder: DEFAULT_SORT,
    smart: DEFAULT_SORT,
};

// Device-local view preferences; a failing storage just means no memory.
const SORTS_KEY = "aivys.sorts";
const DISPLAY_KEY = "aivys.listDisplays";
// Before each view had its own: one for all, now what a view starts with.
const OLD_DISPLAY_KEY = "aivys.listDisplay";

const FIELDS: SortField[] = ['default', 'addedAt', 'title', 'artist', 'album', 'duration', 'year'];

const isSort = (value: unknown): value is ViewSort => {
    const sort = value as Partial<ViewSort> | null;
    return !!sort && FIELDS.includes(sort.field as SortField) && (sort.dir === 'asc' || sort.dir === 'desc');
};

const loadSorts = (): Record<SortScope, ViewSort> => {
    const sorts = { ...DEFAULTS };
    try {
        const stored = JSON.parse(localStorage.getItem(SORTS_KEY) ?? "{}") as Record<string, unknown>;
        for (const scope of Object.keys(DEFAULTS) as SortScope[]) {
            if (isSort(stored[scope])) sorts[scope] = stored[scope];
        }
    } catch {
        // Defaults.
    }
    return sorts;
};

/**
 * Where a view keeps its display: its sort scope, or "playlist" for manual
 * playlists (which keep their sort in their own files).
 */
export type DisplayScope = SortScope | 'playlist';

const loadDisplays = (): { all: Partial<Record<DisplayScope, ListDisplay>>; fallback: ListDisplay } => {
    try {
        const fallback = localStorage.getItem(OLD_DISPLAY_KEY) === "sections" ? "sections" : "inline";
        const stored = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? "{}") as Record<string, unknown>;
        const all: Partial<Record<DisplayScope, ListDisplay>> = {};
        for (const [scope, display] of Object.entries(stored)) {
            if (display === "sections" || display === "inline") all[scope as DisplayScope] = display;
        }
        return { all, fallback };
    } catch {
        return { all: {}, fallback: "inline" };
    }
};

const save = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Not remembered; fine.
    }
};

/** The remembered sort of every scope, and how each view displays its sorted list. */
export const useViewSorts = () => {
    const [sorts, setSorts] = useState(loadSorts);
    const [displays, setDisplays] = useState(loadDisplays);

    const setSort = useCallback((scope: SortScope, sort: ViewSort) => {
        setSorts(prev => {
            const next = { ...prev, [scope]: sort };
            save(SORTS_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const displayOf = useCallback(
        (scope: DisplayScope): ListDisplay => displays.all[scope] ?? displays.fallback,
        [displays],
    );

    const setDisplay = useCallback((scope: DisplayScope, next: ListDisplay) => {
        setDisplays(prev => {
            const all = { ...prev.all, [scope]: next };
            save(DISPLAY_KEY, JSON.stringify(all));
            return { ...prev, all };
        });
    }, []);

    return { sorts, setSort, displayOf, setDisplay };
};
