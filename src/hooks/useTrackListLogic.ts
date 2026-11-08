import { useState, useMemo } from "react";
import type { ListRow, Track } from "../types";
import { presentScripts } from "../utils/scripts";
import { useSearch } from "./useSearch";

/** Plain substring filter, used only when the backend search is unavailable. */
const filterLocally = (rows: ListRow[], query: string): ListRow[] => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ track: f }) =>
        (f.title ?? f.name).toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.artists.some(a => a.toLowerCase().includes(q)) ||
        (f.album ?? "").toLowerCase().includes(q)
    );
};

const matchesScripts = (track: Track, mask: number) =>
    mask === 0 || (track.scripts & mask) !== 0;

/** Search within the rows of the current view, plus "shuffle all". */
export const useTrackListLogic = (
    viewRows: ListRow[],
    playTrack: (track: Track, tracks: Track[], options?: { shuffle?: boolean }) => void
) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [scriptMask, setScriptMask] = useState(0);
    const search = useSearch(searchQuery);

    const availableScripts = useMemo(
        () => presentScripts(viewRows.map(row => row.track.scripts)),
        [viewRows],
    );

    // While searching, show the view's matches in relevance order.
    // `looseFromIndex` is where matches via transliteration/typos start
    // (-1: none), so the list can set them apart.
    const { displayRows, looseFromIndex } = useMemo(() => {
        const byScripts = (rows: ListRow[]) =>
            scriptMask === 0 ? rows : rows.filter(row => matchesScripts(row.track, scriptMask));

        if (search.hits) {
            const rowsByPath = new Map<string, ListRow[]>();
            for (const row of viewRows) {
                if (!matchesScripts(row.track, scriptMask)) continue;
                const list = rowsByPath.get(row.track.relPath) ?? [];
                list.push(row);
                rowsByPath.set(row.track.relPath, list);
            }
            const matched: ListRow[] = [];
            let loose = -1;
            for (const hit of search.hits) {
                const rows = rowsByPath.get(hit.relPath);
                if (!rows) continue;
                if (loose < 0 && hit.kind !== "exact") loose = matched.length;
                matched.push(...rows);
            }
            return { displayRows: matched, looseFromIndex: loose };
        }
        if (search.failed) {
            return { displayRows: byScripts(filterLocally(viewRows, searchQuery)), looseFromIndex: -1 };
        }
        return { displayRows: byScripts(viewRows), looseFromIndex: -1 };
    }, [viewRows, search.hits, search.failed, searchQuery, scriptMask]);

    const displayFiles = useMemo(() => displayRows.map(row => row.track), [displayRows]);

    // A random track first, then the rest shuffled.
    const handleShuffleAll = () => {
        if (displayFiles.length > 0) {
            const randomTrack = displayFiles[Math.floor(Math.random() * displayFiles.length)];
            playTrack(randomTrack, displayFiles, { shuffle: true });
        }
    };

    const clearSearch = () => {
        setSearchQuery("");
        setScriptMask(0);
    };

    const toggleScript = (bit: number) => {
        setScriptMask(mask => (mask & bit ? mask & ~bit : mask | bit));
    };

    return {
        searchQuery,
        setSearchQuery,
        scriptMask,
        setScriptMask,
        toggleScript,
        clearSearch,
        availableScripts,
        displayRows,
        displayFiles,
        looseFromIndex,
        /** Text query is active (results in relevance order). */
        isSearching: searchQuery.trim() !== "",
        /** Text query and/or writing-system filter. */
        isFiltering: searchQuery.trim() !== "" || scriptMask !== 0,
        handleShuffleAll
    };
};
