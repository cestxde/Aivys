import { useState } from "react";
import type { AudioFile } from "../types";

export const useAudioQueue = (
    isShuffle: boolean,
    setIsShuffle: (val: boolean) => void,
    repeatMode: 'none' | 'one' | 'all',
    setRepeatMode: (val: 'none' | 'one' | 'all') => void
) => {
    const [queue, setQueue] = useState<AudioFile[]>([]);

    // Fisher-Yates shuffle algorithm
    const shuffleArray = (array: AudioFile[]) => {
        const newArr = [...array];
        for (let i = newArr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
        return newArr;
    };

    const buildQueue = (files: AudioFile[], activeTrack: AudioFile, shuffle: boolean) => {
        if (!shuffle) {
            setQueue(files);
            return;
        }
        // If shuffle is ON: current track goes first, others are shuffled
        const others = files.filter(f => f.path !== activeTrack.path);
        setQueue([activeTrack, ...shuffleArray(others)]);
    };

    const getNextTrack = (currentPath: string | null): AudioFile | null => {
        if (queue.length === 0 || !currentPath) return null;
        const idx = queue.findIndex(f => f.path === currentPath);

        if (idx === queue.length - 1) return queue[0];
        return queue[idx + 1];
    };

    const getPrevTrack = (currentPath: string | null): AudioFile | null => {
        if (queue.length === 0 || !currentPath) return null;
        const idx = queue.findIndex(f => f.path === currentPath);

        if (idx === 0) return queue[queue.length - 1];
        return queue[idx - 1];
    };

    return {
        queue, setQueue,
        isShuffle, setIsShuffle,
        repeatMode, setRepeatMode,
        buildQueue,
        getNextTrack,
        getPrevTrack,
        shuffleArray
    };
};