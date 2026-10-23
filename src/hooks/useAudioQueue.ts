import { useState } from "react";
import type { Track, RepeatMode } from "../types";

/** Fisher-Yates shuffle. Returns a new shuffled array, leaving the input intact. */
const shuffleArray = (array: Track[]): Track[] => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

export const useAudioQueue = (
    isShuffle: boolean,
    setIsShuffle: (val: boolean) => void,
    repeatMode: RepeatMode,
    setRepeatMode: (val: RepeatMode) => void
) => {
    const [queue, setQueue] = useState<Track[]>([]);

    const buildQueue = (files: Track[], activeTrack: Track, shuffle: boolean) => {
        if (!shuffle) {
            setQueue(files);
            return;
        }
        // If shuffle is ON: current track goes first, the rest are shuffled.
        const others = files.filter(f => f.path !== activeTrack.path);
        setQueue([activeTrack, ...shuffleArray(others)]);
    };

    const getNextTrack = (currentPath: string | null): Track | null => {
        if (queue.length === 0 || !currentPath) return null;
        const idx = queue.findIndex(f => f.path === currentPath);
        if (idx === -1) return null;

        return idx === queue.length - 1 ? queue[0] : queue[idx + 1];
    };

    const getPrevTrack = (currentPath: string | null): Track | null => {
        if (queue.length === 0 || !currentPath) return null;
        const idx = queue.findIndex(f => f.path === currentPath);
        if (idx === -1) return null;

        return idx === 0 ? queue[queue.length - 1] : queue[idx - 1];
    };

    /** Insert `tracks` right after the current track (or at the end). */
    const insertNext = (currentPath: string | null, tracks: Track[]) => {
        setQueue(prev => {
            const idx = currentPath ? prev.findIndex(f => f.path === currentPath) : -1;
            if (idx === -1) return [...prev, ...tracks];
            return [...prev.slice(0, idx + 1), ...tracks, ...prev.slice(idx + 1)];
        });
    };

    const append = (tracks: Track[]) => setQueue(prev => [...prev, ...tracks]);

    return {
        queue, setQueue,
        insertNext, append,
        isShuffle, setIsShuffle,
        repeatMode, setRepeatMode,
        buildQueue,
        getNextTrack,
        getPrevTrack,
    };
};