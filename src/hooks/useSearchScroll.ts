import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Scroll position of the track list across a search: every new query starts
 * at the top, and clearing the search returns to where the view was before.
 * `viewKey` identifies the view, so a position is only restored where it was
 * taken. Attach `ref` and `onScroll` to the scroll container.
 */
export const useSearchScroll = (query: string, viewKey: string) => {
    const ref = useRef<HTMLDivElement>(null);
    // Last position outside a search.
    const saved = useRef<{ viewKey: string; top: number } | null>(null);
    const searching = query.trim() !== "";
    const wasSearching = useRef(searching);

    // Before paint, so the list never flashes at the wrong position.
    useLayoutEffect(() => {
        const element = ref.current;
        if (element) {
            if (searching) element.scrollTop = 0;
            else if (wasSearching.current && saved.current?.viewKey === viewKey) element.scrollTop = saved.current.top;
        }
        wasSearching.current = searching;
    }, [query, searching, viewKey]);

    const onScroll = useCallback(() => {
        if (!searching && ref.current) saved.current = { viewKey, top: ref.current.scrollTop };
    }, [searching, viewKey]);

    return { ref, onScroll };
};
