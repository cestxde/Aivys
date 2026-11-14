import { androidStorage } from "../utils/androidStorage";
import { incompleteCounts } from "../utils/incomplete";
import { notifyInfo } from "../utils/notify";
import { savePosition } from "../utils/session";
import type { SidebarItemId } from "../utils/sidebarNav";
import { t } from "../i18n";
import type { ListRow, Track, UserTag } from "../types";
import type { LibraryAppShellProps, CardFilter, CardLayout } from "./libraryShellProps";
import type { LibraryGroupCatalog, LibraryViewGroup } from "../hooks/useLibraryCollections";
import type { LibraryListState } from "../hooks/useLibraryListState";
import type { ThemePreference } from "../utils/theme";
import type { PlayerSettings } from "../types";
import type { EditorState, TagDialogState, CategoryDialogState } from "./types";
import type { CoverKind } from "../hooks/useGroupCovers";
import type { MenuEntry } from "../components/ContextMenu/ContextMenu";
import type { M3uMissingGroup } from "../components/M3uImportDialog/M3uMissingDialog";
import type { ReactNode } from "react";
import type { useTags } from "../hooks/useTags";
import type { usePlaylists } from "../hooks/usePlaylists";
import type { usePins } from "../hooks/usePins";
import type { useTrackStats } from "../hooks/useTrackStats";
import type { usePageLayouts } from "../hooks/usePageLayouts";
import type { useSleepTimer } from "../hooks/useSleepTimer";
import type { View } from "../types";

