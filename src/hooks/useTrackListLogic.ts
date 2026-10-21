import { useState, useMemo } from "react";
import type { Track } from "../types";

export const useTrackListLogic = (
    files: Track[],
    isShuffle: boolean,
    toggleShuffle: (currentFiles: Track[]) => void,
    playTrack: (track: Track, currentFiles: Track[]) => void
) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState<'name' | 'date' | 'duration'>('date');

    const displayFiles = useMemo(() => {
        let result = [...files];

        if (searchQuery) {
            result = result.filter(f =>
                f.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        result.sort((a, b) => {
            if (sortOrder === 'date') return (b.dateCreated || 0) - (a.dateCreated || 0);
            if (sortOrder === 'duration') return b.duration - a.duration;
            return a.name.localeCompare(b.name);
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