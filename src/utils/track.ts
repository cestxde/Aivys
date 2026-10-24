import type { Track } from "../types";

/** Strip the file extension from a bare filename, e.g. "song.mp3" -> "song". */
const stripExtension = (name: string): string => {
    const dot = name.lastIndexOf(".");
    // Keep names that start with a dot (hidden files) or have no dot intact.
    return dot > 0 ? name.slice(0, dot) : name;
};

/**
 * The title to show for a track: the tag title when present, otherwise the
 * filename without its extension. Never returns an empty string for a valid track.
 */
export const displayTitle = (track: Track): string => {
    const tagged = track.title?.trim();
    return tagged || stripExtension(track.name);
};

/** The artists to show for a track, as written in its tags; null if it has none. */
export const displayArtists = (track: Track): string | null =>
    track.artistLine || (track.artists.length > 0 ? track.artists.join(", ") : null);