export type LibraryShellPropsFromModelArgs = {
	listView: View;
	settings: PlayerSettings;
	theme: ThemePreference;
	setTheme: (theme: ThemePreference) => void;
	setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
	catalog: LibraryGroupCatalog;
	viewGroup: LibraryViewGroup;
	list: LibraryListState;
	cardFilter: CardFilter | null;
	cardLayout: CardLayout | null;
	hasTrackList: boolean;
	goToPicker: () => void;
	showView: (next: View, from?: View) => void;
	playingKey: string | null;
	drawerOpen: boolean;
	playTracks: (tracks: Track[], source: View) => void;
	playPlaylist: (target: import("../types").Playlist) => void | Promise<void>;
	files: Track[];
	trackStats: ReturnType<typeof useTrackStats>;
	playingIn: (kind: string) => string | null;
	playlists: ReturnType<typeof usePlaylists>;
	tracksByPath: Map<string, Track>;
	layouts: ReturnType<typeof usePageLayouts>["layouts"];
	setLayout: ReturnType<typeof usePageLayouts>["setLayout"];
	playlistsFilter: string;
	setPlaylistsFilter: (filter: string) => void;
	playlistMenu: (target: import("../types").Playlist) => MenuEntry[];
	setMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; entries: MenuEntry[] } | null>>;
	pins: ReturnType<typeof usePins>;
	createPlaylist: () => void | Promise<unknown>;
	openEditor: (playlist: import("../types").Playlist | null) => void;
	m3uDesktop: boolean;
	importM3uPlaylist: () => void | Promise<void>;
	tags: ReturnType<typeof useTags>;
	tagsFilter: string;
	setTagsFilter: (filter: string) => void;
	tracksOfTag: (target: UserTag) => Track[];
	moveTag: ReturnType<typeof import("../hooks/useTagActions").useTagActions>["moveTag"];
	categoryMenu: (target: import("../types").TagCategory) => MenuEntry[];
	setTagDialog: React.Dispatch<React.SetStateAction<TagDialogState | null>>;
	setCategoryDialog: React.Dispatch<React.SetStateAction<CategoryDialogState | null>>;
	artistsFilter: string;
	setArtistsFilter: (filter: string) => void;
	albumsFilter: string;
	setAlbumsFilter: (filter: string) => void;
	currentTag: UserTag | null;
	deleteTag: (target: UserTag) => Promise<void>;
	exportTracksAsM3u: (tracks: Track[], name: string, mode: import("../utils/m3u").M3uPathMode) => Promise<void>;
	goBack: () => void;
	backTo: View | null;
	settingCover: { kind: CoverKind; key: string } | null;
	exportHeaderAction: (tracks: Track[], name: string) => MenuEntry[];
	coverEntries: ReturnType<typeof import("../hooks/useAppMenus").useAppMenus>["coverEntries"];
	pasteCover: ReturnType<typeof import("../hooks/useAppMenus").useAppMenus>["pasteCover"];
	applyCoverToTracks: ReturnType<typeof import("../hooks/useAppMenus").useAppMenus>["applyCoverToTracks"];
	renamingId: string | null;
	setRenamingId: React.Dispatch<React.SetStateAction<string | null>>;
	deletePlaylist: (target: import("../types").Playlist) => Promise<void>;
	playFrom: (source: string, track: Track, tracks: Track[]) => void;
	toggleFavorites: (tracks: Track[]) => void;
	removeRowsFromPlaylist: (rows: ListRow[]) => void;
	deleteSelected: () => Promise<void>;
	groupMenu: (group: import("../utils/groups").TrackGroup, open: View) => MenuEntry[];
	activePath: string | null;
	selectionMenu: () => MenuEntry[];
	trackMenu: (row: ListRow) => MenuEntry[];
	tagMenu: (target: UserTag) => MenuEntry[];
	panelTab: "track" | "queue";
	setPanelTab: React.Dispatch<React.SetStateAction<"track" | "queue">>;
	queuePanel: ReactNode;
	detailPanel: ReactNode;
	currentTrack: Track | undefined;
	isPhone: boolean;
	isPlaying: boolean;
	togglePlay: () => void;
	onPrev: () => void;
	onNext: () => void;
	previousTrack: () => void;
	nowPlayingOpen: boolean;
	setNowPlayingOpen: React.Dispatch<React.SetStateAction<boolean>>;
	phonePanel: "track" | "queue" | null;
	setPhonePanel: React.Dispatch<React.SetStateAction<"track" | "queue" | null>>;
	leavePlayer: () => void;
	queue: { order: Track[]; index: number };
	element: HTMLAudioElement;
	isShuffle: boolean;
	repeatMode: import("../types").RepeatMode;
	seek: (time: number) => void;
	toggleShuffle: () => void;
	toggleRepeatMode: () => void;
	sleep: ReturnType<typeof useSleepTimer>;
	goToEntries: (track: Track, everywhere?: boolean) => MenuEntry[];
	liveClipboardTags: () => string[];
	copyTrackTags: (track: Track) => void;
	pasteTrackTags: (tracks: Track[]) => void;
	addTrackTags: (tracks: Track[]) => void;
	canOpenArtist: (name: string) => boolean;
	openArtist: (name: string) => void;
	openAlbum: (track: Track) => void;
	volume: number;
	setVolume: (volume: number) => void;
	menu: { x: number; y: number; entries: MenuEntry[] } | null;
	closeMenu: () => void;
	updateDialogOpen: boolean;
	changelogOpen: boolean;
	editing: Track[] | null;
	saveMetadata: (tracks: Track[], edit: import("../components/MetadataEditor/MetadataEditor").MetadataEdit) => Promise<void>;
	renameTrack: (track: Track, name: string) => Promise<void>;
	renameManyFromTags: (tracks: Track[]) => Promise<void>;
	fillManyFromNames: (tracks: Track[]) => Promise<void>;
	setEditing: React.Dispatch<React.SetStateAction<Track[] | null>>;
	m3uMissing: M3uMissingGroup[] | null;
	setM3uMissing: React.Dispatch<React.SetStateAction<M3uMissingGroup[] | null>>;
	addTo: Track[] | null;
	setAddTo: React.Dispatch<React.SetStateAction<Track[] | null>>;
	playNext: (tracks: Track[]) => void;
	addToQueue: (tracks: Track[]) => void;
	setPlayingFrom: (source: string | null) => void;
	addToPlaylist: (target: import("../types").Playlist, tracks: Track[]) => void | Promise<void>;
	createPlaylistWith: (name: string, tracks: Track[]) => void | Promise<void>;
	editor: EditorState | null;
	saveSmartPlaylist: (name: string, rules: import("../types").SmartRules) => void | Promise<void>;
	setEditor: React.Dispatch<React.SetStateAction<EditorState | null>>;
	tagPicker: Track[] | null;
	tagDialog: TagDialogState | null;
	setTagPicker: React.Dispatch<React.SetStateAction<Track[] | null>>;
	mergeTag: UserTag | null;
	setMergeTag: React.Dispatch<React.SetStateAction<UserTag | null>>;
	mergeTags: (from: UserTag, into: UserTag) => void | Promise<void>;
	saveTag: (name: string, color: string, categoryIds: string[], implies: string[]) => void | Promise<void>;
	saveCategory: (name: string) => void | Promise<void>;
	categoryDialog: CategoryDialogState | null;
	playAt: (position: number) => void;
	removeFromQueue: (position: number) => void;
	setUpcoming: (tracks: Track[]) => void;
};

