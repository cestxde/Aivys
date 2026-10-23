import { useState, useMemo } from "react";
import type { ListRow, Track } from "../types";
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

/** Search within the rows of the current view, plus "shuffle all". */
export const useTrackListLogic = (
    viewRows: ListRow[],
    isShuffle: boolean,
    toggleShuffle: (currentFiles: Track[]) => void,
    playTrack: (track: Track, currentFiles: Track[]) => void
) => {
    const [searchQuery, setSearchQuery] = useState("");
    const search = useSearch(searchQuery);

    // While searching, show the view's matches in relevance order.
    // `looseFromIndex` is where matches via transliteration/typos start
    // (-1: none), so the list can set them apart.
    const { displayRows, looseFromIndex } = useMemo(() => {
        if (search.hits) {
            const rowsByPath = new Map<string, ListRow[]>();
            for (const row of viewRows) {
                const list = rowsByPath.get(row.track.relPath) ?? [];
                list.push(row);
                rowsByPath.set(row.track.relPath, list);
            }
            const matched: ListRow[] = [];
            let loose = -1;
            for (const hit of search.hits) {
                const rows = rowsByPath.get(hit.relPath);
                if (!rows) continue;
                if (loose < 0 && hit.kind !== 'exact') loose = matched.length;
                matched.push(...rows);
            }
            return { displayRows: matched, looseFromIndex: loose };
        }
        if (search.failed) {
            return { displayRows: filterLocally(viewRows, searchQuery), looseFromIndex: -1 };
        }
        return { displayRows: viewRows, looseFromIndex: -1 };
    }, [viewRows, search.hits, search.failed, searchQuery]);

    const displayFiles = useMemo(() => displayRows.map(row => row.track), [displayRows]);

    const handleShuffleAll = () => {
        if (displayFiles.length > 0) {
            const randomIndex = Math.floor(Math.random() * displayFiles.length);
            const randomTrack = displayFiles[randomIndex];

            if (!isShuffle) {
                toggleShuffle(displayFiles);
            }

            playTrack(randomTrack, displayFiles);
        }
    };

    return {
        searchQuery,
        setSearchQuery,
        displayRows,
        displayFiles,
        looseFromIndex,
        isSearching: searchQuery.trim() !== "",
        handleShuffleAll
    };
};
