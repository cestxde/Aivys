import "./App.css";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import {
	Heart, ListPlus, ListX, Play, Trash2, FolderOpen, Tag, Pencil, X, History, TrendingUp, MicVocal, Disc3, Folder,
} from "lucide-react";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useLibrary } from "./hooks/useLibrary";
import { usePlayerSettings } from "./hooks/usePlayerSettings";
import { TrackList } from "./components/TrackList/TrackList";
import { PlayerBar } from "./components/PlayerBar/PlayerBar";
import { Toolbar } from "./components/ToolBar/ToolBar";
import { LibraryPicker } from "./components/LibraryPicker/LibraryPicker";
import { ThemedLogo } from "./components/ThemedLogo";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { TrackDetailPanel } from "./components/TrackDetailPanel/TrackDetailPanel";
import { Notices } from "./components/Notices/Notices";
import { useTrackListLogic } from "./hooks/useTrackListLogic";
import { useSearchScroll } from "./hooks/useSearchScroll";
import { usePageLayouts } from "./hooks/usePageLayouts";
import { useTheme } from "./hooks/useTheme";
import { sortScopeOf, useViewSorts } from "./hooks/useViewSorts";
import { useTrackStats } from "./hooks/useTrackStats";
import { usePlayTracking } from "./hooks/usePlayTracking";
import { usePlaylists } from "./hooks/usePlaylists";
import { useTags } from "./hooks/useTags";
import { useViewRows } from "./hooks/useViewRows";
import { useSmartPlaylistPaths } from "./hooks/useSmartPlaylistPaths";
import { PlaylistHeader } from "./components/PlaylistHeader/PlaylistHeader";
import { ContextMenu, type MenuEntry } from "./components/ContextMenu/ContextMenu";
import { SmartPlaylistEditor } from "./components/SmartPlaylistEditor/SmartPlaylistEditor";
import { PlaylistsPage, type PinnedPlaylist } from "./components/PlaylistsPage/PlaylistsPage";
import { CollectionPage } from "./components/CollectionPage/CollectionPage";
import { FolderGrid, GroupHeader, type Crumb } from "./components/GroupHeader/GroupHeader";
import { AddToDialog } from "./components/AddToDialog/AddToDialog";
import { TagsPage } from "./components/TagsPage/TagsPage";
import { TagHeader } from "./components/TagHeader/TagHeader";
import { TagDialog } from "./components/TagDialog/TagDialog";
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
import { notifyError, notifyInfo } from "./utils/notify";
import { displayTitle } from "./utils/track";
import { t, useI18n, type MessageKey } from "./i18n";
import {
	addRecentPath, removeRecentPath,
	type ConflictReport, type ListRow, type Playlist, type SmartRules, type SystemView, type Track, type UserTag, type View,
} from "./types";

const EMPTY_TEXT: Record<SystemView, MessageKey> = {
	library: "empty.library",
	favorites: "empty.favorites",
	recentlyPlayed: "empty.history",
	mostPlayed: "empty.history",
};

const LIBRARY_VIEW: View = { kind: "system", id: "library" };
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

/** A view as a short key, e.g. "album:<key>" or "playlists". */
const viewKeyOf = (view: View): string => ("id" in view ? `${view.kind}:${view.id}` : view.kind);

type Screen = "loading" | "picker" | "library";

/** The smart-playlist editor: creating a new one, or editing `playlist`. */
interface EditorState {
	playlist: Playlist | null;
}

/** The tag dialog: creating a new tag, or editing `tag`. */
interface TagDialogState {
	tag: UserTag | null;
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
	// Tracks the tag picker is open for.
	const [tagPicker, setTagPicker] = useState<Track[] | null>(null);
	// The view playback was started from (a view key), highlighted on its card.
	const [playingFrom, setPlayingFrom] = useState<string | null>(null);
	const { layouts, setLayout } = usePageLayouts();

	const {
		activePath, playTrack,
		isPlaying, togglePlay, volume, setVolume,
		currentTime, duration, seek, stop,
		onNext, onPrev,
		playNext, addToQueue, forgetTracks,
		toggleShuffle, isShuffle,
		repeatMode, toggleRepeatMode,
		element
	} = useAudioPlayer(library.files, settings, updateSettings);

	const files = library.files;
	const currentTrack = files.find(f => f.path === activePath);
	const tracksByPath = useMemo(() => new Map(files.map(f => [f.relPath, f])), [files]);

	const trackStats = useTrackStats(files);
	usePlayTracking(element, currentTrack ?? null, trackStats.recordPlay, trackStats.recordComplete);

	const playlists = usePlaylists(files);
	const tags = useTags(files);

	// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	const artists = useMemo(() => groupArtists(files), [files, language]);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	const albums = useMemo(() => groupAlbums(files), [files, language]);
	const artistsByKey = useMemo(() => new Map(artists.map(g => [g.key, g])), [artists]);
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
			};
			default: return null;
		}
	}, [listView, artistsByKey, albumsByKey, files, settings.lastPath]);
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
		if (report.skipped.length > 0) {
			notifyError(t("sync.skipped", { count: report.skipped.length, list: report.skipped.join("; ") }));
		}
		if (report.deviceIdRegenerated) notifyInfo(t("sync.deviceIdRegenerated"));
		if (report.merged.length === 0 && report.skipped.length === 0) {
			notifyInfo(t("sync.none"));
			return;
		}
		if (report.merged.length > 0) {
			notifyInfo(t("sync.merged", { count: report.merged.length }));
			await rescan();
		}
	};

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
					await library.scan(last);
					setView("library");
					return;
				}
				setPickerError(t("picker.lastGone", { path: last }));
			}
			setView("picker");
		})();
		// Run once on mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// The sort of the list on screen: remembered per kind of view, a manual
	// playlist's own in its file.
	const viewSorts = useViewSorts();
	const sortScope = sortScopeOf(listView, playlist?.type ?? null);
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
	// eslint-disable-next-line react-hooks/exhaustive-deps -- dates are formatted per language
	const rowHint = useMemo(() => hintOf(viewSort.field), [viewSort.field, language]);
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
	} = useTrackListLogic(
		viewRows,
		isShuffle,
		toggleShuffle,
		playTrack
	);
	const { ref: listRef, onScroll: onListScroll } = useSearchScroll(searchQuery, viewKey);

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

	/** Open `next`; `from` is where going back should return to, if not the usual place. */
	const showView = (next: View, from?: View) => {
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

	// Esc goes back, unless something else uses it: an open menu, dialog or
	// cover viewer closes itself, and a text field keeps its own Esc (except
	// the empty track search, see the toolbar).
	const parent = parentView();
	useEffect(() => {
		if (!parent) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (document.querySelector(".dialog-backdrop, .context-menu, .cover-viewer-backdrop")) return;
			const target = e.target as HTMLElement | null;
			if (target?.matches("input, textarea, select, [contenteditable]") && !target.matches(".track-search")) return;
			showView(parent);
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

	const saveTag = async (name: string, color: string) => {
		const edited = tagDialog?.tag;
		setTagDialog(null);
		if (!edited) {
			await tags.create(name, color);
			return;
		}
		const change: { name?: string; color?: string } = {};
		if (name !== edited.name) change.name = name;
		if (color !== edited.color) change.color = color;
		if (change.name !== undefined || change.color !== undefined) await tags.update(edited.id, change);
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

	/** Create a tag from the picker and assign it to the picked tracks. */
	const createTagFor = async (name: string, tracks: Track[]) => {
		const created = await tags.create(name, nextTagColor(tags.tags));
		if (created) trackStats.setTrackTag(tracks, created.id, true);
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

	const goBack = () => {
		const parent = parentView();
		if (parent) showView(parent);
	};

	/** Open an artist's page from a link; back returns here. */
	const canOpenArtist = (name: string) => artistsByKey.has(artistKey(name));
	const openArtist = (name: string) => {
		if (canOpenArtist(name)) showView({ kind: "artist", id: artistKey(name) }, listView);
	};
	const openAlbum = (track: Track) => {
		const key = albumKeyOf(track);
		if (key && albumsByKey.has(key)) showView({ kind: "album", id: key }, listView);
	};

	/** "Go to" entries of a track: its artists, album and folder, except the page open now. */
	const goToEntries = (track: Track): MenuEntry[] => {
		const here = (kind: View["kind"], id: string) => listView.kind === kind && "id" in listView && listView.id === id;
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
		return entries.length > 0 ? [{ kind: "label", label: t("menu.goTo") }, ...entries, { kind: "separator" }] : [];
	};

	const trackMenu = (row: ListRow): MenuEntry[] => {
		const favorite = trackStats.stats[row.track.relPath]?.favorite ?? false;
		const entries: MenuEntry[] = [
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playFrom(viewKey, row.track, displayFiles) },
			{ kind: "separator" },
			{
				kind: "item",
				label: favorite ? t("common.removeFromFavorites") : t("common.addToFavorites"),
				icon: <Heart size={16} fill={favorite ? "currentColor" : "none"} />,
				onSelect: () => trackStats.toggleFavorite(row.track),
			},
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo([row.track]) },
			{ kind: "item", label: t("common.tags"), icon: <Tag size={16} />, onSelect: () => setTagPicker([row.track]) },
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
	const groupMenu = (group: TrackGroup, open: View): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView(open) },
		{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playTracks(group.tracks, open) },
		{ kind: "separator" },
		{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo(group.tracks) },
		{ kind: "item", label: t("common.tags"), icon: <Tag size={16} />, onSelect: () => setTagPicker(group.tracks) },
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
		{ kind: "separator" },
		{ kind: "item", label: t("common.edit"), icon: <Pencil size={16} />, onSelect: () => setTagDialog({ tag: target }) },
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

	const handlePlayAll = () => {
		if (displayFiles.length > 0) {
			if (isShuffle) toggleShuffle(displayFiles);
			playFrom(viewKey, displayFiles[0], displayFiles);
		}
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

	return (
		<>
			<div className="app-layout">
				<Sidebar
					libraryPath={settings.lastPath}
					onChangeLibrary={goToPicker}
					view={listView}
					onViewChange={showView}
					showFolders={showFolders}
					playingKey={playingKey}
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
							onCreate={createPlaylist}
							onCreateSmart={() => openEditor(null)}
						/>
					) : listView.kind === "tags" ? (
						<TagsPage
							tags={tags.tags}
							counts={tagCounts}
							onOpen={(target) => showView({ kind: "tag", id: target.id })}
							onPlay={(target) => playTracks(tracksOfTag(target), { kind: "tag", id: target.id })}
							playingId={playingIn("tag")}
							onOpenMenu={(target, x, y) => setMenu({ x, y, entries: tagMenu(target) })}
							onCreate={() => setTagDialog({ tag: null })}
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
							title={t("nav.artists")}
							groups={artists}
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
						/>
					) : listView.kind === "albums" ? (
						<CollectionPage
							memoryKey="albums"
							title={t("nav.albums")}
							groups={albums}
							icon={Disc3}
							describe={(group) => [group.subtitle ?? t("common.unknownArtist"), group.year].filter(Boolean).join(" · ")}
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
								/>
							)}
							{currentGroup && listView.kind === "album" && (
								<GroupHeader
									kind={t("group.album")}
									icon={Disc3}
									title={currentGroup.name}
									details={[currentGroup.subtitle, currentGroup.year != null ? String(currentGroup.year) : null]}
									covers={groupCovers(currentGroup, 1)}
									rows={viewRows}
									backTitle={t("group.allAlbums")}
									onBack={goBack}
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
									onSetCover={(path) => playlists.setCover(playlist.id, path)}
									onClearCover={() => playlists.clearCover(playlist.id)}
								/>
							)}

							<Toolbar
								searchQuery={searchQuery}
								onSearchChange={setSearchQuery}
								sort={viewSort}
								defaultLabel={defaultLabel}
								onSortChange={handleSortChange}
								display={viewSorts.display}
								onDisplayChange={viewSorts.setDisplay}
								canGroup={rowSection !== null}
								sortDisabled={isSearching || sortLocked}
								onShuffleAll={handleShuffleView}
								onPlayAll={handlePlayAll}
							/>

							<div className="track-list-wrapper" ref={listRef} onScroll={onListScroll}>
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
									key={`${viewKey}:${viewSort.field}:${viewSort.dir}:${viewSorts.display}`}
									rows={displayRows}
									activePath={activePath}
									looseFromIndex={looseFromIndex}
									sectionOf={!isSearching && viewSorts.display === "sections" ? rowSection : null}
									hintOf={!isSearching && viewSorts.display === "inline" ? rowHint : null}
									numberOf={!isSearching && viewSort.field === "default" ? albumNumber : null}
									emptyText={emptyText}
									onPlay={(track) => playFrom(viewKey, track, displayFiles)}
									onOpenMenu={(row, x, y) => setMenu({ x, y, entries: trackMenu(row) })}
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

				<TrackDetailPanel
					track={currentTrack ?? null}
					stats={currentTrack ? trackStats.stats[currentTrack.relPath] ?? null : null}
					onToggleFavorite={trackStats.toggleFavorite}
					onSetRating={trackStats.setRating}
					tagsById={tags.byId}
					onEditTags={(track) => setTagPicker([track])}
					onOpenTag={(target) => showView({ kind: "tag", id: target.id }, listView)}
					canOpenArtist={canOpenArtist}
					onOpenArtist={openArtist}
					canOpenAlbum={(track) => { const key = albumKeyOf(track); return !!key && albumsByKey.has(key); }}
					onOpenAlbum={openAlbum}
				/>
			</div>

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
				currentTime={currentTime}
				duration={duration}
				onSeek={seek}
				isShuffle={isShuffle}
				repeatMode={repeatMode}
				onToggleShuffle={() => toggleShuffle(displayFiles)}
				onToggleRepeat={toggleRepeatMode}
			/>

			{menu && (
				<ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={closeMenu} />
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
					onSave={saveSmartPlaylist}
					onClose={() => setEditor(null)}
				/>
			)}

			{tagDialog && (
				<TagDialog
					tag={tagDialog.tag}
					initialColor={nextTagColor(tags.tags)}
					tags={tags.tags}
					onSave={saveTag}
					onClose={() => setTagDialog(null)}
				/>
			)}

			{tagPicker && (
				<TagPicker
					tracks={tagPicker}
					tags={tags.tags}
					stats={trackStats.stats}
					onToggle={(tag, assigned) => trackStats.setTrackTag(tagPicker, tag.id, assigned)}
					onCreate={(name) => createTagFor(name, tagPicker)}
					onClose={() => setTagPicker(null)}
				/>
			)}

			<Notices />
		</>
	);
}

export default App;