export function libraryShellPropsFromModel(a: LibraryShellPropsFromModelArgs): LibraryAppShellProps {
	return {
		listView: a.listView,
		settings: a.settings,
		theme: a.theme,
		setTheme: a.setTheme,
		setDrawerOpen: a.setDrawerOpen,
		viewSummary: a.list.viewSummary,
		isPhone: a.isPhone,
		hasTrackList: a.hasTrackList,
		searchQuery: a.list.searchQuery,
		setSearchQuery: a.list.setSearchQuery,
		scriptMask: a.list.scriptMask,
		availableScripts: a.list.availableScripts,
		toggleScript: a.list.toggleScript,
		setScriptMask: a.list.setScriptMask,
		cardFilter: a.cardFilter,
		cardLayout: a.cardLayout,
		phoneSelecting: a.list.phoneSelecting,
		selectedKeys: a.list.selectedKeys,
		selectedRows: a.list.selectedRows,
		clearSelection: a.list.clearSelection,
		displayRows: a.list.displayRows,
		selectAll: a.list.selectAll,
		goToPicker: a.goToPicker,
		showView: a.showView,
		showFolders: a.catalog.showFolders,
		tabHasContent: (() => {
			const pinnedCount = (id: string) => a.catalog.pinned.find(p => p.id === id)?.count ?? 0;
			const gaps = incompleteCounts(a.files, a.trackStats.stats);
			const content: Partial<Record<SidebarItemId, boolean>> = {
				folders: a.catalog.showFolders,
				favorites: pinnedCount("favorites") > 0,
				mostPlayed: pinnedCount("mostPlayed") > 0,
				recentlyPlayed: pinnedCount("recentlyPlayed") > 0,
				hidden: pinnedCount("hidden") > 0,
				playlists: a.playlists.playlists.length > 0,
				tags: a.tags.tags.length > 0,
				incomplete: Object.values(gaps).some(n => n > 0),
			};
			return content;
		})(),
		playingKey: a.playingKey,
		drawerOpen: a.drawerOpen,
		pinned: a.catalog.pinned,
		playTracks: a.playTracks,
		playPlaylist: a.playPlaylist,
		files: a.files,
		trackStats: a.trackStats,
		playingIn: a.playingIn,
		playlists: a.playlists,
		tracksByPath: a.tracksByPath,
		smartPaths: a.list.smartPaths,
		layouts: a.layouts,
		setLayout: a.setLayout,
		playlistsFilter: a.playlistsFilter,
		setPlaylistsFilter: a.setPlaylistsFilter,
		playlistMenu: a.playlistMenu,
		setMenu: a.setMenu,
		pins: a.pins,
		createPlaylist: a.createPlaylist,
		openEditor: a.openEditor,
		m3uDesktop: a.m3uDesktop,
		importM3uPlaylist: a.importM3uPlaylist,
		tags: a.tags,
		tagCounts: a.catalog.tagCounts,
		tagsFilter: a.tagsFilter,
		setTagsFilter: a.setTagsFilter,
		tracksOfTag: a.tracksOfTag,
		untaggedCount: a.catalog.untaggedCount,
		moveTag: a.moveTag,
		categoryMenu: a.categoryMenu,
		setTagDialog: a.setTagDialog,
		setCategoryDialog: a.setCategoryDialog,
		rescan: a.catalog.rescan,
		clearRecent: a.catalog.clearRecent,
		checkConflicts: a.catalog.checkConflicts,
		artistsByKey: a.catalog.artistsByKey,
		listedArtists: a.catalog.listedArtists,
		artistsFilter: a.artistsFilter,
		setArtistsFilter: a.setArtistsFilter,
		albums: a.catalog.albums,
		albumsFilter: a.albumsFilter,
		setAlbumsFilter: a.setAlbumsFilter,
		currentTag: a.currentTag,
		deleteTag: a.deleteTag,
		exportTracksAsM3u: a.exportTracksAsM3u,
		goBack: a.goBack,
		backTo: a.backTo,
		currentGroup: a.viewGroup.currentGroup,
		currentSubfolders: a.viewGroup.currentSubfolders,
		settingCover: a.settingCover,
		exportHeaderAction: a.exportHeaderAction,
		coverEntries: a.coverEntries,
		pasteCover: a.pasteCover,
		applyCoverToTracks: a.applyCoverToTracks,
		playlist: a.list.playlist,
		missingCount: a.list.missingCount,
		renamingId: a.renamingId,
		setRenamingId: a.setRenamingId,
		deletePlaylist: a.deletePlaylist,
		viewRows: a.list.viewRows,
		manualPlaylist: a.list.manualPlaylist,
		selectedTracks: a.list.selectedTracks,
		playFrom: a.playFrom,
		viewKey: a.list.viewKey,
		toggleFavorites: a.toggleFavorites,
		removeRowsFromPlaylist: a.removeRowsFromPlaylist,
		deleteSelected: a.deleteSelected,
		viewSort: a.list.viewSort,
		defaultLabel: a.list.defaultLabel,
		handleSortChange: a.list.handleSortChange,
		listDisplay: a.list.listDisplay,
		viewSorts: a.list.viewSorts,
		sortScope: a.list.sortScope,
		rowSection: a.list.rowSection,
		isSearching: a.list.isSearching,
		sortLocked: a.list.sortLocked,
		handleShuffleView: a.list.handleShuffleView,
		handlePlayAll: a.list.handlePlayAll,
		listRef: a.list.listRef,
		onListScroll: a.list.onListScroll,
		isFiltering: a.list.isFiltering,
		artistAlbums: a.viewGroup.artistAlbums,
		groupMenu: a.groupMenu,
		displayFiles: a.list.displayFiles,
		activePath: a.activePath,
		looseFromIndex: a.list.looseFromIndex,
		rowHint: a.list.rowHint,
		albumNumber: a.list.albumNumber,
		emptyText: a.list.emptyText,
		selectRow: a.list.selectRow,
		selectSpan: a.list.selectSpan,
		selectionMenu: a.selectionMenu,
		trackMenu: a.trackMenu,
		tagMenu: a.tagMenu,
		panelTab: a.panelTab,
		setPanelTab: a.setPanelTab,
		queuePanel: a.queuePanel,
		detailPanel: a.detailPanel,
		currentTrack: a.currentTrack,
		isPlaying: a.isPlaying,
		togglePlay: a.togglePlay,
		onPrev: a.onPrev,
		onNext: a.onNext,
		previousTrack: a.previousTrack,
		nowPlayingOpen: a.nowPlayingOpen,
		setNowPlayingOpen: a.setNowPlayingOpen,
		phonePanel: a.phonePanel,
		setPhonePanel: a.setPhonePanel,
		leavePlayer: a.leavePlayer,
		queue: a.queue,
		element: a.element,
		isShuffle: a.isShuffle,
		repeatMode: a.repeatMode,
		seek: a.seek,
		toggleShuffle: a.toggleShuffle,
		toggleRepeatMode: a.toggleRepeatMode,
		sleep: a.sleep,
		goToEntries: a.goToEntries,
		liveClipboardTags: a.liveClipboardTags,
		copyTrackTags: a.copyTrackTags,
		pasteTrackTags: a.pasteTrackTags,
		addTrackTags: a.addTrackTags,
		canOpenArtist: a.canOpenArtist,
		openArtist: a.openArtist,
		openAlbum: a.openAlbum,
		volume: a.volume,
		setVolume: a.setVolume,
		menu: a.menu,
		closeMenu: a.closeMenu,
		updateDialogOpen: a.updateDialogOpen,
		changelogOpen: a.changelogOpen,
		savePosition,
		editing: a.editing,
		saveMetadata: a.saveMetadata,
		renameTrack: a.renameTrack,
		renameManyFromTags: a.renameManyFromTags,
		fillManyFromNames: a.fillManyFromNames,
		setEditing: a.setEditing,
		m3uMissing: a.m3uMissing,
		setM3uMissing: a.setM3uMissing,
		addTo: a.addTo,
		setAddTo: a.setAddTo,
		playNext: a.playNext,
		addToQueue: a.addToQueue,
		setPlayingFrom: a.setPlayingFrom,
		addToPlaylist: a.addToPlaylist,
		createPlaylistWith: a.createPlaylistWith,
		editor: a.editor,
		saveSmartPlaylist: a.saveSmartPlaylist,
		setEditor: a.setEditor,
		tagPicker: a.tagPicker,
		tagDialog: a.tagDialog,
		setTagPicker: a.setTagPicker,
		mergeTag: a.mergeTag,
		setMergeTag: a.setMergeTag,
		mergeTags: a.mergeTags,
		saveTag: a.saveTag,
		saveCategory: a.saveCategory,
		categoryDialog: a.categoryDialog,
		playAt: a.playAt,
		removeFromQueue: a.removeFromQueue,
		setUpcoming: a.setUpcoming,
		androidStorage,
		linkedByPath: a.catalog.linkedByPath,
		artists: a.catalog.artists,
		notifyInfo,
		t,
	};
}
