import { useEffect, useMemo, useRef, useState, type MutableRefObject, type UIEvent } from "react";
import type { Playlist, Track, View } from "../types";
import type { ListRow } from "../types";
import { useViewRows } from "./useViewRows";
import { useSmartPlaylistPaths } from "./useSmartPlaylistPaths";
import { sortScopeOf, useViewSorts } from "./useViewSorts";
import { useTrackListLogic } from "./useTrackListLogic";
import { useSearchScroll } from "./useSearchScroll";
import { useBackLayer } from "./useBackLayer";
import {
	compareBy, hintOf, sectionOf, sortSpecOf, viewSortOf, DEFAULT_SORT, type ListDisplay, type SortSection, type ViewSort,
} from "../utils/sort";
import { folderOf } from "../utils/groups";
import type { TrackGroup } from "../utils/groups";
import { formatDateTime } from "../utils/format";
import { t, useI18n } from "../i18n";
import { EMPTY_TEXT, defaultSortLabel, countTracks, viewKeyOf } from "../app/views";
import { UNTAGGED_KEY } from "../utils/views";
import { formatTotalDuration } from "../utils/format";
import { CARD_PAGES, NO_SELECTION, type Selection } from "../app/types";
import type { usePlaylists } from "./usePlaylists";
import type { useTrackStats } from "./useTrackStats";
import { pastedImage } from "../utils/image";
import { notifyError } from "../utils/notify";
import type { useGroupCovers } from "./useGroupCovers";

export type LibraryListState = {
	naturalRows: ListRow[];
	missingCount: number;
	playlist: Playlist | null;
	smartPaths: ReturnType<typeof useSmartPlaylistPaths>;
	viewSorts: ReturnType<typeof useViewSorts>;
	sortScope: ReturnType<typeof sortScopeOf>;
	listDisplay: ListDisplay;
	defaultLabel: string | null;
	viewSort: ViewSort;
	viewRows: ListRow[];
	rowSection: ((track: Track) => SortSection) | null;
	rowHint: ((track: Track) => string | null) | null;
	albumNumber: ((track: Track) => string) | null;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	scriptMask: number;
	setScriptMask: (mask: number) => void;
	toggleScript: (bit: number) => void;
	clearSearch: () => void;
	availableScripts: number;
	displayRows: ListRow[];
	displayFiles: Track[];
	looseFromIndex: number;
	isSearching: boolean;
	isFiltering: boolean;
	handleShuffleAll: () => void;
	listRef: ReturnType<typeof useSearchScroll>["ref"];
	onListScroll: (e: UIEvent) => void;
	selection: Selection;
	selectedKeys: Set<string>;
	selectedRows: ListRow[];
	selectedTracks: Track[];
	clearSelection: () => void;
	selectAll: () => void;
	selectRow: (row: ListRow, index: number, how: { range: boolean; additive: boolean }) => void;
	selectSpan: (base: Set<string>, from: number, to: number) => void;
	editablePlaylist: Playlist | null;
	manualPlaylist: Playlist | null;
	handleSortChange: (sort: ViewSort) => void;
	sortLocked: boolean;
	emptyText: string;
	handlePlayAll: () => void;
	handleShuffleView: () => void;
	viewKey: string;
	viewSummary: string;
	showsTrackList: boolean;
	phoneSelecting: boolean;
};

