import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SearchHit } from "../types";
import { notifyError } from "../utils/notify";

/** Wait this long after the last keystroke before searching. */
const DEBOUNCE_MS = 120;
/** Upper bound of results per query. */
const SEARCH_LIMIT = 500;

interface SearchState {
    query: string;
    hits: SearchHit[] | null;
    failed: boolean;
}

/**
 * Library search through the backend index (layout, transliteration and
 * typo tolerant). `hits` is null while there is no query; while a new query
 * is in flight the previous results stay, to avoid flicker. `failed` means
 * the index is unavailable and the caller should filter locally.
 */
export const useSearch = (query: string) => {
    const [state, setState] = useState<SearchState>({ query: "", hits: null, failed: false });
    const active = query.trim() !== "";

    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                // The raw query: a trailing space means the last word is complete.
                const hits = await invoke<SearchHit[]>("search_tracks", { query, limit: SEARCH_LIMIT });
                if (!cancelled) setState({ query, hits, failed: false });
            } catch (e) {
                notifyError("Search index unavailable, using simple search", e);
                if (!cancelled) setState({ query, hits: null, failed: true });
            }
        }, DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, active]);

    if (!active) return { hits: null, failed: false };
    return { hits: state.hits, failed: state.failed };
};
