import { useState, useMemo } from "react";
import type { Track, SortOrder, LibraryView, TrackStats } from "../types";
import { useSearch } from "./useSearch";

/** Display cap of the "recently/most played" lists (more can come later). */
const HISTORY_LIMIT = 100;

const sortTracks = (files: Track[], sortOrder: SortOrder): Track[] =>
    [...files].sort((a, b) => {
        if (sortOrder === 'date') return (b.dateCreated || 0) - (a.dateCreated || 0);
        if (sortOrder === 'duration') return b.duration - a.duration;
        if (sortOrder === 'artist') {
            const aArtist = a.artists[0] ?? "";
            const bArtist = b.artists[0] ?? "";
            return aArtist.localeCompare(bArtist);
        }
        if (sortOrder === 'album') {
            return (a.album ?? "").localeCompare(b.album ?? "");
        }
        // 'name' (and 'manual' until manual ordering exists) => by title, fallback to filename
        return (a.title ?? a.name).localeCompare(b.title ?? b.name);
    });

/** The tracks of a view in its natural order. Only the library is user-sortable. */
const viewTracks = (
    files: Track[],
    view: LibraryView,
    stats: Record<string, TrackStats>,
    sortOrder: SortOrder
): Track[] => {
    const of = (track: Track) => stats[track.relPath];
    switch (view) {
        case 'library':
            return sortTracks(files, sortOrder);
        case 'favorites':
            return files
                .filter(f => of(f)?.favorite)
                .sort((a, b) => (of(b)?.favoritedAt ?? 0) - (of(a)?.favoritedAt ?? 0));
        case 'recentlyPlayed':
            return files
                .filter(f => of(f)?.lastPlayedAt != null)
                .sort((a, b) => (of(b)?.lastPlayedAt ?? 0) - (of(a)?.lastPlayedAt ?? 0))
                .slice(0, HISTORY_LIMIT);
        case 'mostPlayed':
            return files
                .filter(f => (of(f)?.playCount ?? 0) > 0)
                .sort((a, b) =>
                    (of(b)?.playCount ?? 0) - (of(a)?.playCount ?? 0) ||
                    (of(b)?.lastPlayedAt ?? 0) - (of(a)?.lastPlayedAt ?? 0))
                .slice(0, HISTORY_LIMIT);
    }
};

/** Plain substring filter, used only when the backend search is unavailable. */
const filterLocally = (files: Track[], query: string): Track[] => {
    const q = query.trim().toLowerCase();
    return files.filter(f =>
        (f.title ?? f.name).toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.artists.some(a => a.toLowerCase().includes(q)) ||
        (f.album ?? "").toLowerCase().includes(q)
    );
};

export const useTrackListLogic = (
    files: Track[],
    view: LibraryView,
    stats: Record<string, TrackStats>,
    isShuffle: boolean,
    toggleShuffle: (currentFiles: Track[]) => void,
    playTrack: (track: Track, currentFiles: Track[]) => void
) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState<SortOrder>('date');
    const search = useSearch(searchQuery);

    const viewFiles = useMemo(
        () => viewTracks(files, view, stats, sortOrder),
        [files, view, stats, sortOrder]
    );

    // While searching, show the current view's matches in relevance order.
    // `looseFromIndex` is where matches via transliteration/typos start
    // (-1: none), so the list can set them apart.
    const { displayFiles, looseFromIndex } = useMemo(() => {
        if (search.hits) {
            const inView = new Map(viewFiles.map(f => [f.relPath, f]));
            const matched: Track[] = [];
            let loose = -1;
            for (const hit of search.hits) {
                const track = inView.get(hit.relPath);
                if (!track) continue;
                if (loose < 0 && hit.kind !== 'exact') loose = matched.length;
                matched.push(track);
            }
            return { displayFiles: matched, looseFromIndex: loose };
        }
        if (search.failed) {
            return { displayFiles: filterLocally(viewFiles, searchQuery), looseFromIndex: -1 };
        }
        return { displayFiles: viewFiles, looseFromIndex: -1 };
    }, [viewFiles, search.hits, search.failed, searchQuery]);

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
        sortOrder,
        setSortOrder,
        displayFiles,
        looseFromIndex,
        isSearching: searchQuery.trim() !== "",
        handleShuffleAll
    };
};
