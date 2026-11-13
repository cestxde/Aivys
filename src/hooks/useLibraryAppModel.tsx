import { useState, useEffect, useMemo, useRef } from "react";
import { useAudioPlayer } from "./useAudioPlayer";
import { useIsPhone } from "./useIsPhone";
import { useBackLayer } from "./useBackLayer";
import { androidStorage } from "../utils/androidStorage";
import { usePageLayouts } from "./usePageLayouts";
import { useRememberedState, useStoredState } from "./useRemembered";
import { useTrackStats } from "./useTrackStats";
import { asNativeAudio } from "../utils/nativeAudio";
import { useListenTracking } from "./useListenTracking";
import { usePlayTracking } from "./usePlayTracking";
import { useTaskbar } from "./useTaskbar";
import { useMediaControls } from "./useMediaControls";
import { useShortcutActions } from "./useShortcutActions";
import { usePlaylists } from "./usePlaylists";
import { useTags } from "./useTags";
import { useAppNavigation } from "./useAppNavigation";
import { usePlaylistActions } from "./usePlaylistActions";
import { useTagActions } from "./useTagActions";
import { useMetadataActions } from "./useMetadataActions";
import { usePins } from "./usePins";
import { type CoverKind } from "./useGroupCovers";
import { useSleepTimer } from "./useSleepTimer";
import { useTray } from "./useTray";
import { type MenuEntry } from "../components/ContextMenu/ContextMenu";
import { type M3uMissingGroup } from "../components/M3uImportDialog/M3uMissingDialog";
import { useChangelogOpen, useUpdateDialogOpen } from "../utils/updates";
import type { LibraryAppShellProps } from "../app/libraryShellProps";
import type { PlaylistsLayout } from "../components/PlaylistsPage/PlaylistsPage";
import { useTagClipboard } from "../utils/tagClipboard";
import { t, useI18n } from "../i18n";
import { type ListRow, type Track, type UserTag } from "../types";
import {
	type Screen, VOLUME_STEP, SEEK_STEP,
	type EditorState, type TagDialogState, type CategoryDialogState,
} from "../app/types";
import { useLibraryAppMenus } from "./useLibraryAppMenus";
import type { useLibrary } from "./useLibrary";
import type { ThemePreference } from "../utils/theme";
import type { PlayerSettings } from "../types";
import type { usePlayerSettings } from "./usePlayerSettings";
import { useLibraryGroupCatalog, useLibraryViewGroup } from "./useLibraryCollections";
import { useLibraryListState } from "./useLibraryListState";
import { useLibraryShellPanels } from "./useLibraryShellPanels";
import { composeLibraryShellProps } from "./composeLibraryShellProps";

export type UseLibraryAppModelArgs = {
	library: ReturnType<typeof useLibrary>;
	settings: PlayerSettings;
	updateSettings: ReturnType<typeof usePlayerSettings>["updateSettings"];
	theme: ThemePreference;
	setTheme: (theme: ThemePreference) => void;
	view: Screen;
	goToPicker: () => void;
};

export type UseLibraryAppModelResult = {
	shellProps: LibraryAppShellProps;
	stop: () => void;
	resume: (tracks: Track[]) => void;
	recordMissedPlays: (scanned: Track[]) => void;
};

