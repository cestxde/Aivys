import "./App.css";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import {
	ArrowDown, ArrowUp, Check, FolderPlus, GitMerge, Heart, Pin, PinOff, ListPlus, ListX, PencilLine, Play, SquareCheck, Trash2, FolderOpen, FolderSearch, Tag, Pencil, X, History, TrendingUp, MicVocal, Disc3, Folder, ImagePlus, ImageOff,
} from "lucide-react";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useLibrary } from "./hooks/useLibrary";
import { usePlayerSettings } from "./hooks/usePlayerSettings";
import { TrackList } from "./components/TrackList/TrackList";
import { PlayerBar } from "./components/PlayerBar/PlayerBar";
import { Toolbar } from "./components/ToolBar/ToolBar";
import { LibraryPicker } from "./components/LibraryPicker/LibraryPicker";
import { ThemedLogo } from "./components/ThemedLogo";
import { MobileHeader, Sidebar } from "./components/Sidebar/Sidebar";
import { MiniPlayer } from "./components/MobilePlayer/MiniPlayer";
import { NowPlaying, PhoneSheet } from "./components/MobilePlayer/NowPlaying";
import { useIsPhone } from "./hooks/useIsPhone";
import { useBackLayer } from "./hooks/useBackLayer";
import { androidStorage } from "./utils/androidStorage";
import { TrackDetailPanel } from "./components/TrackDetailPanel/TrackDetailPanel";
import { Notices } from "./components/Notices/Notices";
import { useTrackListLogic } from "./hooks/useTrackListLogic";
import { useSearchScroll } from "./hooks/useSearchScroll";
import { usePageLayouts } from "./hooks/usePageLayouts";
import { useStoredState } from "./hooks/useRemembered";
import { useTheme } from "./hooks/useTheme";
import { sortScopeOf, useViewSorts } from "./hooks/useViewSorts";
import { useTrackStats } from "./hooks/useTrackStats";
import { usePlayTracking } from "./hooks/usePlayTracking";
import { useTaskbar } from "./hooks/useTaskbar";
import { useMediaControls } from "./hooks/useMediaControls";
import { useShortcutActions } from "./hooks/useShortcutActions";
import { usePlaylists } from "./hooks/usePlaylists";
import { useTags, type TagChange } from "./hooks/useTags";
import { usePins, type PinKind } from "./hooks/usePins";
import { useGroupCovers, type CoverKind } from "./hooks/useGroupCovers";
import { pickImage } from "./utils/image";
import { useViewRows } from "./hooks/useViewRows";
import { useSmartPlaylistPaths } from "./hooks/useSmartPlaylistPaths";
import { PlaylistHeader } from "./components/PlaylistHeader/PlaylistHeader";
import { ContextMenu, type MenuEntry } from "./components/ContextMenu/ContextMenu";
import { SmartPlaylistEditor } from "./components/SmartPlaylistEditor/SmartPlaylistEditor";
import { PlaylistsPage, type PinnedPlaylist, type PlaylistsLayout } from "./components/PlaylistsPage/PlaylistsPage";
import { CollectionPage, type CollectionSection, type CollectionSort } from "./components/CollectionPage/CollectionPage";
import { AlbumStrip } from "./components/AlbumStrip/AlbumStrip";
import { SelectionBar } from "./components/SelectionBar/SelectionBar";
import { QueuePanel } from "./components/QueuePanel/QueuePanel";
import { MetadataEditor, type MetadataEdit } from "./components/MetadataEditor/MetadataEditor";
import { UpdateDialog } from "./components/UpdateDialog/UpdateDialog";
import { checkForUpdates, useUpdateDialogOpen } from "./utils/updates";
import { savePosition } from "./utils/session";
import { FolderGrid, GroupHeader, type Crumb } from "./components/GroupHeader/GroupHeader";
import { AddToDialog } from "./components/AddToDialog/AddToDialog";
import { TagsPage } from "./components/TagsPage/TagsPage";
import { TagHeader } from "./components/TagHeader/TagHeader";
import { TagDialog } from "./components/TagDialog/TagDialog";
import { CategoryDialog } from "./components/TagDialog/CategoryDialog";
import { MergeTagDialog } from "./components/TagPicker/MergeTagDialog";
import { TagPicker } from "./components/TagPicker/TagPicker";
import { SettingsPage } from "./components/SettingsPage/SettingsPage";
import { systemViewTracks, tagTracks } from "./utils/views";
import {
	compareBy, hintOf, sectionOf, sortSpecOf, viewSortOf, DEFAULT_SORT, type SortSection, type ViewSort,
} from "./utils/sort";
import {
	albumKeyOf, artistKey, folderOf, folderTracks, groupAlbums, groupArtists, groupCovers, hasFolders, subfolders, type TrackGroup,
} from "./utils/groups";
import { nextTagColor } from "./utils/tags";
import { notifyError, notifyInfo, notifyUndoable } from "./utils/notify";
import { displayTitle } from "./utils/track";
import { revealFile, revealLabel } from "./utils/reveal";
import { formatDateTime, formatDuration, formatTotalDuration } from "./utils/format";
import { compareText, t, useI18n, type MessageKey } from "./i18n";
import {
	addRecentPath, removeRecentPath,
	type ConflictReport, type ListRow, type Playlist, type SmartRules, type SystemView, type TagCategory, type Track, type UserTag, type View,
} from "./types";

const EMPTY_TEXT: Record<SystemView, MessageKey> = {
	library: "empty.library",
	favorites: "empty.favorites",
	recentlyPlayed: "empty.history",
	mostPlayed: "empty.history",
};

const LIBRARY_VIEW: View = { kind: "system", id: "library" };

const SYSTEM_TITLES: Record<SystemView, MessageKey> = {
	library: "nav.library",
	favorites: "nav.favorites",
	recentlyPlayed: "nav.recentlyPlayed",
	mostPlayed: "nav.mostPlayed",
};
/** The phone's top bar: the section a view belongs to. */
const SECTION_TITLES: Record<SystemView | Exclude<View["kind"], "system">, MessageKey> = {
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
	settings: "nav.settings",
};
const PLAYLISTS_VIEW: View = { kind: "playlists" };
const TAGS_VIEW: View = { kind: "tags" };
const ARTISTS_VIEW: View = { kind: "artists" };
const ALBUMS_VIEW: View = { kind: "albums" };
const ROOT_FOLDER_VIEW: View = { kind: "folder", id: "" };

/** Last segment of a "/"- or "\\"-separated path. */
const lastSegment = (path: string): string => {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts.length ? parts[parts.length - 1] : path;
};