export function useLibraryListState({
	files,
	trackStats,
	listView,
	currentGroup,
	playlists,
	playTrack,
	setPlayingFrom,
	isPhone,
	selectedRowsLengthRef,
	clearSearchRef,
	listViewForPaste,
	currentGroupForPaste,
	groupCoverStore,
	playlistsStore,
}: {
	files: Track[];
	trackStats: ReturnType<typeof useTrackStats>;
	listView: View;
	currentGroup: TrackGroup | null;
	playlists: ReturnType<typeof usePlaylists>;
	playTrack: (track: Track, tracks: Track[], options?: { shuffle?: boolean }) => void;
	setPlayingFrom: (source: string | null) => void;
	isPhone: boolean;
	selectedRowsLengthRef: MutableRefObject<number>;
	clearSearchRef: MutableRefObject<() => void>;
	listViewForPaste: View;
	currentGroupForPaste: TrackGroup | null;
	groupCoverStore: ReturnType<typeof useGroupCovers>;
	playlistsStore: ReturnType<typeof usePlaylists>;
}): LibraryListState {
	const language = useI18n();
	const smartPaths = useSmartPlaylistPaths(playlists.playlists, trackStats.stats, listView.kind === "playlists");

	const { rows: naturalRows, missingCount, playlist } =
		useViewRows(listView, files, trackStats.stats, playlists.playlists, currentGroup?.tracks ?? null);

	const viewSorts = useViewSorts();
	const sortScope = sortScopeOf(listView, playlist?.type ?? null);
	const listDisplay = viewSorts.displayOf(sortScope ?? "playlist");
	const defaultLabel = defaultSortLabel(listView, playlist);
	const remembered = sortScope ? viewSorts.sorts[sortScope] : viewSortOf(playlist?.sort);
	const viewSort: ViewSort = remembered.field === "default" && !defaultLabel ? DEFAULT_SORT : remembered;
	const viewRows = useMemo(() => {
		if (viewSort.field === "default") return viewSort.dir === "desc" ? [...naturalRows].reverse() : naturalRows;
		const compare = compareBy({ field: viewSort.field, dir: viewSort.dir });
		return [...naturalRows].sort((a, b) => compare(a.track, b.track));
	}, [naturalRows, viewSort.field, viewSort.dir]);

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
		if (historyView === "hidden") {
			return (track: Track) => {
				const st = stats[track.relPath];
				const label = st?.hidden === "everywhere" ? t("hidden.everywhere") : t("hidden.library");
				return label;
			};
		}
		return hintOf(viewSort.field);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- dates are formatted per language
	}, [viewSort.field, historyView, trackStats.stats, language]);

	const albumNumber = useMemo(() => {
		if (listView.kind !== "album" || !currentGroup) return null;
		const multiDisc = new Set(currentGroup.tracks.map(track => track.discNumber ?? 1)).size > 1;
		return (track: Track) => track.trackNumber == null ? ""
			: multiDisc ? `${track.discNumber ?? 1}.${String(track.trackNumber).padStart(2, "0")}`
				: String(track.trackNumber);
	}, [listView.kind, currentGroup]);

	const {
		searchQuery, setSearchQuery,
		scriptMask, setScriptMask, toggleScript, clearSearch, availableScripts,
		displayRows, displayFiles, looseFromIndex, isSearching, isFiltering, handleShuffleAll,
	} = useTrackListLogic(viewRows, playTrack);
	const viewKey = viewKeyOf(listView);
	const { ref: listRef, onScroll: onListScroll } = useSearchScroll(
		isFiltering ? `${searchQuery}\0${scriptMask}` : "",
		viewKey,
	);

	const [selection, setSelection] = useState<Selection>(NO_SELECTION);
	const selectionScope = `${viewKey}|${searchQuery}|${scriptMask}`;
	const selectedKeys = selection.scope === selectionScope ? selection.keys : NO_SELECTION.keys;
	const selectedRows = useMemo(() => displayRows.filter(row => selectedKeys.has(row.key)), [displayRows, selectedKeys]);
	const selectedTracks = useMemo(() => selectedRows.map(row => row.track), [selectedRows]);
	clearSearchRef.current = clearSearch;
	selectedRowsLengthRef.current = selectedRows.length;
	const clearSelection = () => setSelection(NO_SELECTION);
	useBackLayer(selectedRows.length > 0, clearSelection);

	const phoneSelecting = isPhone && selectedRows.length > 0;

	const selectAll = () =>
		setSelection({ scope: selectionScope, keys: new Set(displayRows.map(row => row.key)), anchor: null });

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

	const selectSpan = (base: Set<string>, from: number, to: number) => {
		const keys = new Set(base);
		for (let i = Math.min(from, to); i <= Math.max(from, to); i++) keys.add(displayRows[i].key);
		setSelection({ scope: selectionScope, keys, anchor: displayRows[from]?.key ?? null });
	};

	const editablePlaylist = playlist && !playlist.readOnly ? playlist : null;
	const manualPlaylist = editablePlaylist?.type === "manual" ? editablePlaylist : null;

	const handleSortChange = (sort: ViewSort) => {
		if (sortScope) viewSorts.setSort(sortScope, sort);
		else if (manualPlaylist) playlists.setSort(manualPlaylist.id, sortSpecOf(sort));
	};
	const sortLocked = !sortScope && !manualPlaylist;

	const pasteTarget = listViewForPaste.kind === "album" || listViewForPaste.kind === "artist" ? currentGroupForPaste
		: playlist && !playlist.readOnly ? playlist : null;
	const pasteInto = useRef<((data: string) => void) | null>(null);
	useEffect(() => {
		pasteInto.current = !pasteTarget ? null
			: "type" in pasteTarget ? (data) => playlistsStore.setCover(pasteTarget.id, data)
				: (data) => groupCoverStore.setCover(listViewForPaste.kind === "album" ? "album" : "artist", pasteTarget.key, data);
	});
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const use = pasteInto.current;
			if (!use || document.querySelector(".dialog-backdrop")) return;
			if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return;
			const image = pastedImage(e);
			if (!image) return;
			e.preventDefault();
			image.then(({ data }) => use(data), error => notifyError(t("cover.pasteFailed"), error));
		};
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, []);

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
	// eslint-disable-next-line react-hooks/exhaustive-deps -- matches prior every-render subscription
	});

	const emptyText = t(isFiltering
		? "empty.search"
		: listView.kind === "system"
			? EMPTY_TEXT[listView.id]
			: listView.kind === "tag"
				? listView.id === UNTAGGED_KEY ? "empty.untagged" : "empty.tag"
				: listView.kind === "gap"
					? "empty.gap"
					: currentGroup
						? "empty.group"
						: playlist?.type === "smart"
							? "empty.smart"
							: "empty.playlist");

	const handlePlayAll = () => {
		if (displayFiles.length === 0) return;
		setPlayingFrom(viewKey);
		playTrack(displayFiles[0], displayFiles, { shuffle: false });
	};

	const handleShuffleView = () => {
		if (displayFiles.length > 0) setPlayingFrom(viewKey);
		handleShuffleAll();
	};

	const viewSummary = [
		countTracks(viewRows.length),
		viewRows.length > 0 ? formatTotalDuration(viewRows.reduce((sum, row) => sum + row.track.duration, 0)) : null,
	].filter(Boolean).join(" · ");

	return {
		naturalRows,
		missingCount,
		playlist,
		smartPaths,
		viewSorts,
		sortScope,
		listDisplay,
		defaultLabel,
		viewSort,
		viewRows,
		rowSection,
		rowHint,
		albumNumber,
		searchQuery,
		setSearchQuery,
		scriptMask,
		setScriptMask,
		toggleScript,
		clearSearch,
		availableScripts,
		displayRows,
		displayFiles,
		looseFromIndex,
		isSearching,
		isFiltering,
		handleShuffleAll,
		listRef,
		onListScroll,
		selection,
		selectedKeys,
		selectedRows,
		selectedTracks,
		clearSelection,
		selectAll,
		selectRow,
		selectSpan,
		editablePlaylist,
		manualPlaylist,
		handleSortChange,
		sortLocked,
		emptyText,
		handlePlayAll,
		handleShuffleView,
		viewKey,
		viewSummary,
		showsTrackList,
		phoneSelecting,
	};
}
