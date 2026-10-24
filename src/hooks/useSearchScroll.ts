import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Scroll position of the track list: every view keeps its own (switching from
 * the library to an album and back returns to the same place), every new
 * search query starts at the top, and clearing the search returns to where
 * the view was before. Attach `ref` and `onScroll` to the scroll container.
 */
export const useSearchScroll = (query: string, viewKey: string) => {
    const ref = useRef<HTMLDivElement>(null);
    // Last position of each view outside a search.
    const saved = useRef(new Map<string, number>());
    const searching = query.trim() !== "";
    const wasSearching = useRef(searching);
    const shownKey = useRef(viewKey);

    // Before paint, so the list never flashes at the wrong position.
    useLayoutEffect(() => {
        const element = ref.current;
        if (element) {
            if (searching) element.scrollTop = 0;
            else if (wasSearching.current || shownKey.current !== viewKey) {
                element.scrollTop = saved.current.get(viewKey) ?? 0;
            }
        }
        wasSearching.current = searching;
        shownKey.current = viewKey;
    }, [query, searching, viewKey]);

    const onScroll = useCallback(() => {
        if (!searching && ref.current) saved.current.set(viewKey, ref.current.scrollTop);
    }, [searching, viewKey]);

    return { ref, onScroll };
};
