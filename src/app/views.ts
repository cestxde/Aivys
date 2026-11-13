import type { CollectionSection, CollectionSort } from "../components/CollectionPage/CollectionPage";
import type { Crumb } from "../components/GroupHeader/GroupHeader";
import type { Playlist, SystemView, View } from "../types";
import type { MessageKey } from "../i18n";
import { compareText, t } from "../i18n";
import { formatDuration } from "../utils/format";
import type { TrackGroup } from "../utils/groups";

export const EMPTY_TEXT: Record<SystemView, MessageKey> = {
	library: "empty.library",
	favorites: "empty.favorites",
	recentlyPlayed: "empty.history",
	mostPlayed: "empty.history",
};

export const LIBRARY_VIEW: View = { kind: "system", id: "library" };

export const SYSTEM_TITLES: Record<SystemView, MessageKey> = {
	library: "nav.library",
	favorites: "nav.favorites",
	recentlyPlayed: "nav.recentlyPlayed",
	mostPlayed: "nav.mostPlayed",
};
/** The phone's top bar: the section a view belongs to. */
export const SECTION_TITLES: Record<SystemView | Exclude<View["kind"], "system">, MessageKey> = {
	...SYSTEM_TITLES,
	playlists: "nav.playlists",
	playlist: "nav.playlists",
	tags: "nav.tags",
	tag: "nav.tags",
	artists: "nav.artists",
	artist: "nav.artists",
	albums: "nav.albums",
	album: "nav.albums",
	folder: "nav.folders",
	stats: "nav.stats",
	incomplete: "nav.incomplete",
	gap: "nav.incomplete",
	settings: "nav.settings",
};
export const PLAYLISTS_VIEW: View = { kind: "playlists" };
export const TAGS_VIEW: View = { kind: "tags" };
export const ARTISTS_VIEW: View = { kind: "artists" };
export const ALBUMS_VIEW: View = { kind: "albums" };
export const ROOT_FOLDER_VIEW: View = { kind: "folder", id: "" };

/** Last segment of a "/"- or "\\"-separated path. */
export const lastSegment = (path: string): string => {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts.length ? parts[parts.length - 1] : path;
};

/** Name of a view's own order in the sort menu; null when it has none worth offering. */
export const defaultSortLabel = (view: View, playlist: Playlist | null): string | null => {
	switch (view.kind) {
		case "system":
			return view.id === "favorites" ? t("sort.recentlyFavorited")
				: view.id === "recentlyPlayed" ? t("sort.recentlyPlayed")
					: view.id === "mostPlayed" ? t("sort.mostPlayed")
						: null;
		case "artist": return t("sort.albumOrder");
		case "album": return t("sort.trackOrder");
		case "folder": return t("sort.folderOrder");
		case "playlist": return playlist?.type === "smart" ? t("sort.ruleOrder") : t("sort.playlistOrder");
		default: return null;
	}
};

export const countTracks = (count: number) => t("common.tracks", { count });

/** When a group's newest track was added. */
export const latestAdded = (group: TrackGroup) => group.tracks.reduce((latest, track) => Math.max(latest, track.dateCreated), 0);
export const byGroupName = (a: TrackGroup, b: TrackGroup) => compareText(a.name, b.name);

/** An album card's counts: "4 of 12 tracks · 45:12". */
export const albumDetail = (group: TrackGroup): string => {
	const have = group.tracks.length;
	const count = group.total && group.total >= have
		? t("group.tracksOf", { have, count: group.total })
		: t("common.tracks", { count: have });
	return `${count} · ${formatDuration(group.tracks.reduce((sum, track) => sum + track.duration, 0))}`;
};

/** Orders of the artists page; each compare is in its natural direction. */
export const artistSorts = (): CollectionSort[] => [
	{ id: "name", label: t("collection.sortName"), compare: byGroupName },
	{ id: "tracks", label: t("collection.sortTracks"), compare: (a, b) => b.tracks.length - a.tracks.length || byGroupName(a, b) },
	{ id: "added", label: t("collection.sortAdded"), compare: (a, b) => latestAdded(b) - latestAdded(a) || byGroupName(a, b) },
];

export const albumSorts = (): CollectionSort[] => [
	{ id: "name", label: t("collection.sortTitle"), compare: byGroupName },
	{ id: "artist", label: t("collection.sortArtist"), compare: (a, b) => compareText(a.subtitle ?? "", b.subtitle ?? "") || byGroupName(a, b) },
	{ id: "year", label: t("collection.sortYear"), compare: (a, b) => (b.year ?? 0) - (a.year ?? 0) || byGroupName(a, b) },
	{ id: "tracks", label: t("collection.sortTracks"), compare: (a, b) => b.tracks.length - a.tracks.length || byGroupName(a, b) },
	{ id: "added", label: t("collection.sortAdded"), compare: (a, b) => latestAdded(b) - latestAdded(a) || byGroupName(a, b) },
];

/** Artists and albums with one track are folded away, so they do not crowd the rest. */
export const trackCountSections = (): CollectionSection[] => [
	{ id: "many", label: t("collection.manyTracks"), test: group => group.tracks.length > 1 },
	{ id: "one", label: t("collection.oneTrack"), test: group => group.tracks.length === 1, folded: true },
];

/** A view as a short key, e.g. "album:<key>" or "playlists". */
export const viewKeyOf = (view: View): string => ("id" in view ? `${view.kind}:${view.id}` : view.kind);

/** The folder path as breadcrumbs, from the library root. */
export const folderCrumbs = (
	folder: string,
	libraryRootLabel: string,
	showView: (view: View) => void,
): Crumb[] => {
	const parts = folder ? folder.split("/") : [];
	return [
		{ label: libraryRootLabel, onClick: () => showView(ROOT_FOLDER_VIEW) },
		...parts.map((part, index) => ({
			label: part,
			onClick: () => showView({ kind: "folder", id: parts.slice(0, index + 1).join("/") }),
		})),
	];
};
