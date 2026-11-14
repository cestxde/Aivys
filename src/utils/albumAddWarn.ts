/** localStorage key (via useStoredState) for skipping the “tags will change” warn. */
export const ALBUM_SKIP_ADD_WARN = "album.skipAddWarn";

export const isBooleanStored = (value: unknown): value is boolean => typeof value === "boolean";

/** Album tracks first, then newcomers that are not already in the album. */
export const mergeIntoAlbumTracks = <T extends { path: string }>(
	albumTracks: T[],
	incoming: T[],
): T[] => {
	const seen = new Set(albumTracks.map(track => track.path));
	const added = incoming.filter(track => {
		if (seen.has(track.path)) return false;
		seen.add(track.path);
		return true;
	});
	return [...albumTracks, ...added];
};

/** How many of `incoming` are not already among `albumTracks`. */
export const countTracksToAdd = <T extends { path: string }>(
	albumTracks: T[],
	incoming: T[],
): number => {
	const present = new Set(albumTracks.map(track => track.path));
	return incoming.filter(track => !present.has(track.path)).length;
};