export function useLibraryAppModel({
	library,
	settings,
	updateSettings,
	theme,
	setTheme,
	view,
	goToPicker,
}: UseLibraryAppModelArgs): UseLibraryAppModelResult {
	const language = useI18n();
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [addTo, setAddTo] = useState<Track[] | null>(null);
	const [m3uMissing, setM3uMissing] = useState<M3uMissingGroup[] | null>(null);
	const [tagDialog, setTagDialog] = useState<TagDialogState | null>(null);
	const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null);
	const [settingCover, setSettingCover] = useState<{ kind: CoverKind; key: string } | null>(null);
	const [mergeTag, setMergeTag] = useState<UserTag | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const isPhone = useIsPhone();
	const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
	const [phonePanel, setPhonePanel] = useState<"track" | "queue" | null>(null);
	useBackLayer(drawerOpen, () => setDrawerOpen(false));
	useBackLayer(isPhone && nowPlayingOpen, () => setNowPlayingOpen(false));
	useBackLayer(isPhone && phonePanel !== null, () => setPhonePanel(null));
	const [tagPicker, setTagPicker] = useState<Track[] | null>(null);
	const [playingFrom, setPlayingFrom] = useStoredState<string | null>("session.from", null, (value): value is string | null => value === null || typeof value === "string");
	const [editing, setEditing] = useState<Track[] | null>(null);
	const [undoablePaths, setUndoablePaths] = useState<string[] | null>(null);
	const [panelTab, setPanelTab] = useState<"track" | "queue">("track");
	const { layouts, setLayout } = usePageLayouts();

	const {
		activePath, playTrack,
		isPlaying, togglePlay, volume, setVolume,
		seek, stop,
		onNext, onPrev, previousTrack, resume, setStopAfterTrack,
		playNext, addToQueue, forgetTracks,
		queue, playAt, removeFromQueue, setUpcoming, replacePath, releaseWhile,
		toggleShuffle, isShuffle,
		repeatMode, toggleRepeatMode,
		element,
	} = useAudioPlayer(library.files, settings, updateSettings);

	const files = library.files;
	const sleep = useSleepTimer(element, volume, setStopAfterTrack);
	const currentTrack = files.find(f => f.path === activePath);

	const tracksByPath = useMemo(() => new Map(files.map(f => [f.relPath, f])), [files]);

	const tags = useTags(files);
	const trackStats = useTrackStats(files, tags.byId);
	const tagClipboard = useTagClipboard();
	usePlayTracking(element, currentTrack ?? null, trackStats.recordPlay, trackStats.recordComplete);
	useListenTracking(element, currentTrack ?? null, trackStats.recordListen);

	const recordMissedPlays = (scanned: Track[]) => {
		const missed = asNativeAudio(element)?.takeMissedEvents() ?? [];
		const byPath = new Map(scanned.map(track => [track.path, track]));
		trackStats.recordMissed(missed.flatMap(({ path, kind, at, seconds }) => {
			const track = byPath.get(path);
			return track ? [{ track, kind, at, seconds }] : [];
		}));
	};
	useTaskbar(isPlaying, !!activePath, language, { previous: onPrev, toggle: togglePlay, next: onNext });
	useTray(androidStorage === null, language);
	useMediaControls(element, currentTrack ?? null, isPlaying, {
		play: () => !isPlaying && togglePlay(),
		pause: () => isPlaying && togglePlay(),
		next: onNext,
		previous: onPrev,
		seek,
	});

	const playlists = usePlaylists(files);
	const pins = usePins(files);

	const catalog = useLibraryGroupCatalog({ files, trackStats, settings, library, updateSettings });

	const clearSearchRef = useRef(() => {});
	const selectedRowsLengthRef = useRef(0);
	const {
		listView,
		backTo,
		showView,
		goBack,
		goForward,
		leavePlayer,
		canOpenArtist,
		openArtist,
		openAlbum,
		inLibrary,
	} = useAppNavigation({
		playlists,
		tagsById: tags.byId,
		artistsByKey: catalog.artistsByKey,
		albumsByKey: catalog.albumsByKey,
		files,
		clearSearchRef,
		setRenamingId,
		isPhone,
		nowPlayingOpen,
		setNowPlayingOpen,
		setPhonePanel,
		view,
		selectedRowsLengthRef,
	});

	const viewGroup = useLibraryViewGroup({
		listView,
		files,
		settings,
		artistsByKey: catalog.artistsByKey,
		albumsByKey: catalog.albumsByKey,
	});

	const currentTag = listView.kind === "tag" ? tags.byId.get(listView.id) ?? null : null;

	const list = useLibraryListState({
		files,
		trackStats,
		listView,
		currentGroup: viewGroup.currentGroup,
		playlists,
		playTrack,
		setPlayingFrom,
		isPhone,
		selectedRowsLengthRef,
		clearSearchRef,
		listViewForPaste: listView,
		currentGroupForPaste: viewGroup.currentGroup,
		groupCoverStore: catalog.groupCoverStore,
		playlistsStore: playlists,
	});

	const bottomBar = isPhone && (!!currentTrack || list.phoneSelecting);
	useEffect(() => {
		document.getElementById("root")?.classList.toggle("has-mini-player", bottomBar);
	}, [bottomBar]);

	const updateDialogOpen = useUpdateDialogOpen();
	const changelogOpen = useChangelogOpen();

	const {
		createPlaylist,
		importM3uPlaylist,
		addToPlaylist,
		createPlaylistWith,
		openEditor,
		saveSmartPlaylist,
		deletePlaylist,
		tracksOf,
		playFrom,
		playTracks,
		playPlaylist,
		exportTracksAsM3u,
	} = usePlaylistActions({
		files,
		settingsLastPath: settings.lastPath,
		tracksByPath,
		playlists,
		showView,
		setRenamingId,
		setM3uMissing,
		setEditor,
		editor,
		setPlayingFrom,
		playTrack,
	});

	const m3uDesktop = androidStorage === null;

	const {
		liveClipboardTags,
		copyTrackTags,
		pasteTrackTags,
		addTrackTags,
		saveTag,
		saveCategory,
		toggleTagCategory,
		moveTag,
		tracksOfCategory,
		deleteCategory,
		moveCategory,
		deleteTag,
		mergeTags,
		tracksOfTag,
	} = useTagActions({
		files,
		trackStats,
		tags,
		tagCounts: catalog.tagCounts,
		tagClipboard,
		tagDialog,
		categoryDialog,
		setTagDialog,
		setCategoryDialog,
		setMergeTag,
		pins,
		playlists,
	});

	const {
		saveMetadata,
		renameTrack,
		renameManyFromTags,
		fillManyFromNames,
		undoEdit,
		deleteTracks,
	} = useMetadataActions({
		library,
		forgetTracks,
		releaseWhile,
		replacePath,
		setEditing,
		setUndoablePaths,
	});

	useShortcutActions({
		back: () => inLibrary && goBack(),
		forward: () => inLibrary && goForward(),
		playPause: () => activePath && togglePlay(),
		previous: () => activePath && onPrev(),
		next: () => activePath && onNext(),
		volumeUp: () => setVolume(Math.min(1, volume + VOLUME_STEP)),
		volumeDown: () => setVolume(Math.max(0, volume - VOLUME_STEP)),
		seekBackward: () => activePath && seek(Math.max(0, element.currentTime - SEEK_STEP)),
		seekForward: () => {
			const length = element.duration;
			if (activePath && Number.isFinite(length)) seek(Math.min(length, element.currentTime + SEEK_STEP));
		},
		undoEdit: () => {
			if (undoablePaths) undoEdit(undoablePaths);
		},
	});

	const toggleFavorites = (tracks: Track[]) =>
		trackStats.setFavorite(tracks, !tracks.every(track => trackStats.stats[track.relPath]?.favorite));

	const removeRowsFromPlaylist = (rows: ListRow[]) => {
		if (list.manualPlaylist) playlists.removeItems(list.manualPlaylist.id, rows.flatMap(row => row.itemId ?? []));
	};

	const deleteSelected = async () => {
		await deleteTracks(list.selectedTracks);
		list.clearSelection();
	};

	const {
		closeMenu,
		goToEntries,
		trackMenu,
		selectionMenu,
		queueMenu,
		playlistMenu,
		groupMenu,
		categoryMenu,
		tagChipMenu,
		tagMenu,
		exportHeaderAction,
		coverEntries,
		pasteCover,
		applyCoverToTracks,
	} = useLibraryAppMenus({
		listView,
		list,
		catalog,
		trackStats,
		files,
		tags,
		currentTag,
		pins,
		playlists,
		m3uDesktop,
		showView,
		openArtist,
		openAlbum,
		playFrom,
		playTracks,
		playAt,
		removeFromQueue,
		playPlaylist,
		tracksOf,
		exportTracksAsM3u,
		deletePlaylist,
		deleteTracks,
		deleteTag,
		deleteCategory,
		moveCategory,
		toggleTagCategory,
		tracksOfCategory,
		saveMetadata,
		settingsLastPath: settings.lastPath,
		setMenu,
		setTagPicker,
		setAddTo,
		setEditing,
		setTagDialog,
		setCategoryDialog,
		setMergeTag,
		setSettingCover,
		copyTrackTags,
		pasteTrackTags,
		addTrackTags,
		liveClipboardTags,
		toggleFavorites,
		removeRowsFromPlaylist,
		deleteSelected,
	});

	const playingKey = activePath ? playingFrom : null;
	const playingIn = (kind: string): string | null =>
		playingKey?.startsWith(`${kind}:`) ? playingKey.slice(kind.length + 1) : null;

	const [playlistsFilter, setPlaylistsFilter] = useRememberedState("playlists.filter", "");
	const [tagsFilter, setTagsFilter] = useRememberedState("tags.filter", "");
	const [artistsFilter, setArtistsFilter] = useRememberedState("artists.filter", "");
	const [albumsFilter, setAlbumsFilter] = useRememberedState("albums.filter", "");

	const cardPage = listView.kind === "playlists" || listView.kind === "tags"
		|| listView.kind === "artists" || listView.kind === "albums" ? listView.kind : null;
	const hasTrackList = !cardPage && listView.kind !== "settings" && listView.kind !== "stats" && listView.kind !== "incomplete";
	const cardLayout = cardPage
		? { value: layouts[cardPage], onChange: (layout: PlaylistsLayout) => setLayout(cardPage, layout) }
		: null;
	const cardFilter = cardPage === "playlists" ? { query: playlistsFilter, placeholder: t("playlists.filter"), onChange: setPlaylistsFilter }
		: cardPage === "tags" ? { query: tagsFilter, placeholder: t("tags.filter"), onChange: setTagsFilter }
			: cardPage === "artists" ? { query: artistsFilter, placeholder: t("collection.filterArtists"), onChange: setArtistsFilter }
				: cardPage === "albums" ? { query: albumsFilter, placeholder: t("collection.filterAlbums"), onChange: setAlbumsFilter }
					: null;

	const { queuePanel, detailPanel } = useLibraryShellPanels({
		queue,
		playAt,
		queueMenu,
		setUpcoming,
		setMenu,
		currentTrack,
		trackStats,
		tagsById: tags.byId,
		copyTrackTags,
		pasteTrackTags,
		addTrackTags,
		liveClipboardTags,
		setEditing,
		setAddTo,
		setTagPicker,
		leavePlayer,
		showView,
		listView,
		tagChipMenu,
		canOpenArtist,
		openArtist,
		albumsByKey: catalog.albumsByKey,
		openAlbum,
	});

	const shellProps = composeLibraryShellProps({
		core: {
			listView, settings, theme, setTheme, setDrawerOpen, catalog, viewGroup, list,
			cardFilter, cardLayout, hasTrackList, goToPicker, showView, playingKey, drawerOpen,
			files, trackStats, playlists, tracksByPath, layouts, setLayout,
			playlistsFilter, setPlaylistsFilter, tagsFilter, setTagsFilter,
			artistsFilter, setArtistsFilter, albumsFilter, setAlbumsFilter,
			currentTag, renamingId, setRenamingId, settingCover, isPhone, activePath,
		},
		playlists: {
			playTracks, playPlaylist, playingIn, playlistMenu, pins, createPlaylist, openEditor,
			m3uDesktop, importM3uPlaylist, tags, tracksOfTag, moveTag, categoryMenu,
			setTagDialog, setCategoryDialog, deleteTag, exportTracksAsM3u, goBack, backTo,
			exportHeaderAction, coverEntries, pasteCover, applyCoverToTracks, deletePlaylist,
			playFrom, addToPlaylist, createPlaylistWith, saveSmartPlaylist,
		},
		listUi: {
			toggleFavorites, removeRowsFromPlaylist, deleteSelected, groupMenu,
			selectionMenu, trackMenu, tagMenu, panelTab, setPanelTab,
		},
		player: {
			queuePanel, detailPanel, currentTrack, isPlaying, togglePlay, onPrev, onNext,
			previousTrack, nowPlayingOpen, setNowPlayingOpen, phonePanel, setPhonePanel,
			leavePlayer, queue, element, isShuffle, repeatMode, seek, toggleShuffle,
			toggleRepeatMode, sleep, goToEntries, liveClipboardTags, copyTrackTags,
			pasteTrackTags, addTrackTags, canOpenArtist, openArtist, openAlbum, volume,
			setVolume, playAt, removeFromQueue, setUpcoming, playNext, addToQueue, setPlayingFrom,
		},
		chrome: {
			setMenu, menu, closeMenu, updateDialogOpen, changelogOpen,
			editing, saveMetadata, renameTrack, renameManyFromTags, fillManyFromNames, setEditing,
			m3uMissing, setM3uMissing, addTo, setAddTo, editor, setEditor,
			tagPicker, tagDialog, setTagPicker, mergeTag, setMergeTag, mergeTags,
			saveTag, saveCategory, categoryDialog,
		},
	});

	return {
		shellProps,
		stop,
		resume,
		recordMissedPlays,
	};
}
