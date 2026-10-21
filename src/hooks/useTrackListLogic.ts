import { useState, useMemo } from "react";
import type { Track, SortOrder } from "../types";

export const useTrackListLogic = (
    files: Track[],
    isShuffle: boolean,
    toggleShuffle: (currentFiles: Track[]) => void,
    playTrack: (track: Track, currentFiles: Track[]) => void
) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState<SortOrder>('date');

    const displayFiles = useMemo(() => {
        let result = [...files];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(f =>
                (f.title ?? f.name).toLowerCase().includes(q) ||
                f.name.toLowerCase().includes(q) ||
                f.artists.some(a => a.toLowerCase().includes(q)) ||
                (f.album ?? "").toLowerCase().includes(q)
            );
        }

        result.sort((a, b) => {
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

        return result;
    }, [files, searchQuery, sortOrder]);

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
        handleShuffleAll
    };
};