import type { IncompleteGap, Track, TrackStats } from "../types";

/** Gaps shown on the Incomplete hub, in display order. */
export const INCOMPLETE_GAPS: IncompleteGap[] = [
    "noArtist",
    "noTitle",
    "noAlbum",
    "noCover",
    "noTags",
];

const hasText = (value: string | null | undefined): boolean =>
    value != null && value.trim().length > 0;

/** Whether `track` is missing the metadata of `gap`. */
export const trackHasGap = (
    track: Track,
    gap: IncompleteGap,
    stats: Record<string, TrackStats>,
): boolean => {
    switch (gap) {
        case "noArtist":
            return track.artists.length === 0;
        case "noTitle":
            return !hasText(track.title);
        case "noAlbum":
            return !hasText(track.album);
        case "noCover":
            return track.coverPath == null;
        case "noTags":
            return (stats[track.relPath]?.tags ?? []).length === 0;
    }
};

/** Tracks with the given gap, newest first. */
export const gapTracks = (
    gap: IncompleteGap,
    files: Track[],
    stats: Record<string, TrackStats>,
): Track[] =>
    files
        .filter(track => trackHasGap(track, gap, stats))
        .sort((a, b) => b.dateCreated - a.dateCreated);

/** Count of tracks per gap. */
export const incompleteCounts = (
    files: Track[],
    stats: Record<string, TrackStats>,
): Record<IncompleteGap, number> => {
    const counts = Object.fromEntries(INCOMPLETE_GAPS.map(gap => [gap, 0])) as Record<IncompleteGap, number>;
    for (const track of files) {
        for (const gap of INCOMPLETE_GAPS) {
            if (trackHasGap(track, gap, stats)) counts[gap]++;
        }
    }
    return counts;
};
