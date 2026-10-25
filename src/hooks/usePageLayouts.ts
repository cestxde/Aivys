import { useCallback, useState } from "react";
import type { PlaylistsLayout } from "../components/PlaylistsPage/PlaylistsPage";

/** Collection pages with a grid / list switch. */
export type LayoutPage = "playlists" | "artists" | "albums" | "tags";

type Layouts = Record<LayoutPage, PlaylistsLayout>;

// Device-local view preferences; a failing storage just means no memory.
const KEY = "aivys.layouts";
// Before layouts were per page, only the playlists page had one.
const LEGACY_KEY = "aivys.playlistsLayout";

const DEFAULTS: Layouts = { playlists: "grid", artists: "grid", albums: "grid", tags: "grid" };

const load = (): Layouts => {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<string, unknown>>;
        const layouts = { ...DEFAULTS };
        if (localStorage.getItem(LEGACY_KEY) === "list") layouts.playlists = "list";
        for (const page of Object.keys(DEFAULTS) as LayoutPage[]) {
            const value = stored[page];
            if (value === "grid" || value === "list") layouts[page] = value;
        }
        return layouts;
    } catch {
        return DEFAULTS;
    }
};

/** Grid or list, remembered separately for every collection page. */
export const usePageLayouts = () => {
    const [layouts, setLayouts] = useState<Layouts>(load);

    const setLayout = useCallback((page: LayoutPage, layout: PlaylistsLayout) => {
        setLayouts(prev => {
            const next = { ...prev, [page]: layout };
            try {
                localStorage.setItem(KEY, JSON.stringify(next));
            } catch {
                // Not remembered; fine.
            }
            return next;
        });
    }, []);

    return { layouts, setLayout };
};
