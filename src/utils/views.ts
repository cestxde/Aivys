import type { SystemView, Track, TrackStats } from "../types";

/** Display cap of the "recently/most played" lists (more can come later). */
const HISTORY_LIMIT = 100;

/** The tracks of a built-in view in its own order (the library: as scanned). */
export const systemViewTracks = (
    files: Track[],
    view: SystemView,
    stats: Record<string, TrackStats>
): Track[] => {
    const of = (track: Track) => stats[track.relPath];
    switch (view) {
        case 'library':
            return files;
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

/** Tracks that have the user tag `tagId`, newest first. */
export const tagTracks = (files: Track[], tagId: string, stats: Record<string, TrackStats>): Track[] =>
    files
        .filter(f => stats[f.relPath]?.tags.includes(tagId))
        .sort((a, b) => b.dateCreated - a.dateCreated);
