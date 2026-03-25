import { useState, useMemo } from "react";
import type { AudioFile } from "../types";

export const useTrackListLogic = (
    files: AudioFile[],
    isShuffle: boolean,
    toggleShuffle: (currentFiles: AudioFile[]) => void,
    playTrack: (track: AudioFile, currentFiles: AudioFile[]) => void
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
            if (sortOrder === 'date') return (b.modified || 0) - (a.modified || 0);
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