/** Name of a view's own order in the sort menu; null when it has none worth offering. */
const defaultSortLabel = (view: View, playlist: Playlist | null): string | null => {
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

const countTracks = (count: number) => t("common.tracks", { count });

/** When a group's newest track was added. */
const latestAdded = (group: TrackGroup) => group.tracks.reduce((latest, track) => Math.max(latest, track.dateCreated), 0);
const byGroupName = (a: TrackGroup, b: TrackGroup) => compareText(a.name, b.name);

/** An album card's counts: "4 of 12 tracks · 45:12". */
const albumDetail = (group: TrackGroup): string => {
	const have = group.tracks.length;
	const count = group.total && group.total >= have
		? t("group.tracksOf", { have, count: group.total })
		: t("common.tracks", { count: have });
	return `${count} · ${formatDuration(group.tracks.reduce((sum, track) => sum + track.duration, 0))}`;
};

/** Orders of the artists page; each compare is in its natural direction. */
const artistSorts = (): CollectionSort[] => [
	{ id: "name", label: t("collection.sortName"), compare: byGroupName },
	{ id: "tracks", label: t("collection.sortTracks"), compare: (a, b) => b.tracks.length - a.tracks.length || byGroupName(a, b) },
	{ id: "added", label: t("collection.sortAdded"), compare: (a, b) => latestAdded(b) - latestAdded(a) || byGroupName(a, b) },
];

const albumSorts = (): CollectionSort[] => [
	{ id: "name", label: t("collection.sortTitle"), compare: byGroupName },
	{ id: "artist", label: t("collection.sortArtist"), compare: (a, b) => compareText(a.subtitle ?? "", b.subtitle ?? "") || byGroupName(a, b) },
	{ id: "year", label: t("collection.sortYear"), compare: (a, b) => (b.year ?? 0) - (a.year ?? 0) || byGroupName(a, b) },
	{ id: "tracks", label: t("collection.sortTracks"), compare: (a, b) => b.tracks.length - a.tracks.length || byGroupName(a, b) },
	{ id: "added", label: t("collection.sortAdded"), compare: (a, b) => latestAdded(b) - latestAdded(a) || byGroupName(a, b) },
];

/** Artists and albums with one track are folded away, so they do not crowd the rest. */
const trackCountSections = (): CollectionSection[] => [
	{ id: "many", label: t("collection.manyTracks"), test: group => group.tracks.length > 1 },
	{ id: "one", label: t("collection.oneTrack"), test: group => group.tracks.length === 1, folded: true },
];

/** A view as a short key, e.g. "album:<key>" or "playlists". */
const viewKeyOf = (view: View): string => ("id" in view ? `${view.kind}:${view.id}` : view.kind);

type Screen = "loading" | "picker" | "library";

/** Selected rows (by key) of the list they were made in (`scope`: view and search). */
interface Selection {
	scope: string;
	keys: Set<string>;
	/** Where a Shift+click range starts. */
	anchor: string | null;
}

const NO_SELECTION: Selection = { scope: "", keys: new Set(), anchor: null };

/** The library after a tag edit or its undo, and the files left unchanged. */
interface EditResult {
	tracks: Track[];
	failed: string[];
}

/** How much the volume shortcuts change the volume (of 1). */
const VOLUME_STEP = 0.05;

/** Pages that show cards rather than a track list. */
const CARD_PAGES: View["kind"][] = ["playlists", "tags", "settings", "artists", "albums"];

/** The smart-playlist editor: creating a new one, or editing `playlist`. */
interface EditorState {
	playlist: Playlist | null;
}

/**
 * The tag dialog: creating a new tag (named `name`, in `categoryIds`, then
 * assigned to `assignTo`), or editing `tag`.
 */
interface TagDialogState {
	tag: UserTag | null;
	categoryIds?: string[];
	name?: string;
	assignTo?: Track[];
}

/** The category dialog: creating a new category (with `addTag` in it), or renaming `category`. */
interface CategoryDialogState {
	category: TagCategory | null;
	addTag?: UserTag;
}

function App() {
	const { settings, updateSettings } = usePlayerSettings();
	const { theme, setTheme } = useTheme();
	const language = useI18n();
	const library = useLibrary();
	const [view, setView] = useState<Screen>("loading");
	const [pickerError, setPickerError] = useState<string | null>(null);
	const [requestedView, setListView] = useState<View>(LIBRARY_VIEW);
	// A just-created playlist opens with its name in edit mode.
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
	const [editor, setEditor] = useState<EditorState | null>(null);
	// Tracks the "Add to…" dialog is open for.
	const [addTo, setAddTo] = useState<Track[] | null>(null);
	const [tagDialog, setTagDialog] = useState<TagDialogState | null>(null);
	const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null);
	// The tag the "Merge into…" dialog is open for.
	const [mergeTag, setMergeTag] = useState<UserTag | null>(null);
	// Phones: the sidebar is a drawer, open while this is true.
	const [drawerOpen, setDrawerOpen] = useState(false);
	// Phones: the full-screen player, and a screen over it (the queue or the track's details).
	const isPhone = useIsPhone();
	const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
	const [phonePanel, setPhonePanel] = useState<"track" | "queue" | null>(null);
	// The system's Back closes them, the topmost first.
	useBackLayer(drawerOpen, () => setDrawerOpen(false));
	useBackLayer(isPhone && nowPlayingOpen, () => setNowPlayingOpen(false));
	useBackLayer(isPhone && phonePanel !== null, () => setPhonePanel(null));
	// Tracks the tag picker is open for.
	const [tagPicker, setTagPicker] = useState<Track[] | null>(null);
	// The view playback was started from (a view key), highlighted on its card.
	// Kept with the session, so a resumed queue still shows where it came from.
	const [playingFrom, setPlayingFrom] = useStoredState<string | null>("session.from", null, (value): value is string | null => value === null || typeof value === "string");
	// Tracks the metadata editor is open for.
	const [editing, setEditing] = useState<Track[] | null>(null);
	// The tracks of the last tag edit while it can be undone.
	const [undoablePaths, setUndoablePaths] = useState<string[] | null>(null);
	// What the right panel shows: the playing track, or the queue.
	const [panelTab, setPanelTab] = useState<"track" | "queue">("track");
	const { layouts, setLayout } = usePageLayouts();

	const {
		activePath, playTrack,
		isPlaying, togglePlay, volume, setVolume,
		seek, stop,
		onNext, onPrev, previousTrack, resume,
		playNext, addToQueue, forgetTracks,
		queue, playAt, removeFromQueue, setUpcoming, releaseWhile,
		toggleShuffle, isShuffle,
		repeatMode, toggleRepeatMode,
		element
	} = useAudioPlayer(library.files, settings, updateSettings);

	const files = library.files;
	const currentTrack = files.find(f => f.path === activePath);

	// Phones: the pages keep room at their end for the mini player over them (App.css).
	const miniPlayer = isPhone && !!currentTrack;
	useEffect(() => {
		document.getElementById("root")?.classList.toggle("has-mini-player", miniPlayer);
	}, [miniPlayer]);

	const tracksByPath = useMemo(() => new Map(files.map(f => [f.relPath, f])), [files]);

	const trackStats = useTrackStats(files);
	usePlayTracking(element, currentTrack ?? null, trackStats.recordPlay, trackStats.recordComplete);
	useTaskbar(isPlaying, !!activePath, language, { previous: onPrev, toggle: togglePlay, next: onNext });
	useMediaControls(element, currentTrack ?? null, isPlaying, {
		play: () => !isPlaying && togglePlay(),
		pause: () => isPlaying && togglePlay(),
		next: onNext,
		previous: onPrev,
		seek,
	});

	const playlists = usePlaylists(files);
	const tags = useTags(files);
	const pins = usePins(files);
	const groupCoverStore = useGroupCovers(files);
	const { withCovers } = groupCoverStore;

	// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	const artists = useMemo(() => withCovers("artist", groupArtists(files)), [files, language, withCovers]);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	const albums = useMemo(() => withCovers("album", groupAlbums(files)), [files, language, withCovers]);
	const artistsByKey = useMemo(() => new Map(artists.map(g => [g.key, g])), [artists]);
	// Rarely met artists have pages (opened from their tracks) but no card.
	const listedArtists = useMemo(() => artists.filter(group => group.listed), [artists]);
	const albumsByKey = useMemo(() => new Map(albums.map(g => [g.key, g])), [albums]);
	const showFolders = useMemo(() => hasFolders(files), [files]);

	// Something that is gone (deleted, renamed tags, other library) falls back to its list.
	const listView: View =
		requestedView.kind === "playlist" && !playlists.playlists.some(p => p.id === requestedView.id) ? PLAYLISTS_VIEW
		: requestedView.kind === "tag" && !tags.byId.has(requestedView.id) ? TAGS_VIEW
		: requestedView.kind === "artist" && !artistsByKey.has(requestedView.id) ? ARTISTS_VIEW
		: requestedView.kind === "album" && !albumsByKey.has(requestedView.id) ? ALBUMS_VIEW
		: requestedView.kind === "folder" && requestedView.id
			&& !files.some(f => f.relPath.startsWith(`${requestedView.id}/`)) ? ROOT_FOLDER_VIEW
		: requestedView;
	const currentTag = listView.kind === "tag" ? tags.byId.get(listView.id) ?? null : null;
	const smartPaths = useSmartPlaylistPaths(playlists.playlists, trackStats.stats, listView.kind === "playlists");

	// The artist, album or folder on screen.
	const currentGroup = useMemo((): TrackGroup | null => {
		switch (listView.kind) {
			case "artist": return artistsByKey.get(listView.id) ?? null;
			case "album": return albumsByKey.get(listView.id) ?? null;
			case "folder": return {
				key: listView.id,
				name: listView.id ? lastSegment(listView.id) : lastSegment(settings.lastPath),
				subtitle: null,
				year: null,
				tracks: folderTracks(files, listView.id),
				listed: true,
			};
			default: return null;
		}
	}, [listView, artistsByKey, albumsByKey, files, settings.lastPath]);
	// An artist's albums, newest first, for the cards above their tracks.
	const artistAlbums = useMemo(() => {
		if (listView.kind !== "artist" || !currentGroup) return [];
		const keys = new Set(currentGroup.tracks.flatMap(track => albumKeyOf(track) ?? []));
		return [...keys]
			.flatMap(key => albumsByKey.get(key) ?? [])
			.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
	}, [listView.kind, currentGroup, albumsByKey]);
	const currentSubfolders = useMemo(
		() => (listView.kind === "folder" ? subfolders(files, listView.id) : []),
		[listView, files],
	);

	const { rows: naturalRows, missingCount, playlist } =
		useViewRows(listView, files, trackStats.stats, playlists.playlists, currentGroup?.tracks ?? null);

	// Built-in playlists pinned on the playlists page.
	const pinned = useMemo((): PinnedPlaylist[] => {
		const count = (id: SystemView) => systemViewTracks(files, id, trackStats.stats).length;
		return [
			{ id: "favorites", name: t("nav.favorites"), icon: Heart, color: "#e11d48", count: count("favorites") },
			{ id: "mostPlayed", name: t("nav.mostPlayed"), icon: TrendingUp, color: "#f59e0b", count: count("mostPlayed") },
			{ id: "recentlyPlayed", name: t("nav.recentlyPlayed"), icon: History, color: "#3b82f6", count: count("recentlyPlayed") },
		];
		// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	}, [files, trackStats.stats, language]);

	// Tagged library tracks per tag id.
	const tagCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const file of files) {
			for (const id of trackStats.stats[file.relPath]?.tags ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
		}
		return counts;
	}, [files, trackStats.stats]);

	// Open a folder as the active library: validate it, remember it, scan it.
	const openLibrary = async (path: string) => {
		const valid = await library.validate(path);
		if (!valid) {
			setPickerError(t("picker.folderNotFound", { path }));
			return;
		}
		setPickerError(null);
		stop();
		updateSettings({
			lastPath: path,
			recentPaths: addRecentPath(settings.recentPaths, path),
		});
		setView("library");
		await library.scan(path);
	};

	// Return to the library picker: stop playback and show the picker.
	const goToPicker = () => {
		stop();
		setView("picker");
	};

	const rescan = () => library.scan(settings.lastPath);

	// Forget every remembered folder except the open one.
	const clearRecent = () => updateSettings({ recentPaths: settings.recentPaths.filter(p => p === settings.lastPath) });

	/** Merge sync-conflict copies now; reload everything if something changed. */
	const checkConflicts = async () => {
		let report: ConflictReport;
		try {
			report = await invoke<ConflictReport>("resolve_conflicts");
		} catch (e) {
			notifyError(t("sync.checkFailed"), e);
			return;
		}
		tellConflicts(report);
		if (report.merged.length === 0 && report.skipped.length === 0) {
			notifyInfo(t("sync.none"));
			return;
		}
		if (report.merged.length > 0) await rescan();
	};

	/** What a pass over the sync-conflict copies did, as notices. */
	const tellConflicts = (report: ConflictReport) => {
		if (report.skipped.length > 0) {
			notifyError(t("sync.skipped", { count: report.skipped.length, list: report.skipped.join("; ") }));
		}
		if (report.deviceIdRegenerated) notifyInfo(t("sync.deviceIdRegenerated"));
		if (report.merged.length > 0) notifyInfo(t("sync.merged", { count: report.merged.length }));
	};

	// Opening the library (every scan) merges conflict copies before reading
	// anything; what it did is told after.
	useEffect(() => {
		if (files.length === 0) return;
		invoke<ConflictReport | null>("take_opening_conflicts")
			.then(report => report && tellConflicts(report))
			.catch(console.error);
	}, [files]);

	const handleRemoveRecent = (path: string) => {
		const recentPaths = removeRecentPath(settings.recentPaths, path);
		// If the removed folder was the one we'd reopen on startup, forget it too,
		// so the next launch won't auto-open a folder the user removed.
		const lastPath = path === settings.lastPath ? "" : settings.lastPath;
		updateSettings({ recentPaths, lastPath });
	};

	// On startup: reopen the last folder if it still exists, otherwise stay on
	// the picker (showing an error if a previously used folder disappeared).
	// Once only: StrictMode mounts twice in development, and a second scan would
	// redo the whole work.
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		const last = settings.lastPath;
		(async () => {
			if (last) {
				const valid = await library.validate(last);
				if (valid) {
					resume(await library.scan(last) ?? []);
					setView("library");
					return;
				}
				setPickerError(t("picker.lastGone", { path: last }));
			}
			resume([]);
			setView("picker");
		})();
		// Run once on mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// A new version on GitHub: looked for quietly once, as soon as the app has
	// started (the library loaded, or the folder picker shown without one).
	const updateDialogOpen = useUpdateDialogOpen();
	const updatesChecked = useRef(false);
	useEffect(() => {
		if (view === "loading" || updatesChecked.current) return;
		updatesChecked.current = true;
		checkForUpdates({ manual: false });
	}, [view]);

	// The sort of the list on screen: remembered per kind of view, a manual
	// playlist's own in its file.
	const viewSorts = useViewSorts();
	const sortScope = sortScopeOf(listView, playlist?.type ?? null);
	// Each view groups into sections or not on its own.
	const listDisplay = viewSorts.displayOf(sortScope ?? "playlist");
	const defaultLabel = defaultSortLabel(listView, playlist);
	const remembered = sortScope ? viewSorts.sorts[sortScope] : viewSortOf(playlist?.sort);
	// A view without an order of its own never shows it.
	const viewSort: ViewSort = remembered.field === "default" && !defaultLabel ? DEFAULT_SORT : remembered;
	const viewRows = useMemo(() => {
		if (viewSort.field === "default") return viewSort.dir === "desc" ? [...naturalRows].reverse() : naturalRows;
		const compare = compareBy({ field: viewSort.field, dir: viewSort.dir });
		return [...naturalRows].sort((a, b) => compare(a.track, b.track));
	}, [naturalRows, viewSort.field, viewSort.dir]);
	// Sections of the list: by the sort field, or for a view's own order its
	// natural parts (an artist's albums, an album's discs, a folder's subfolders).
	const rowSection = useMemo((): ((track: Track) => SortSection) | null => {
		if (viewSort.field !== "default") return sectionOf(viewSort.field);
		switch (listView.kind) {
			case "artist":
				return sectionOf("album");
			case "album": {
				const discs = new Set(currentGroup?.tracks.map(track => track.discNumber ?? 1));
				if (discs.size < 2) return null;
				return track => {
					const disc = track.discNumber ?? 1;
					return { key: String(disc), label: t("detail.disc", { number: disc }) };
				};
			}
			case "folder": {
				const prefix = listView.id ? `${listView.id}/` : "";
				const here = currentGroup?.name ?? "";
				return track => {
					const folder = folderOf(track.relPath);
					const below = folder.startsWith(prefix) ? folder.slice(prefix.length) : "";
					return { key: below, label: below || here };
				};
			}
			default:
				return null;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- labels are translated
	}, [viewSort.field, listView, currentGroup, language]);
	// The gray detail next to each track: the sort field's value, or for the
	// history views in their own order how often / when it was played.
	const historyView = viewSort.field === "default" && listView.kind === "system" ? listView.id : null;
	const rowHint = useMemo(() => {
		const stats = trackStats.stats;
		if (historyView === "mostPlayed") {
			return (track: Track) => t("detail.playCount", { count: stats[track.relPath]?.playCount ?? 0 });
		}
		if (historyView === "recentlyPlayed") {
			return (track: Track) => {
				const at = stats[track.relPath]?.lastPlayedAt;
				return at ? formatDateTime(at) : null;
			};
		}
		return hintOf(viewSort.field);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- dates are formatted per language
	}, [viewSort.field, historyView, trackStats.stats, language]);
	const viewKey = viewKeyOf(listView);

	// An album in its own order numbers its tracks; with several discs as "disc.track".
	const albumNumber = useMemo(() => {
		if (listView.kind !== "album" || !currentGroup) return null;
		const multiDisc = new Set(currentGroup.tracks.map(track => track.discNumber ?? 1)).size > 1;
		return (track: Track) => track.trackNumber == null ? ""
			: multiDisc ? `${track.discNumber ?? 1}.${String(track.trackNumber).padStart(2, "0")}`
			: String(track.trackNumber);
	}, [listView.kind, currentGroup]);

	const {
		searchQuery, setSearchQuery,
		displayRows, displayFiles, looseFromIndex, isSearching, handleShuffleAll
	} = useTrackListLogic(viewRows, playTrack);
	const { ref: listRef, onScroll: onListScroll } = useSearchScroll(searchQuery, viewKey);

	// Selection lasts as long as the list it was made in (view and search).
	const [selection, setSelection] = useState<Selection>(NO_SELECTION);
	const selectionScope = `${viewKey}|${searchQuery}`;
	const selectedKeys = selection.scope === selectionScope ? selection.keys : NO_SELECTION.keys;
	const selectedRows = useMemo(() => displayRows.filter(row => selectedKeys.has(row.key)), [displayRows, selectedKeys]);
	const selectedTracks = useMemo(() => selectedRows.map(row => row.track), [selectedRows]);
	const clearSelection = () => setSelection(NO_SELECTION);
	// Back (the phone's, the mouse's back button, Alt+Left) first lets the selection go.
	useBackLayer(selectedRows.length > 0, clearSelection);
	const selectAll = () =>
		setSelection({ scope: selectionScope, keys: new Set(displayRows.map(row => row.key)), anchor: null });

	/** Ctrl/Cmd+click (`additive`) toggles a row, Shift+click selects from the anchor to it. */
	const selectRow = (row: ListRow, index: number, how: { range: boolean; additive: boolean }) => {
		const keys = new Set(how.additive ? selectedKeys : []);
		let anchor: string | null = row.key;
		if (how.range) {
			const anchorKey = selection.scope === selectionScope ? selection.anchor : null;
			const from = anchorKey ? displayRows.findIndex(r => r.key === anchorKey) : -1;
			const [low, high] = from < 0 ? [index, index] : [Math.min(from, index), Math.max(from, index)];
			for (let i = low; i <= high; i++) keys.add(displayRows[i].key);
			anchor = from < 0 ? row.key : anchorKey;
		} else if (!keys.delete(row.key)) {
			keys.add(row.key);
		}
		setSelection({ scope: selectionScope, keys, anchor });
	};

	const editablePlaylist = playlist && !playlist.readOnly ? playlist : null;
	const manualPlaylist = editablePlaylist?.type === "manual" ? editablePlaylist : null;

	const handleSortChange = (sort: ViewSort) => {
		if (sortScope) viewSorts.setSort(sortScope, sort);
		else if (manualPlaylist) playlists.setSort(manualPlaylist.id, sortSpecOf(sort));
	};
	// Read-only playlists keep the order they came with.
	const sortLocked = !sortScope && !manualPlaylist;

	// Navigating always leaves the search, even to the view already open.
	// Where "back" returns to when it is not the view's own list: the view
	// settings were opened from, or the playlists page for a built-in playlist
	// opened from its card.
	const [backTo, setBackTo] = useState<View | null>(null);
	// Views left by going back, the latest last: "forward" reopens them, any
	// other navigation forgets them.
	const [forwardViews, setForwardViews] = useState<{ view: View; backTo: View | null }[]>([]);

	/** Open `next`; `from` is where going back should return to, if not the usual place. */
	const showView = (next: View, from?: View) => {
		setForwardViews([]);
		openView(next, from);
	};

	const openView = (next: View, from?: View) => {
		if (next.kind === "settings") {
			if (listView.kind !== "settings") setBackTo(listView);
		} else {
			setBackTo(from ?? null);
		}
		setRenamingId(null);
		setSearchQuery("");
		setListView(next);
	};

	/**
	 * Where "back" (Esc, the header's back button) leads from the current view:
	 * an item opened by a link back where it was opened, otherwise to its list;
	 * a top-level view to the library; nowhere from the library.
	 */
	const parentView = (): View | null => {
		switch (listView.kind) {
			case "playlist": return backTo ?? PLAYLISTS_VIEW;
			case "tag": return backTo ?? TAGS_VIEW;
			case "artist": return backTo ?? ARTISTS_VIEW;
			case "album": return backTo ?? ALBUMS_VIEW;
			case "folder":
				return backTo ?? (listView.id ? { kind: "folder", id: listView.id.split("/").slice(0, -1).join("/") } : LIBRARY_VIEW);
			case "settings": return backTo ?? LIBRARY_VIEW;
			case "system": return listView.id === "library" ? null : backTo ?? LIBRARY_VIEW;
			default: return LIBRARY_VIEW;
		}
	};

	const goBack = () => {
		const parent = parentView();
		if (!parent) return;
		setForwardViews(views => [...views, { view: listView, backTo }]);
		openView(parent);
	};

	const goForward = () => {
		const entry = forwardViews[forwardViews.length - 1];
		if (!entry) return;
		setForwardViews(views => views.slice(0, -1));
		setRenamingId(null);
		setSearchQuery("");
		setListView(entry.view);
		setBackTo(entry.backTo);
	};

	// Esc goes back, unless something else uses it: an open menu, dialog or
	// cover viewer closes itself, and a text field keeps its own Esc (except
	// the empty track search, see the toolbar).
	const parent = parentView();
	useEffect(() => {
		if (!parent) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented || selectedRows.length > 0) return;
			if (document.querySelector(".dialog-backdrop, .context-menu, .cover-viewer-backdrop")) return;
			const target = e.target as HTMLElement | null;
			if (target?.matches("input, textarea, select, [contenteditable]") && !target.matches(".track-search input")) return;
			goBack();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	// Ctrl+A selects the whole list, Esc clears the selection (before going back).
	const showsTrackList = !CARD_PAGES.includes(listView.kind);
	useEffect(() => {
		if (!showsTrackList) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || document.querySelector(".dialog-backdrop, .context-menu, .cover-viewer-backdrop")) return;
			if ((e.target as HTMLElement | null)?.matches("input, textarea, select, [contenteditable]")) return;
			if (e.key === "Escape" && selectedRows.length > 0) {
				clearSelection();
			} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && displayRows.length > 0) {
				e.preventDefault();
				selectAll();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	/** Create an empty playlist and open it with its name ready to edit. */
	const createPlaylist = async () => {
		const created = await playlists.createManual(t("playlists.defaultName"));
		if (!created) return;
		showView({ kind: "playlist", id: created.id });
		setRenamingId(created.id);
	};

	const addToPlaylist = async (target: Playlist, tracks: Track[]) => {
		if (await playlists.addTracks(target.id, tracks.map(t => t.relPath))) {
			notifyInfo(t("notice.addedToPlaylist", { name: target.name }));
		}
	};

	const createPlaylistWith = async (name: string, tracks: Track[]) => {
		const created = await playlists.createManual(name);
		if (created) await addToPlaylist(created, tracks);
	};

	const openEditor = (edited: Playlist | null) => setEditor({ playlist: edited });

	const saveSmartPlaylist = async (name: string, rules: SmartRules) => {
		const edited = editor?.playlist;
		setEditor(null);
		if (!edited) {
			const created = await playlists.createSmart(name, rules);
			if (created) showView({ kind: "playlist", id: created.id });
			return;
		}
		await playlists.setRules(edited.id, rules);
		if (name !== edited.name) await playlists.rename(edited.id, name);
	};

	const deletePlaylist = async (target: Playlist) => {
		const confirmed = await ask(t("confirm.deletePlaylist.body", { name: target.name }), {
			title: t("confirm.deletePlaylist.title"),
			kind: "warning",
			okLabel: t("common.delete"),
			cancelLabel: t("common.cancel"),
		});
		if (confirmed && await playlists.remove(target.id)) showView(PLAYLISTS_VIEW);
	};

	/** The tracks a playlist currently contains, in its order. */
	const tracksOf = async (target: Playlist): Promise<Track[]> => {
		if (target.type === "manual") {
			return (target.items ?? []).flatMap(item => tracksByPath.get(item.path) ?? []);
		}
		try {
			const paths = await invoke<string[]>("get_smart_playlist_tracks", { id: target.id });
			return paths.flatMap(path => tracksByPath.get(path) ?? []);
		} catch {
			return [];
		}
	};

	/** Play `track` within `tracks`, started from the view `source` (a view key). */
	const playFrom = (source: string, track: Track, tracks: Track[]) => {
		setPlayingFrom(source);
		playTrack(track, tracks);
	};

	/** Play `tracks` from the first one (cards' play buttons and menus). */
	const playTracks = (tracks: Track[], source: View) => {
		if (tracks.length > 0) playFrom(viewKeyOf(source), tracks[0], tracks);
	};

	const playPlaylist = async (target: Playlist) =>
		playTracks(await tracksOf(target), { kind: "playlist", id: target.id });

	const saveTag = async (name: string, color: string, categoryIds: string[]) => {
		const edited = tagDialog?.tag;
		const assignTo = tagDialog?.assignTo;
		setTagDialog(null);
		if (!edited) {
			const created = await tags.create(name, color, categoryIds);
			if (created && assignTo) trackStats.setTrackTag(assignTo, created.id, true);
			return;
		}
		const change: TagChange = {};
		if (name !== edited.name) change.name = name;
		if (color !== edited.color) change.color = color;
		const before = edited.categoryIds ?? [];
		if (categoryIds.length !== before.length || categoryIds.some(id => !before.includes(id))) change.categoryIds = categoryIds;
		if (Object.keys(change).length > 0) await tags.update(edited.id, change);
	};

	const saveCategory = async (name: string) => {
		const edited = categoryDialog?.category;
		const addTag = categoryDialog?.addTag;
		setCategoryDialog(null);
		if (edited) {
			if (name !== edited.name) await tags.renameCategory(edited.id, name);
			return;
		}
		const created = await tags.createCategory(name);
		if (created && addTag) await tags.update(addTag.id, { categoryIds: [...(addTag.categoryIds ?? []), created.id] });
	};

	/** Put a tag in `category`, or take it out. */
	const toggleTagCategory = (target: UserTag, category: TagCategory) => {
		const ids = target.categoryIds ?? [];
		tags.update(target.id, {
			categoryIds: ids.includes(category.id) ? ids.filter(id => id !== category.id) : [...ids, category.id],
		});
	};

	/** A tag dragged from one category's section to another's: moved there, or with `copy` added. */
	const moveTag = (target: UserTag, from: TagCategory | null, to: TagCategory | null, copy: boolean) => {
		const ids = target.categoryIds ?? [];
		const kept = copy || !from ? ids : ids.filter(id => id !== from.id);
		const next = to && !kept.includes(to.id) ? [...kept, to.id] : kept;
		if (next.length !== ids.length || next.some(id => !ids.includes(id))) tags.update(target.id, { categoryIds: next });
	};

	/** The tracks with any tag of `category`, newest first like a tag's. */
	const tracksOfCategory = (category: TagCategory): Track[] => {
		const ids = new Set(tags.tags.filter(tag => tag.categoryIds?.includes(category.id)).map(tag => tag.id));
		return files
			.filter(f => trackStats.stats[f.relPath]?.tags.some(id => ids.has(id)))
			.sort((a, b) => b.dateCreated - a.dateCreated);
	};

	/** Delete a category (after confirming); its tags stay. */
	const deleteCategory = async (target: TagCategory) => {
		const confirmed = await ask(t("confirm.deleteCategory.body", { name: target.name }), {
			title: t("confirm.deleteCategory.title"),
			kind: "warning",
			okLabel: t("common.delete"),
			cancelLabel: t("common.cancel"),
		});
		if (confirmed) await tags.removeCategory(target.id);
	};

	/** Move a category one place up (-1) or down (1). */
	const moveCategory = (target: TagCategory, step: number) => {
		const ids = tags.categories.map(category => category.id);
		const from = ids.indexOf(target.id);
		const to = from + step;
		if (from < 0 || to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to], ids[from]];
		tags.reorderCategories(ids);
	};

	const deleteTag = async (target: UserTag) => {
		const count = tagCounts.get(target.id) ?? 0;
		const body = count > 0
			? t("confirm.deleteTag.bodyUsed", { name: target.name, count })
			: t("confirm.deleteTag.body", { name: target.name });
		const confirmed = await ask(body, {
			title: t("confirm.deleteTag.title"),
			kind: "warning",
			okLabel: t("common.delete"),
			cancelLabel: t("common.cancel"),
		});
		// Assignments to a deleted tag are dropped when stats are derived.
		if (confirmed && await tags.remove(target.id)) trackStats.reload();
	};

	/** Merge `from` into `into` after a warning that `from` is deleted. */
	const mergeTags = async (from: UserTag, into: UserTag) => {
		const count = tagCounts.get(from.id) ?? 0;
		const confirmed = await ask(t("confirm.mergeTag.body", { from: from.name, into: into.name, count }), {
			title: t("confirm.mergeTag.title"),
			kind: "warning",
			okLabel: t("confirm.mergeTag.ok"),
			cancelLabel: t("common.cancel"),
		});
		if (!confirmed) return;
		setMergeTag(null);
		if (await tags.merge(from.id, into.id)) {
			trackStats.reload();
			pins.reload();
			playlists.reload();
		}
	};

	/** Move track files to the trash (after confirming) and drop them from the library. */
	const deleteTracks = async (tracks: Track[]) => {
		const confirmed = await ask(
			t("confirm.deleteFiles.body", { count: tracks.length, title: displayTitle(tracks[0]) }),
			{
				title: t("confirm.deleteFiles.title"),
				kind: "warning",
				okLabel: t("confirm.deleteFiles.ok"),
				cancelLabel: t("common.cancel"),
			},
		);
		if (!confirmed) return;
		forgetTracks(tracks);
		try {
			await invoke("delete_tracks", { paths: tracks.map(t => t.relPath) });
		} catch (e) {
			notifyError(t("error.deleteFile"), e);
			return;
		}
		const gone = new Set(tracks.map(t => t.path));
		library.setFiles(prev => prev.filter(f => !gone.has(f.path)));
		notifyInfo(t("notice.movedToTrash", { count: tracks.length }));
	};

	const tracksOfTag = (target: UserTag): Track[] => tagTracks(files, target.id, trackStats.stats);

	const closeMenu = useCallback(() => setMenu(null), []);

	// Back and forward only within the open library (not on the picker).
	const inLibrary = view === "library";
	// Android: Back from any view but the library goes up a level, as on the
	// desktop (an artist to the artists, ...), and from the library the app to
	// the background (MainActivity.kt).
	const awayFromLibrary = inLibrary && !(listView.kind === "system" && listView.id === "library");
	useBackLayer(androidStorage !== null && awayFromLibrary, () => goBack());
	useShortcutActions({
		back: () => inLibrary && goBack(),
		forward: () => inLibrary && goForward(),
		playPause: () => activePath && togglePlay(),
		previous: () => activePath && onPrev(),
		next: () => activePath && onNext(),
		volumeUp: () => setVolume(Math.min(1, volume + VOLUME_STEP)),
		volumeDown: () => setVolume(Math.max(0, volume - VOLUME_STEP)),
		undoEdit: () => {
			if (undoablePaths) undoEdit(undoablePaths);
		},
	});

	/** Open an artist's page from a link; back returns here. */
	const canOpenArtist = (name: string) => artistsByKey.has(artistKey(name));
	const openArtist = (name: string) => {
		if (canOpenArtist(name)) showView({ kind: "artist", id: artistKey(name) }, listView);
	};
	const openAlbum = (track: Track) => {
		const key = albumKeyOf(track);
		if (key && albumsByKey.has(key)) showView({ kind: "album", id: key }, listView);
	};

	/**
	 * "Go to" entries of a track: its artists, album and folder, except the
	 * page open now (unless `everywhere`: from the phone's player).
	 */
	const goToEntries = (track: Track, everywhere = false): MenuEntry[] => {
		const here = (kind: View["kind"], id: string) =>
			!everywhere && listView.kind === kind && "id" in listView && listView.id === id;
		const entries: MenuEntry[] = [];
		for (const name of track.artists) {
			const key = artistKey(name);
			if (artistsByKey.has(key) && !here("artist", key)) {
				entries.push({ kind: "item", label: name, icon: <MicVocal size={16} />, onSelect: () => openArtist(name) });
			}
		}
		const album = albumKeyOf(track);
		if (album && albumsByKey.has(album) && !here("album", album)) {
			entries.push({ kind: "item", label: track.album ?? "", icon: <Disc3 size={16} />, onSelect: () => openAlbum(track) });
		}
		const folder = folderOf(track.relPath);
		if (showFolders && !here("folder", folder)) {
			entries.push({
				kind: "item",
				label: folder ? lastSegment(folder) : lastSegment(settings.lastPath),
				icon: <Folder size={16} />,
				onSelect: () => showView({ kind: "folder", id: folder }, listView),
			});
		}
		// Android has no file manager to show the file in.
		if (!androidStorage) {
			entries.push({ kind: "item", label: revealLabel(), icon: <FolderSearch size={16} />, onSelect: () => revealFile(track.path) });
		}
		if (entries.length === 0) return [];
		return [{ kind: "label", label: t("menu.goTo") }, ...entries, { kind: "separator" }];
	};

	/** Write `edit` into the tags of `tracks`; the library follows. */
	const saveMetadata = async (tracks: Track[], edit: MetadataEdit) => {
		const paths = tracks.map(track => track.path);
		let result: EditResult;
		try {
			result = await releaseWhile(paths, () => invoke<EditResult>("edit_tracks", { paths, edit }));
		} catch (e) {
			notifyError(t("edit.failed"), e);
			return;
		}
		library.setFiles(result.tracks);
		if (result.failed.length > 0) {
			notifyError(t("edit.someFailed", { count: result.failed.length, list: result.failed.join("; ") }));
		}
		const written = tracks.length - result.failed.length;
		if (written === 0) return;
		setEditing(null);
		setUndoablePaths(paths);
		notifyUndoable(
			written === 1 ? t("edit.saved") : t("edit.savedMany", { count: written }),
			t("edit.undo"),
			() => undoEdit(paths),
		);
	};

	/** Put back the tags the last edit (of the files at `paths`) replaced. */
	const undoEdit = async (paths: string[]) => {
		setUndoablePaths(current => (current === paths ? null : current));
		let result: EditResult;
		try {
			result = await releaseWhile(paths, () => invoke<EditResult>("undo_track_edit"));
		} catch (e) {
			notifyError(t("edit.undoFailed"), e);
			return;
		}
		library.setFiles(result.tracks);
		if (result.failed.length > 0) {
			notifyError(t("edit.undoSkipped", { count: result.failed.length, list: result.failed.join("; ") }));
		} else {
			notifyInfo(t("edit.undone"));
		}
	};

	const trackMenu = (row: ListRow): MenuEntry[] => {
		const favorite = trackStats.stats[row.track.relPath]?.favorite ?? false;
		const entries: MenuEntry[] = [
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playFrom(viewKey, row.track, displayFiles) },
			{
				kind: "item",
				label: t("selection.select"),
				icon: <SquareCheck size={16} />,
				// Starts a selection with this track (also the way in without Ctrl or a long press).
				onSelect: () => selectRow(row, displayRows.findIndex(r => r.key === row.key), { range: false, additive: true }),
			},
			{ kind: "separator" },
			{
				kind: "item",
				label: favorite ? t("common.removeFromFavorites") : t("common.addToFavorites"),
				icon: <Heart size={16} fill={favorite ? "currentColor" : "none"} />,
				onSelect: () => trackStats.toggleFavorite(row.track),
			},
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo([row.track]) },
			{ kind: "item", label: t("common.tags"), icon: <Tag size={16} />, onSelect: () => setTagPicker([row.track]) },
			{ kind: "item", label: t("edit.menu"), icon: <PencilLine size={16} />, onSelect: () => setEditing([row.track]) },
			{ kind: "separator" },
			...goToEntries(row.track),
		];
		// Danger zone: removals, then the file itself.
		if (currentTag) {
			const tag = currentTag;
			entries.push({
				kind: "item",
				label: t("menu.removeTag", { name: tag.name }),
				icon: <X size={16} />,
				danger: true,
				onSelect: () => trackStats.setTrackTag([row.track], tag.id, false),
			});
		}
		if (manualPlaylist && row.itemId) {
			const itemId = row.itemId;
			entries.push({
				kind: "item",
				label: t("menu.removeFromPlaylist"),
				icon: <ListX size={16} />,
				danger: true,
				onSelect: () => playlists.removeItems(manualPlaylist.id, [itemId]),
			});
		}
		entries.push({
			kind: "item",
			label: t("menu.deleteFromDisk"),
			icon: <Trash2 size={16} />,
			danger: true,
			onSelect: () => deleteTracks([row.track]),
		});
		return entries;
	};

	/** Favorite or not: all of them if any is not yet, otherwise none. */
	const toggleFavorites = (tracks: Track[]) =>
		trackStats.setFavorite(tracks, !tracks.every(track => trackStats.stats[track.relPath]?.favorite));

	const removeRowsFromPlaylist = (rows: ListRow[]) => {
		if (manualPlaylist) playlists.removeItems(manualPlaylist.id, rows.flatMap(row => row.itemId ?? []));
	};

	const deleteSelected = async () => {
		await deleteTracks(selectedTracks);
		clearSelection();
	};

	/** The menu of a selected row: for all the selected tracks. */
	const selectionMenu = (): MenuEntry[] => {
		const tracks = selectedTracks;
		const allFavorite = tracks.every(track => trackStats.stats[track.relPath]?.favorite);
		const entries: MenuEntry[] = [
			{ kind: "label", label: t("selection.count", { count: tracks.length }) },
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playFrom(viewKey, tracks[0], tracks) },
			{ kind: "separator" },
			{
				kind: "item",
				label: allFavorite ? t("common.removeFromFavorites") : t("common.addToFavorites"),
				icon: <Heart size={16} fill={allFavorite ? "currentColor" : "none"} />,
				onSelect: () => toggleFavorites(tracks),
			},
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo(tracks) },
			{ kind: "item", label: t("common.tags"), icon: <Tag size={16} />, onSelect: () => setTagPicker(tracks) },
			{ kind: "item", label: t("edit.menu"), icon: <PencilLine size={16} />, onSelect: () => setEditing(tracks) },
			{ kind: "separator" },
		];
		if (currentTag) {
			const tag = currentTag;
			entries.push({
				kind: "item",
				label: t("menu.removeTag", { name: tag.name }),
				icon: <X size={16} />,
				danger: true,
				onSelect: () => trackStats.setTrackTag(tracks, tag.id, false),
			});
		}
		if (manualPlaylist) {
			const rows = selectedRows;
			entries.push({
				kind: "item",
				label: t("menu.removeFromPlaylist"),
				icon: <ListX size={16} />,
				danger: true,
				onSelect: () => {
					removeRowsFromPlaylist(rows);
					clearSelection();
				},
			});
		}
		entries.push({ kind: "item", label: t("menu.deleteFromDisk"), icon: <Trash2 size={16} />, danger: true, onSelect: deleteSelected });
		return entries;
	};

	/** The menu of a queued track; `row.itemId` is its queue position. */
	const queueMenu = (row: ListRow): MenuEntry[] => {
		const position = Number(row.itemId);
		return [
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playAt(position) },
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo([row.track]) },
			{ kind: "separator" },
			...goToEntries(row.track),
			{ kind: "item", label: t("queue.remove"), icon: <X size={16} />, danger: true, onSelect: () => removeFromQueue(position) },
		];
	};

	/** "Pin" / "Unpin": keeps the thing at the top of its list. */
	const pinEntry = (kind: PinKind, key: string): MenuEntry => {
		const pinned = pins.isPinned(kind, key);
		return {
			kind: "item",
			label: pinned ? t("pin.unpin") : t("pin.pin"),
			icon: pinned ? <PinOff size={16} /> : <Pin size={16} />,
			onSelect: () => pins.setPinned(kind, key, !pinned),
		};
	};

	const playlistMenu = (target: Playlist): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView({ kind: "playlist", id: target.id }) },
		{
			kind: "item",
			label: t("common.play"),
			icon: <Play size={16} />,
			onSelect: () => playPlaylist(target),
		},
		{
			kind: "item",
			label: t("common.addTo"),
			icon: <ListPlus size={16} />,
			onSelect: async () => {
				const tracks = await tracksOf(target);
				if (tracks.length > 0) setAddTo(tracks);
			},
		},
		pinEntry("playlist", target.id),
		...(target.readOnly ? [] : [
			{ kind: "separator" } as const,
			{
				kind: "item" as const,
				label: t("common.delete"),
				icon: <Trash2 size={16} />,
				danger: true,
				onSelect: () => deletePlaylist(target),
			},
		]),
	];

	/** Menu of an artist or album card. */
	/** Choose an image as the album's or artist's cover. */
	const chooseGroupCover = (kind: CoverKind, group: TrackGroup) => {
		pickImage()
			.then(data => groupCoverStore.setCover(kind, group.key, data))
			.catch(e => notifyError(t("error.setCover"), e));
	};

	/** An album's or artist's own cover: set, change, or back to the tracks' art. */
	const coverEntries = (kind: CoverKind, group: TrackGroup): MenuEntry[] => [
		{
			kind: "item",
			label: group.cover ? t("group.changeCover") : t("group.setCover"),
			icon: <ImagePlus size={16} />,
			onSelect: () => chooseGroupCover(kind, group),
		},
		...(group.cover ? [{
			kind: "item" as const,
			label: t("group.resetCover"),
			icon: <ImageOff size={16} />,
			onSelect: () => groupCoverStore.setCover(kind, group.key, null),
		}] : []),
	];

	const groupMenu = (group: TrackGroup, open: View): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView(open) },
		{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playTracks(group.tracks, open) },
		{ kind: "separator" },
		{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo(group.tracks) },
		{ kind: "item", label: t("common.tags"), icon: <Tag size={16} />, onSelect: () => setTagPicker(group.tracks) },
		...(open.kind === "artist" || open.kind === "album"
			? [pinEntry(open.kind, group.key), { kind: "separator" as const }, ...coverEntries(open.kind, group)]
			: []),
	];

	/** The folder path as breadcrumbs, from the library root. */
	const folderCrumbs = (folder: string): Crumb[] => {
		const parts = folder ? folder.split("/") : [];
		return [
			{ label: lastSegment(settings.lastPath), onClick: () => showView(ROOT_FOLDER_VIEW) },
			...parts.map((part, index) => ({
				label: part,
				onClick: () => showView({ kind: "folder", id: parts.slice(0, index + 1).join("/") }),
			})),
		];
	};

	const categoryMenu = (target: TagCategory): MenuEntry[] => {
		const index = tags.categories.findIndex(category => category.id === target.id);
		const tracks = tracksOfCategory(target);
		return [
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, disabled: tracks.length === 0, onSelect: () => playTracks(tracks, TAGS_VIEW) },
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, disabled: tracks.length === 0, onSelect: () => setAddTo(tracks) },
			{ kind: "separator" },
			{ kind: "item", label: t("tags.newTagIn"), icon: <Tag size={16} />, onSelect: () => setTagDialog({ tag: null, categoryIds: [target.id] }) },
			{ kind: "item", label: t("tags.renameCategory"), icon: <Pencil size={16} />, onSelect: () => setCategoryDialog({ category: target }) },
			{ kind: "separator" },
			{ kind: "item", label: t("tags.moveUp"), icon: <ArrowUp size={16} />, disabled: index <= 0, onSelect: () => moveCategory(target, -1) },
			{ kind: "item", label: t("tags.moveDown"), icon: <ArrowDown size={16} />, disabled: index >= tags.categories.length - 1, onSelect: () => moveCategory(target, 1) },
			{ kind: "separator" },
			{ kind: "item", label: t("common.delete"), icon: <Trash2 size={16} />, danger: true, onSelect: () => deleteCategory(target) },
		];
	};

	/** The tag's categories as check items, and a new category for it. */
	const tagCategoryEntries = (target: UserTag): MenuEntry[] => [
		{ kind: "separator" },
		{ kind: "label", label: t("tags.categoriesOf") },
		...tags.categories.map((category): MenuEntry => ({
			kind: "item",
			label: category.name,
			icon: target.categoryIds?.includes(category.id) ? <Check size={16} /> : undefined,
			onSelect: () => toggleTagCategory(target, category),
		})),
		{ kind: "item", label: t("tags.newCategoryFor"), icon: <FolderPlus size={16} />, onSelect: () => setCategoryDialog({ category: null, addTag: target }) },
	];

	/** A tag chip on the current track: open the tag, take it off, edit it. */
	const tagChipMenu = (track: Track, target: UserTag): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView({ kind: "tag", id: target.id }, listView) },
		{ kind: "item", label: t("tagChip.removeFromTrack"), icon: <X size={16} />, onSelect: () => trackStats.setTrackTag([track], target.id, false) },
		{ kind: "item", label: t("detail.editTags"), icon: <Tag size={16} />, onSelect: () => setTagPicker([track]) },
		{ kind: "separator" },
		{ kind: "item", label: t("tags.editTag"), icon: <Pencil size={16} />, onSelect: () => setTagDialog({ tag: target }) },
	];

	const tagMenu = (target: UserTag): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView({ kind: "tag", id: target.id }) },
		{
			kind: "item",
			label: t("common.play"),
			icon: <Play size={16} />,
			onSelect: () => playTracks(tracksOfTag(target), { kind: "tag", id: target.id }),
		},
		{
			kind: "item",
			label: t("common.addTo"),
			icon: <ListPlus size={16} />,
			onSelect: () => {
				const tracks = tracksOfTag(target);
				if (tracks.length > 0) setAddTo(tracks);
			},
		},
		pinEntry("tag", target.id),
		{ kind: "separator" },
		{ kind: "item", label: t("common.edit"), icon: <Pencil size={16} />, onSelect: () => setTagDialog({ tag: target }) },
		{ kind: "item", label: t("mergeTag.menu"), icon: <GitMerge size={16} />, disabled: tags.tags.length < 2, onSelect: () => setMergeTag(target) },
		...tagCategoryEntries(target),
		{ kind: "separator" },
		{ kind: "item", label: t("common.delete"), icon: <Trash2 size={16} />, danger: true, onSelect: () => deleteTag(target) },
	];

	const emptyText = t(isSearching
		? "empty.search"
		: listView.kind === "system"
			? EMPTY_TEXT[listView.id]
			: listView.kind === "tag"
				? "empty.tag"
				: currentGroup
				? "empty.group"
				: playlist?.type === "smart"
				? "empty.smart"
				: "empty.playlist");

	// Play all: from the first track, in order.
	const handlePlayAll = () => {
		if (displayFiles.length === 0) return;
		setPlayingFrom(viewKey);
		playTrack(displayFiles[0], displayFiles, { shuffle: false });
	};

	const handleShuffleView = () => {
		if (displayFiles.length > 0) setPlayingFrom(viewKey);
		handleShuffleAll();
	};

	// What is highlighted as playing: the source view's id within a kind.
	const playingKey = activePath ? playingFrom : null;
	const playingIn = (kind: string): string | null =>
		playingKey?.startsWith(`${kind}:`) ? playingKey.slice(kind.length + 1) : null;

	// Show the loading screen while the initial folder is being resolved or a
	// scan is in progress (startup or switching libraries). The track list is
	// never shown during a scan.
	if (view === "loading" || library.isLoading) {
		return (
			<main className="container loading-screen">
				<ThemedLogo className="loading-logo" />
				{library.isLoading && (
					<div className="loading-status">
						<div className="spinner" aria-hidden="true" />
						<span>{t("loading.indexing")}</span>
					</div>
				)}
				<Notices />
			</main>
		);
	}

	if (view === "picker") {
		return (
			<main className="container">
				<header className="header">
					<div className="logo-wrapper">
						<ThemedLogo className="app-logo" />
					</div>
				</header>
				<LibraryPicker
					recentPaths={settings.recentPaths}
					error={pickerError}
					onOpen={openLibrary}
					onRemoveRecent={handleRemoveRecent}
				/>
				<Notices />
			</main>
		);
	}

	// A built-in list's size, under its title (on phones in the top bar).
	const viewSummary = [
		countTracks(viewRows.length),
		viewRows.length > 0 ? formatTotalDuration(viewRows.reduce((sum, row) => sum + row.track.duration, 0)) : null,
	].filter(Boolean).join(" · ");
	// Pages of tracks (with the toolbar's search) and pages of cards (grid or list).
	const cardPage = listView.kind === "playlists" || listView.kind === "tags"
		|| listView.kind === "artists" || listView.kind === "albums" ? listView.kind : null;
	const hasTrackList = !cardPage && listView.kind !== "settings";
	const cardLayout = cardPage
		? { value: layouts[cardPage], onChange: (layout: PlaylistsLayout) => setLayout(cardPage, layout) }
		: null;

	// Phones close their player screens when one of these opens another view.
	const leavePlayer = () => {
		setPhonePanel(null);
		setNowPlayingOpen(false);
	};

	// The right panel's two views; on phones each is a screen of its own.
	const queuePanel = (
		<QueuePanel
			order={queue.order}
			index={queue.index}
			onPlayAt={playAt}
			onOpenMenu={(row, x, y) => setMenu({ x, y, entries: queueMenu(row) })}
			onSetUpcoming={setUpcoming}
		/>
	);
	const detailPanel = (
		<TrackDetailPanel
			track={currentTrack ?? null}
			stats={currentTrack ? trackStats.stats[currentTrack.relPath] ?? null : null}
			onToggleFavorite={trackStats.toggleFavorite}
			onSetRating={trackStats.setRating}
			tagsById={tags.byId}
			onEditTags={(track) => setTagPicker([track])}
			onEditDetails={(track) => setEditing([track])}
			onOpenTag={(target) => {
				leavePlayer();
				showView({ kind: "tag", id: target.id }, listView);
			}}
			onRemoveTag={(track, target) => trackStats.setTrackTag([track], target.id, false)}
			onOpenTagMenu={(track, target, x, y) => setMenu({ x, y, entries: tagChipMenu(track, target) })}
			canOpenArtist={canOpenArtist}
			onOpenArtist={(name) => {
				leavePlayer();
				openArtist(name);
			}}
			canOpenAlbum={(track) => { const key = albumKeyOf(track); return !!key && albumsByKey.has(key); }}
			onOpenAlbum={(track) => {
				leavePlayer();
				openAlbum(track);
			}}
		/>
	);

	return (
		<>
			<MobileHeader
				onOpenDrawer={() => setDrawerOpen(true)}
				title={t(SECTION_TITLES[listView.kind === "system" ? listView.id : listView.kind])}
				summary={listView.kind === "system" ? viewSummary : null}
				// Phones only: open, it takes Back (the desktop's bar is hidden).
				search={isPhone && hasTrackList ? { query: searchQuery, placeholder: t("toolbar.search"), onChange: setSearchQuery } : null}
				layout={cardLayout}
			/>
			<div className="app-layout">
				<Sidebar
					libraryPath={settings.lastPath}
					onChangeLibrary={goToPicker}
					view={listView}
					onViewChange={showView}
					showFolders={showFolders}
					playingKey={playingKey}
					drawerOpen={drawerOpen}
					onOpenDrawer={() => setDrawerOpen(true)}
					onCloseDrawer={() => setDrawerOpen(false)}
					swipeDrawer={isPhone}
				/>

				<main className="container">
					{listView.kind === "playlists" ? (
						<PlaylistsPage
							pinned={pinned}
							onOpenPinned={(id) => showView({ kind: "system", id }, PLAYLISTS_VIEW)}
							onPlayPinned={(id) => playTracks(systemViewTracks(files, id, trackStats.stats), { kind: "system", id })}
							playingPinnedId={playingIn("system")}
							playingPlaylistId={playingIn("playlist")}
							playlists={playlists.playlists}
							tracksByPath={tracksByPath}
							smartPaths={smartPaths}
							layout={layouts.playlists}
							onLayoutChange={(layout) => setLayout("playlists", layout)}
							onOpen={(target) => showView({ kind: "playlist", id: target.id })}
							onPlay={playPlaylist}
							onOpenMenu={(target, x, y) => setMenu({ x, y, entries: playlistMenu(target) })}
							isPinned={(target) => pins.isPinned("playlist", target.id)}
							onCreate={createPlaylist}
							onCreateSmart={() => openEditor(null)}
						/>
					) : listView.kind === "tags" ? (
						<TagsPage
							tags={tags.tags}
							categories={tags.categories}
							counts={tagCounts}
							layout={layouts.tags}
							onLayoutChange={(layout) => setLayout("tags", layout)}
							onOpen={(target) => showView({ kind: "tag", id: target.id })}
							onPlay={(target) => playTracks(tracksOfTag(target), { kind: "tag", id: target.id })}
							playingId={playingIn("tag")}
							onOpenMenu={(target, x, y) => setMenu({ x, y, entries: tagMenu(target) })}
							isPinned={(target) => pins.isPinned("tag", target.id)}
							onCreate={(category) => setTagDialog({ tag: null, categoryIds: category ? [category.id] : [] })}
							onCreateCategory={() => setCategoryDialog({ category: null })}
							onRenameCategory={(category) => setCategoryDialog({ category })}
							onMoveTag={moveTag}
							onOpenCategoryMenu={(target, x, y) => setMenu({ x, y, entries: categoryMenu(target) })}
							onReorderCategories={tags.reorderCategories}
						/>
					) : listView.kind === "settings" ? (
						<SettingsPage
							theme={theme}
							onThemeChange={setTheme}
							libraryPath={settings.lastPath}
							otherRecentCount={settings.recentPaths.filter(p => p !== settings.lastPath).length}
							onChangeFolder={goToPicker}
							onRescan={rescan}
							onClearRecent={clearRecent}
							onCheckConflicts={checkConflicts}
						/>
					) : listView.kind === "artists" ? (
						<CollectionPage
							memoryKey="artists"
							sorts={artistSorts()}
							sections={trackCountSections()}
							title={t("nav.artists")}
							groups={listedArtists}
							icon={MicVocal}
							round
							describe={(group) => [countTracks(group.tracks.length), group.subtitle].filter(Boolean).join(" · ")}
							emptyText={t("collection.noArtists")}
							filterPlaceholder={t("collection.filterArtists")}
							noMatchText={t("collection.noMatchArtists")}
							layout={layouts.artists}
							onLayoutChange={(layout) => setLayout("artists", layout)}
							onOpen={(group) => showView({ kind: "artist", id: group.key })}
							onPlay={(group) => playTracks(group.tracks, { kind: "artist", id: group.key })}
							playingKey={playingIn("artist")}
							onOpenMenu={(group, x, y) =>
								setMenu({ x, y, entries: groupMenu(group, { kind: "artist", id: group.key }) })}
							isPinned={(group) => pins.isPinned("artist", group.key)}
						/>
					) : listView.kind === "albums" ? (
						<CollectionPage
							memoryKey="albums"
							sorts={albumSorts()}
							sections={trackCountSections()}
							title={t("nav.albums")}
							groups={albums}
							icon={Disc3}
							describe={(group) => [group.subtitle ?? t("common.unknownArtist"), group.year].filter(Boolean).join(" · ")}
							detail={albumDetail}
							emptyText={t("collection.noAlbums")}
							filterPlaceholder={t("collection.filterAlbums")}
							noMatchText={t("collection.noMatchAlbums")}
							layout={layouts.albums}
							onLayoutChange={(layout) => setLayout("albums", layout)}
							onOpen={(group) => showView({ kind: "album", id: group.key })}
							onPlay={(group) => playTracks(group.tracks, { kind: "album", id: group.key })}
							playingKey={playingIn("album")}
							onOpenMenu={(group, x, y) =>
								setMenu({ x, y, entries: groupMenu(group, { kind: "album", id: group.key }) })}
							isPinned={(group) => pins.isPinned("album", group.key)}
						/>
					) : (
						<>
							{currentTag && (
								<TagHeader
									tag={currentTag}
									rows={viewRows}
									onBack={goBack}
									onEdit={() => setTagDialog({ tag: currentTag })}
									onDelete={() => deleteTag(currentTag)}
								/>
							)}

							{currentGroup && listView.kind === "artist" && (
								<GroupHeader
									kind={t("group.artist")}
									icon={MicVocal}
									round
									title={currentGroup.name}
									details={[currentGroup.subtitle]}
									covers={groupCovers(currentGroup, 1)}
									rows={viewRows}
									backTitle={t("group.allArtists")}
									onBack={goBack}
									coverActions={coverEntries("artist", currentGroup)}
								/>
							)}
							{currentGroup && listView.kind === "album" && (
								<GroupHeader
									kind={t("group.album")}
									icon={Disc3}
									title={currentGroup.name}
									details={[currentGroup.subtitle, currentGroup.year != null ? String(currentGroup.year) : null]}
									trackTotal={currentGroup.total}
									covers={groupCovers(currentGroup, 1)}
									rows={viewRows}
									backTitle={t("group.allAlbums")}
									onBack={goBack}
									coverActions={coverEntries("album", currentGroup)}
								/>
							)}
							{currentGroup && listView.kind === "folder" && (
								<GroupHeader
									kind={t("group.folder")}
									icon={Folder}
									title={currentGroup.name}
									covers={groupCovers(currentGroup)}
									rows={viewRows}
									crumbs={listView.id ? folderCrumbs(listView.id).slice(0, -1) : undefined}
									backTitle={t("group.parentFolder")}
									onBack={listView.id || backTo ? goBack : undefined}
								/>
							)}

							{playlist && (
								<PlaylistHeader
									key={playlist.id}
									playlist={playlist}
									rows={viewRows}
									missingCount={missingCount}
									startRenaming={renamingId === playlist.id}
									onBack={goBack}
									onRename={(name) => {
										setRenamingId(null);
										playlists.rename(playlist.id, name);
									}}
									onDelete={() => deletePlaylist(playlist)}
									onEditRules={() => openEditor(playlist)}
									onSetCover={(data) => playlists.setCover(playlist.id, data)}
									onClearCover={() => playlists.clearCover(playlist.id)}
								/>
							)}

							{listView.kind === "system" && (
								<div className="view-heading">
									<h1 className="view-heading-title">{t(SYSTEM_TITLES[listView.id])}</h1>
									<span className="view-heading-summary">{viewSummary}</span>
								</div>
							)}

							{selectedRows.length > 0 ? (
								<SelectionBar
									count={selectedRows.length}
									allFavorite={selectedTracks.every(track => trackStats.stats[track.relPath]?.favorite)}
									canSelectMore={selectedRows.length < displayRows.length}
									onPlay={() => playFrom(viewKey, selectedTracks[0], selectedTracks)}
									onAddTo={() => setAddTo(selectedTracks)}
									onTags={() => setTagPicker(selectedTracks)}
									onEdit={() => setEditing(selectedTracks)}
									onToggleFavorite={() => toggleFavorites(selectedTracks)}
									onRemoveFromPlaylist={manualPlaylist ? () => {
										removeRowsFromPlaylist(selectedRows);
										clearSelection();
									} : undefined}
									onDelete={deleteSelected}
									onSelectAll={selectAll}
									onClear={clearSelection}
								/>
							) : (
							<Toolbar
								searchQuery={searchQuery}
								onSearchChange={setSearchQuery}
								sort={viewSort}
								defaultLabel={defaultLabel}
								onSortChange={handleSortChange}
								display={listDisplay}
								onDisplayChange={(display) => viewSorts.setDisplay(sortScope ?? "playlist", display)}
								canGroup={rowSection !== null}
								sortDisabled={isSearching || sortLocked}
								onShuffleAll={handleShuffleView}
								onPlayAll={handlePlayAll}
							/>
							)}

							<div className="track-list-wrapper" ref={listRef} onScroll={onListScroll}>
								{!isSearching && artistAlbums.length > 0 && (
									<AlbumStrip
										albums={artistAlbums}
										playingKey={playingIn("album")}
										onOpen={(album) => showView({ kind: "album", id: album.key }, listView)}
										onPlay={(album) => playTracks(album.tracks, { kind: "album", id: album.key })}
										onOpenMenu={(album, x, y) =>
											setMenu({ x, y, entries: groupMenu(album, { kind: "album", id: album.key }) })}
									/>
								)}
								{!isSearching && currentSubfolders.length > 0 && (
									<FolderGrid
										folders={currentSubfolders}
										onOpen={(folder) => showView({ kind: "folder", id: folder.key })}
										onPlay={(folder) => playTracks(folderTracks(files, folder.key), { kind: "folder", id: folder.key })}
										playingKey={playingIn("folder")}
										onOpenMenu={(folder, x, y) => setMenu({
											x,
											y,
											entries: groupMenu(
												{ ...folder, tracks: folderTracks(files, folder.key) },
												{ kind: "folder", id: folder.key },
											),
										})}
									/>
								)}
								<TrackList
									key={`${viewKey}:${viewSort.field}:${viewSort.dir}:${listDisplay}`}
									rows={displayRows}
									activePath={activePath}
									looseFromIndex={looseFromIndex}
									sectionOf={!isSearching && listDisplay === "sections" ? rowSection : null}
									hintOf={!isSearching && listDisplay === "inline" ? rowHint : null}
									numberOf={!isSearching && viewSort.field === "default" ? albumNumber : null}
									emptyText={emptyText}
									onPlay={(track) => {
										clearSelection();
										playFrom(viewKey, track, displayFiles);
									}}
									selected={selectedKeys}
									onSelect={selectRow}
									onOpenMenu={(row, x, y) => {
										// A selected row's menu acts on the whole selection; any other row's, on that row.
										if (selectedKeys.has(row.key) && selectedRows.length > 1) {
											setMenu({ x, y, entries: selectionMenu() });
											return;
										}
										clearSelection();
										setMenu({ x, y, entries: trackMenu(row) });
									}}
									onReorder={manualPlaylist && viewSort.field === "default" && !isSearching
										? (itemIds) => playlists.reorder(
											manualPlaylist.id,
											// Shown reversed: store the order back the right way round.
											viewSort.dir === "desc" ? [...itemIds].reverse() : itemIds,
										)
										: undefined}
								/>
							</div>
						</>
					)}
				</main>

				{!isPhone && <aside className={`track-detail-panel ${panelTab === "queue" ? "overlay" : ""}`}>
					<div className="panel-tabs" role="tablist">
						<button
							role="tab"
							aria-selected={panelTab === "track"}
							className={`panel-tab ${panelTab === "track" ? "active" : ""}`}
							onClick={() => setPanelTab("track")}
						>
							{t("panel.track")}
						</button>
						<button
							role="tab"
							aria-selected={panelTab === "queue"}
							className={`panel-tab ${panelTab === "queue" ? "active" : ""}`}
							onClick={() => setPanelTab("queue")}
						>
							{t("queue.next")}
							<span className="panel-tab-count">{Math.max(0, queue.order.length - queue.index - 1)}</span>
						</button>
					</div>
					{panelTab === "queue" ? queuePanel : detailPanel}
				</aside>}
			</div>

			{isPhone ? (
				<>
					{currentTrack && (
						<MiniPlayer
							track={currentTrack}
							isPlaying={isPlaying}
							onTogglePlay={togglePlay}
							onPrev={onPrev}
							onNext={onNext}
							onOpen={() => setNowPlayingOpen(true)}
						/>
					)}
					{currentTrack && nowPlayingOpen && (
						<NowPlaying
							track={currentTrack}
							previous={queue.order.length > 1 ? queue.order[(queue.index - 1 + queue.order.length) % queue.order.length] : null}
							next={queue.order.length > 1 ? queue.order[(queue.index + 1) % queue.order.length] : null}
							stats={trackStats.stats[currentTrack.relPath] ?? null}
							tagsById={tags.byId}
							element={element}
							isPlaying={isPlaying}
							isShuffle={isShuffle}
							repeatMode={repeatMode}
							upcoming={Math.max(0, queue.order.length - queue.index - 1)}
							onClose={() => setNowPlayingOpen(false)}
							onTogglePlay={togglePlay}
							onPrev={onPrev}
							onNext={onNext}
							onSeek={seek}
							onToggleShuffle={toggleShuffle}
							onToggleRepeat={toggleRepeatMode}
							onToggleFavorite={trackStats.toggleFavorite}
							onAddTo={(track) => setAddTo([track])}
							onEditTags={(track) => setTagPicker([track])}
							onOpenTag={(target) => {
								leavePlayer();
								showView({ kind: "tag", id: target.id }, listView);
							}}
							onRemoveTag={(track, target) => trackStats.setTrackTag([track], target.id, false)}
							onSwipePrevious={previousTrack}
							canGoTo={goToEntries(currentTrack, true).length > 0}
							onOpenGoTo={(track, x, y) => setMenu({
								x,
								y,
								// Off the player to the page.
								entries: goToEntries(track, true)
									.filter(entry => entry.kind !== "separator")
									.map(entry => entry.kind === "item" ? {
										...entry,
										onSelect: () => {
											leavePlayer();
											entry.onSelect();
										},
									} : entry),
							})}
							onOpenQueue={() => setPhonePanel("queue")}
							onOpenDetails={() => setPhonePanel("track")}
							canOpenArtist={canOpenArtist}
							onOpenArtist={(name) => {
								leavePlayer();
								openArtist(name);
							}}
						/>
					)}
					{phonePanel && (
						<PhoneSheet
							title={phonePanel === "queue" ? t("player.queue") : t("panel.track")}
							onBack={() => setPhonePanel(null)}
						>
							{phonePanel === "queue" ? queuePanel : detailPanel}
						</PhoneSheet>
					)}
				</>
			) : (
				<PlayerBar
					currentTrack={currentTrack ?? null}
					canOpenArtist={canOpenArtist}
					onOpenArtist={openArtist}
					isPlaying={isPlaying}
					volume={volume}
					onTogglePlay={togglePlay}
					onVolumeChange={setVolume}
					onPrev={onPrev}
					onNext={onNext}
					element={element}
					onSeek={seek}
					isShuffle={isShuffle}
					repeatMode={repeatMode}
					onToggleShuffle={toggleShuffle}
					queueOpen={panelTab === "queue"}
					onToggleQueue={() => setPanelTab(panelTab === "queue" ? "track" : "queue")}
					onToggleRepeat={toggleRepeatMode}
				/>
			)}

			{menu && (
				<ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={closeMenu} />
			)}

			{updateDialogOpen && (
				<UpdateDialog
					// The installer ends the app right away: keep where playback was.
					onBeforeInstall={() => {
						element.pause();
						if (activePath) savePosition(activePath, element.currentTime);
					}}
				/>
			)}

			{editing && (
				<MetadataEditor
					tracks={editing}
					onSave={(edit) => saveMetadata(editing, edit)}
					onClose={() => setEditing(null)}
				/>
			)}

			{addTo && (
				<AddToDialog
					tracks={addTo}
					playlists={playlists.playlists.filter(p => p.type === "manual" && !p.readOnly)}
					tracksByPath={tracksByPath}
					allFavorite={addTo.every(t => trackStats.stats[t.relPath]?.favorite)}
					onPlayNext={() => {
						// With nothing playing this starts playback, not from any view.
						if (!activePath) setPlayingFrom(null);
						playNext(addTo);
						setAddTo(null);
						notifyInfo(t("notice.playingNext"));
					}}
					onAddToQueue={() => {
						// With nothing playing this starts playback, not from any view.
						if (!activePath) setPlayingFrom(null);
						addToQueue(addTo);
						setAddTo(null);
						notifyInfo(t("notice.addedToQueue"));
					}}
					onAddToFavorites={() => {
						trackStats.setFavorite(addTo, true);
						setAddTo(null);
						notifyInfo(t("notice.addedToFavorites"));
					}}
					onAddToPlaylist={(target) => {
						setAddTo(null);
						addToPlaylist(target, addTo);
					}}
					onCreatePlaylist={(name) => {
						setAddTo(null);
						createPlaylistWith(name, addTo);
					}}
					onClose={() => setAddTo(null)}
				/>
			)}

			{editor && (
				<SmartPlaylistEditor
					title={editor.playlist ? t("smart.editTitle") : t("smart.newTitle")}
					initialName={editor.playlist?.name ?? t("smart.defaultName")}
					initialRules={editor.playlist?.rules}
					tags={tags.tags}
					categories={tags.categories}
					onSave={saveSmartPlaylist}
					onClose={() => setEditor(null)}
				/>
			)}

			{tagPicker && (
				<TagPicker
					tracks={tagPicker}
					tags={tags.tags}
					categories={tags.categories}
					counts={tagCounts}
					isPinned={(target) => pins.isPinned("tag", target.id)}
					stats={trackStats.stats}
					onToggle={(tag, assigned) => trackStats.setTrackTag(tagPicker, tag.id, assigned)}
					onCreate={(name, categoryIds) => setTagDialog({ tag: null, name, categoryIds, assignTo: tagPicker })}
					// Escape closes the tag dialog over it, not the picker as well.
					onClose={() => {
						if (!tagDialog) setTagPicker(null);
					}}
				/>
			)}

			{tagDialog && (
				<TagDialog
					tag={tagDialog.tag}
					initialColor={nextTagColor(tags.tags)}
					initialCategoryIds={tagDialog.categoryIds}
					initialName={tagDialog.name}
					tags={tags.tags}
					categories={tags.categories}
					onSave={saveTag}
					onCreateCategory={tags.createCategory}
					onClose={() => setTagDialog(null)}
				/>
			)}

			{mergeTag && (
				<MergeTagDialog
					tag={mergeTag}
					tags={tags.tags}
					counts={tagCounts}
					onPick={(into) => mergeTags(mergeTag, into)}
					onClose={() => setMergeTag(null)}
				/>
			)}

			{categoryDialog && (
				<CategoryDialog
					category={categoryDialog.category}
					categories={tags.categories}
					onSave={saveCategory}
					onClose={() => setCategoryDialog(null)}
				/>
			)}


			<Notices />
		</>
	);
}

export default App;