import type { Track } from "../types";

/**
 * What was playing, kept on this device so the next launch picks it up: the
 * queue (by file path) and how far into the current track playback got.
 */
const QUEUE_KEY = "aivys.session.queue";
const POSITION_KEY = "aivys.session.position";

export interface SessionQueue {
    source: Track[];
    order: Track[];
    index: number;
}

interface StoredQueue {
    order: string[];
    /** Absent when it is the same as `order` (not shuffled). */
    source?: string[];
    index: number;
}

const isPathList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === "string");

const read = (key: string): unknown => {
    try {
        return JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
        return null;
    }
};

const write = (key: string, value: unknown) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Not remembered (storage full or blocked); the next launch starts empty.
    }
};

export const saveQueue = ({ source, order, index }: SessionQueue) => {
    const paths = order.map(track => track.path);
    const same = source.length === order.length && source.every((track, i) => track === order[i]);
    const stored: StoredQueue = same ? { order: paths, index } : { order: paths, source: source.map(track => track.path), index };
    write(QUEUE_KEY, stored);
};

/** The saved queue made of `tracks` (the scanned library); tracks no longer there are left out. */
export const loadQueue = (tracks: Track[]): SessionQueue | null => {
    const stored = read(QUEUE_KEY) as Partial<StoredQueue> | null;
    if (!stored || !isPathList(stored.order) || typeof stored.index !== "number") return null;
    const byPath = new Map(tracks.map(track => [track.path, track]));
    const fresh = (paths: string[]) => paths.flatMap(path => byPath.get(path) ?? []);
    const order = fresh(stored.order);
    if (order.length === 0) return null;
    const source = isPathList(stored.source) ? fresh(stored.source) : order;
    // Like a rescan: the current track, or the one that took its place.
    const before = fresh(stored.order.slice(0, stored.index)).length;
    const playing = stored.order[stored.index];
    const index = playing !== undefined && byPath.has(playing) ? before : Math.min(before, order.length - 1);
    return { source, order, index };
};

export const savePosition = (path: string, time: number) => write(POSITION_KEY, { path, time });

/** Where playback of `path` stopped, in seconds (0 if it was another track). */
export const loadPosition = (path: string): number => {
    const stored = read(POSITION_KEY) as { path?: unknown; time?: unknown } | null;
    return stored && stored.path === path && typeof stored.time === "number" && stored.time > 0 ? stored.time : 0;
};
