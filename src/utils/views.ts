import type { SortOrder, SortSpec, SystemView, Track, TrackStats } from "../types";

/** Display cap of the "recently/most played" lists (more can come later). */
const HISTORY_LIMIT = 100;

/** Comparator for a track-list sort order ('manual' keeps the input order). */
export const compareTracks = (sortOrder: SortOrder) => (a: Track, b: Track): number => {
    if (sortOrder === 'manual') return 0;
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
    // 'name' => by title, fallback to filename
    return (a.title ?? a.name).localeCompare(b.title ?? b.name);
};

/** A playlist's persisted view sort as a list sort order, and back. */
export const sortOrderOf = (sort: SortSpec | undefined): SortOrder =>
    (sort?.field as SortOrder | undefined) ?? 'manual';

export const sortSpecOf = (sortOrder: SortOrder): SortSpec => ({
    field: sortOrder,
    // Matches compareTracks: newest and longest first, the rest A→Z.
    dir: sortOrder === 'date' || sortOrder === 'duration' ? 'desc' : 'asc',
});

/** The tracks of a built-in view in its natural order. */
export const systemViewTracks = (
    files: Track[],
    view: SystemView,
    stats: Record<string, TrackStats>,
    sortOrder: SortOrder
): Track[] => {
    const of = (track: Track) => stats[track.relPath];
    switch (view) {
        case 'library':
            return [...files].sort(compareTracks(sortOrder));
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

/** Tracks that have the user tag `tagId`, in `sortOrder`. */
export const tagTracks = (
    files: Track[],
    tagId: string,
    stats: Record<string, TrackStats>,
    sortOrder: SortOrder
): Track[] =>
    files
        .filter(f => stats[f.relPath]?.tags.includes(tagId))
        .sort(compareTracks(sortOrder));
