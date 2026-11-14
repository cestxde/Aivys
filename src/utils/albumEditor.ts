import type { Track } from "../types";
import { compareAlbumOrder, type TrackGroup } from "./groups";
import { displayArtists, displayTitle } from "./track";

/** Prefill from a known album when the track list may include newcomers with other tags. */
export interface AlbumEditorSeed {
	album: string;
	albumArtist: string;
	year: string;
	genre: string;
	/** Group cover or a single shared track cover, for display under "keep". */
	coverPath: string | null;
}

/** Shared non-empty string across tracks, or empty when mixed / missing. */
export const sharedTrackText = (tracks: Track[], of: (track: Track) => string): string => {
	const values = new Set(
		tracks.map(track => of(track).trim()).filter(value => value.length > 0),
	);
	return values.size === 1 ? [...values][0] : "";
};

/** Seed fields taken from the album card / group, not from a mixed newcomer set. */
export const albumEditorSeedFromGroup = (group: TrackGroup): AlbumEditorSeed => {
	const trackCovers = new Set(
		group.tracks.flatMap(track => (track.coverPath ? [track.coverPath] : [])),
	);
	return {
		album: group.name,
		albumArtist: group.subtitle?.trim() ?? "",
		year: group.year != null ? String(group.year) : "",
		genre: sharedTrackText(group.tracks, track => track.genre.join("; ")),
		coverPath: group.cover
			?? (trackCovers.size === 1 ? [...trackCovers][0] : null),
	};
};

/** Prefill for a new or edited album package. `seed` wins when opening an existing album. */
export const albumEditorDefaults = (tracks: Track[], seed?: AlbumEditorSeed | null) => {
	const ordered = [...tracks].sort(compareAlbumOrder);
	const album = seed?.album.trim()
		|| sharedTrackText(ordered, track => track.album ?? "");
	const albumArtist = seed?.albumArtist.trim()
		|| sharedTrackText(ordered, track => track.albumArtist ?? "")
		|| sharedTrackText(ordered, track => displayArtists(track) ?? "");
	const yearText = seed?.year.trim()
		|| sharedTrackText(ordered, track => track.year?.toString() ?? "");
	const genre = seed?.genre.trim()
		|| sharedTrackText(ordered, track => track.genre.join("; "));
	const coverPath = seed?.coverPath
		?? (() => {
			const covers = new Set(ordered.flatMap(track => (track.coverPath ? [track.coverPath] : [])));
			return covers.size === 1 ? [...covers][0] : null;
		})();
	return {
		tracks: ordered,
		album,
		albumArtist,
		year: yearText,
		genre,
		coverPath,
	};
};

/** Suggested album trackTotal: at least the list size and any existing totals/numbers. */
export const suggestedTrackTotal = (tracks: Track[]): number => {
	let max = tracks.length;
	for (const track of tracks) {
		if (track.trackTotal != null && track.trackTotal > max) max = track.trackTotal;
		if (track.trackNumber != null && track.trackNumber > max) max = track.trackNumber;
	}
	return max;
};

/** Initial per-path numbers: existing tags, else 1…N in list order. */
export const initialTrackNumbers = (tracks: Track[]): Record<string, string> => {
	const out: Record<string, string> = {};
	tracks.forEach((track, index) => {
		out[track.path] = track.trackNumber != null ? String(track.trackNumber) : String(index + 1);
	});
	return out;
};

/** 1…N in current list order. */
export const sequentialTrackNumbers = (tracks: Track[]): Record<string, string> =>
	Object.fromEntries(tracks.map((track, index) => [track.path, String(index + 1)]));

/** Whether a library track matches the add-tracks filter. */
export const trackMatchesAlbumPicker = (track: Track, query: string): boolean => {
	if (!query) return true;
	const hay = [
		displayTitle(track),
		displayArtists(track) ?? "",
		track.album ?? "",
		track.name,
	].join(" ").toLowerCase();
	return hay.includes(query);
};
