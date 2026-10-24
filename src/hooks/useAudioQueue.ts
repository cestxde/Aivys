import { useCallback, useState } from "react";
import type { Track } from "../types";

/** Fisher-Yates shuffle. Returns a new shuffled array, leaving the input intact. */
const shuffleArray = (array: Track[]): Track[] => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

/**
 * The play queue. `source` is the list playback was started from, in its own
 * order; `order` is what plays (the source, or shuffled with the current track
 * first); `index` is the position in `order`, so a track listed twice plays
 * twice.
 */
interface Queue {
    source: Track[];
    order: Track[];
    index: number;
}

const EMPTY: Queue = { source: [], order: [], index: -1 };

/** `order` for a start at `start` of `source`. */
const arrange = (source: Track[], start: number, shuffle: boolean): Queue => {
    if (start < 0) return { source, order: source, index: source.length > 0 ? 0 : -1 };
    if (!shuffle) return { source, order: source, index: start };
    const others = source.filter((_, i) => i !== start);
    return { source, order: [source[start], ...shuffleArray(others)], index: 0 };
};

export const useAudioQueue = () => {
    const [queue, setQueue] = useState<Queue>(EMPTY);

    const current: Track | null = queue.order[queue.index] ?? null;

    /** Play `source` from its item `start`, shuffled or in order. */
    const start = useCallback((source: Track[], startIndex: number, shuffle: boolean): Track | null => {
        const next = arrange(source, startIndex, shuffle);
        setQueue(next);
        return next.order[next.index] ?? null;
    }, []);

    /** Shuffle or restore the source order, keeping the current track playing. */
    const setShuffled = useCallback((shuffle: boolean) => {
        setQueue(prev => {
            const playing = prev.order[prev.index];
            const at = playing ? prev.source.indexOf(playing) : -1;
            return arrange(prev.source, at, shuffle);
        });
    }, []);

    /** Position `step` away from the current one; -1 past either end unless `wrap`. */
    const indexAt = (step: number, wrap: boolean): number => {
        const length = queue.order.length;
        if (length === 0) return -1;
        const index = queue.index + step;
        if (index >= 0 && index < length) return index;
        return wrap ? (index % length + length) % length : -1;
    };

    /** The track `step` away, without moving. */
    const peek = (step: number, wrap: boolean): Track | null => queue.order[indexAt(step, wrap)] ?? null;

    /** Move by `step` and return the track there (null, without moving, past an end). */
    const move = (step: number, wrap: boolean): Track | null => {
        const index = indexAt(step, wrap);
        if (index < 0) return null;
        setQueue(prev => ({ ...prev, index }));
        return queue.order[index];
    };

    /** Go to position `index` and return the track there. */
    const jumpTo = (index: number): Track | null => {
        if (index < 0 || index >= queue.order.length) return null;
        setQueue(prev => ({ ...prev, index }));
        return queue.order[index];
    };

    /** Take the track at position `at` out (not the current one). */
    const removeAt = useCallback((at: number) => {
        setQueue(prev => {
            if (at === prev.index || at < 0 || at >= prev.order.length) return prev;
            const track = prev.order[at];
            const inSource = prev.source.indexOf(track);
            return {
                source: inSource >= 0 ? prev.source.filter((_, i) => i !== inSource) : prev.source,
                order: prev.order.filter((_, i) => i !== at),
                index: at < prev.index ? prev.index - 1 : prev.index,
            };
        });
    }, []);

    /**
     * Replace what comes after the current track (reordered or cleared). In
     * order (not shuffled) the source follows, so the order stays after
     * shuffling on and off.
     */
    const setUpcoming = useCallback((upcoming: Track[], inOrder: boolean) => {
        setQueue(prev => {
            const order = [...prev.order.slice(0, prev.index + 1), ...upcoming];
            return { source: inOrder ? order : prev.source, order, index: prev.index };
        });
    }, []);

    /** Insert `tracks` right after the current track (in the source order too). */
    const insertNext = useCallback((tracks: Track[]) => {
        setQueue(prev => {
            const playing = prev.order[prev.index];
            const inSource = playing ? prev.source.indexOf(playing) : -1;
            const source = [...prev.source.slice(0, inSource + 1), ...tracks, ...prev.source.slice(inSource + 1)];
            const order = [...prev.order.slice(0, prev.index + 1), ...tracks, ...prev.order.slice(prev.index + 1)];
            return { source, order, index: prev.index };
        });
    }, []);

    const append = useCallback((tracks: Track[]) => {
        setQueue(prev => ({ ...prev, source: [...prev.source, ...tracks], order: [...prev.order, ...tracks] }));
    }, []);

    /**
     * Follow a new scan of the library: tracks are replaced by their fresh
     * copies (by path), and those that are gone leave the queue.
     */
    const refresh = useCallback((files: Track[]) => {
        const byPath = new Map(files.map(file => [file.path, file]));
        setQueue(prev => {
            const fresh = (list: Track[]) => list.flatMap(track => byPath.get(track.path) ?? []);
            const playing = prev.order[prev.index];
            const before = prev.order.slice(0, prev.index).filter(track => byPath.has(track.path)).length;
            const order = fresh(prev.order);
            const index = playing && byPath.has(playing.path) ? before : Math.min(before, order.length - 1);
            return { source: fresh(prev.source), order, index };
        });
    }, []);

    /** Remove tracks (deleted files) from the queue. */
    const remove = useCallback((paths: Set<string>) => {
        setQueue(prev => {
            const before = prev.order.slice(0, prev.index).filter(track => !paths.has(track.path)).length;
            const order = prev.order.filter(track => !paths.has(track.path));
            return {
                source: prev.source.filter(track => !paths.has(track.path)),
                order,
                index: Math.min(before, order.length - 1),
            };
        });
    }, []);

    return {
        current,
        order: queue.order,
        index: queue.index,
        isLast: queue.index === queue.order.length - 1,
        first: queue.order[0] ?? null,
        start, setShuffled, move, peek, jumpTo, removeAt, setUpcoming, insertNext, append, refresh, remove,
        /** Jump to the first track (end of the queue without repeat). */
        rewind: useCallback(() => setQueue(prev => ({ ...prev, index: prev.order.length > 0 ? 0 : -1 })), []),
    };
};
