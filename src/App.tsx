import "./App.css";
import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Heart, ListPlus, Play, Trash2, FolderOpen } from "lucide-react";
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
import { useTrackStats } from "./hooks/useTrackStats";
import { usePlayTracking } from "./hooks/usePlayTracking";
import { usePlaylists } from "./hooks/usePlaylists";
import { useViewRows } from "./hooks/useViewRows";
import { PlaylistHeader } from "./components/PlaylistHeader/PlaylistHeader";
import { ContextMenu, type MenuEntry } from "./components/ContextMenu/ContextMenu";
import { SmartPlaylistEditor, type TagOption } from "./components/SmartPlaylistEditor/SmartPlaylistEditor";
import { PlaylistsPage, type PlaylistsLayout } from "./components/PlaylistsPage/PlaylistsPage";
import { AddToDialog } from "./components/AddToDialog/AddToDialog";
import { sortSpecOf } from "./utils/views";
import { notifyInfo } from "./utils/notify";
import {
	addRecentPath, removeRecentPath,
	type ListRow, type Playlist, type SmartRules, type SortOrder, type SystemView, type Track, type View,
} from "./types";

const EMPTY_TEXT: Record<SystemView, string> = {
	library: "No tracks found. Scan a directory to start.",
	favorites: "No favorites yet. Use the heart next to a track to add it.",
	recentlyPlayed: "Nothing played yet.",
	mostPlayed: "Nothing played yet.",
};

const LIBRARY_VIEW: View = { kind: "system", id: "library" };
const PLAYLISTS_VIEW: View = { kind: "playlists" };

// Device-local view preference; a failing storage just means no memory.
const LAYOUT_KEY = "aivys.playlistsLayout";
const loadLayout = (): PlaylistsLayout => {
	try {
		return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
	} catch {
		return "grid";
	}
};

type Screen = "loading" | "picker" | "library";

/** The smart-playlist editor: creating a new one, or editing `playlist`. */
interface EditorState {
	playlist: Playlist | null;
	tags: TagOption[];
}

function App() {
	const { settings, updateSettings } = usePlayerSettings();
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
	const [playlistsLayout, setPlaylistsLayout] = useState<PlaylistsLayout>(loadLayout);

	const {
		activePath, playTrack,
		isPlaying, togglePlay, volume, setVolume,
		currentTime, duration, seek, stop,
		onNext, onPrev,
		playNext, addToQueue,
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
	// A playlist that is gone (deleted, other library) falls back to the list.
	const listView: View = requestedView.kind === "playlist" && !playlists.playlists.some(p => p.id === requestedView.id)
		? PLAYLISTS_VIEW
		: requestedView;
	const { rows: viewRows, missingCount, playlist, sortOrder, setLibrarySort } =
		useViewRows(listView, files, trackStats.stats, playlists.playlists);

	// Open a folder as the active library: validate it, remember it, scan it.
	const openLibrary = async (path: string) => {
		const valid = await library.validate(path);
		if (!valid) {
			setPickerError(`Folder not found: ${path}`);
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

	const handleRemoveRecent = (path: string) => {
		const recentPaths = removeRecentPath(settings.recentPaths, path);
		// If the removed folder was the one we'd reopen on startup, forget it too,
		// so the next launch won't auto-open a folder the user removed.
		const lastPath = path === settings.lastPath ? "" : settings.lastPath;
		updateSettings({ recentPaths, lastPath });
	};

	// On startup: reopen the last folder if it still exists, otherwise stay on
	// the picker (showing an error if a previously used folder disappeared).
	useEffect(() => {
		const last = settings.lastPath;
		(async () => {
			if (last) {
				const valid = await library.validate(last);
				if (valid) {
					await library.scan(last);
					setView("library");
					return;
				}
				setPickerError(`Last folder is no longer available: ${last}`);
			}
			setView("picker");
		})();
		// Run once on mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const {
		searchQuery, setSearchQuery,
		displayRows, displayFiles, looseFromIndex, isSearching, handleShuffleAll
	} = useTrackListLogic(
		viewRows,
		isShuffle,
		toggleShuffle,
		playTrack
	);

	const editablePlaylist = playlist && !playlist.readOnly ? playlist : null;
	const manualPlaylist = editablePlaylist?.type === "manual" ? editablePlaylist : null;

	const handleSortChange = (order: SortOrder) => {
		if (listView.kind === "system") setLibrarySort(order);
		else if (manualPlaylist) playlists.setSort(manualPlaylist.id, sortSpecOf(order));
	};

	const changeLayout = (layout: PlaylistsLayout) => {
		setPlaylistsLayout(layout);
		try {
			localStorage.setItem(LAYOUT_KEY, layout);
		} catch {
			// Not remembered; fine.
		}
	};

	const showView = (next: View) => {
		setRenamingId(null);
		setListView(next);
	};

	/** Create an empty playlist and open it with its name ready to edit. */
	const createPlaylist = async () => {
		const created = await playlists.createManual("New playlist");
		if (!created) return;
		showView({ kind: "playlist", id: created.id });
		setRenamingId(created.id);
	};

	const addToPlaylist = async (target: Playlist, tracks: Track[]) => {
		if (await playlists.addTracks(target.id, tracks.map(t => t.relPath))) {
			notifyInfo(`Added to "${target.name}"`);
		}
	};

	const createPlaylistWith = async (name: string, tracks: Track[]) => {
		const created = await playlists.createManual(name);
		if (created) await addToPlaylist(created, tracks);
	};

	const openEditor = async (edited: Playlist | null) => {
		let tags: TagOption[] = [];
		try {
			tags = await invoke<TagOption[]>("list_tags");
		} catch {
			// The tag field just offers nothing.
		}
		setEditor({ playlist: edited, tags });
	};

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
		const confirmed = await ask(`Delete the playlist "${target.name}"? The tracks stay in the library.`, {
			title: "Delete playlist",
			kind: "warning",
			okLabel: "Delete",
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

	const closeMenu = useCallback(() => setMenu(null), []);

	const trackMenu = (row: ListRow): MenuEntry[] => {
		const favorite = trackStats.stats[row.track.relPath]?.favorite ?? false;
		const entries: MenuEntry[] = [
			{ kind: "item", label: "Play", icon: <Play size={16} />, onSelect: () => playTrack(row.track, displayFiles) },
			{ kind: "item", label: "Add to…", icon: <ListPlus size={16} />, onSelect: () => setAddTo([row.track]) },
			{
				kind: "item",
				label: favorite ? "Remove from favorites" : "Add to favorites",
				icon: <Heart size={16} fill={favorite ? "currentColor" : "none"} />,
				onSelect: () => trackStats.toggleFavorite(row.track),
			},
		];
		if (manualPlaylist && row.itemId) {
			const itemId = row.itemId;
			entries.push(
				{ kind: "separator" },
				{
					kind: "item",
					label: "Remove from this playlist",
					icon: <Trash2 size={16} />,
					danger: true,
					onSelect: () => playlists.removeItems(manualPlaylist.id, [itemId]),
				},
			);
		}
		return entries;
	};

	const playlistMenu = (target: Playlist): MenuEntry[] => [
		{ kind: "item", label: "Open", icon: <FolderOpen size={16} />, onSelect: () => showView({ kind: "playlist", id: target.id }) },
		{
			kind: "item",
			label: "Play",
			icon: <Play size={16} />,
			onSelect: async () => {
				const tracks = await tracksOf(target);
				if (tracks.length > 0) playTrack(tracks[0], tracks);
			},
		},
		{
			kind: "item",
			label: "Add to…",
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
				label: "Delete",
				icon: <Trash2 size={16} />,
				danger: true,
				onSelect: () => deletePlaylist(target),
			},
		]),
	];

	const emptyText = isSearching
		? "Nothing matches your search."
		: listView.kind === "system"
			? EMPTY_TEXT[listView.id]
			: playlist?.type === "smart"
				? "No tracks match these rules."
				: "This playlist is empty. Use \u201cAdd to\u2026\u201d in a track's menu (right click or \u22ee) to add tracks.";

	const handlePlayAll = () => {
		if (displayFiles.length > 0) {
			if (isShuffle) toggleShuffle(displayFiles);
			playTrack(displayFiles[0], displayFiles);
		}
	};

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
						<span>Indexing...</span>
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
				/>

				<main className="container">
					{listView.kind === "playlists" ? (
						<PlaylistsPage
							playlists={playlists.playlists}
							tracksByPath={tracksByPath}
							layout={playlistsLayout}
							onLayoutChange={changeLayout}
							onOpen={(target) => showView({ kind: "playlist", id: target.id })}
							onOpenMenu={(target, x, y) => setMenu({ x, y, entries: playlistMenu(target) })}
							onCreate={createPlaylist}
							onCreateSmart={() => openEditor(null)}
						/>
					) : (
						<>
							{playlist && (
								<PlaylistHeader
									key={playlist.id}
									playlist={playlist}
									rows={viewRows}
									missingCount={missingCount}
									startRenaming={renamingId === playlist.id}
									onBack={() => showView(PLAYLISTS_VIEW)}
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
								sortOrder={sortOrder}
								onSortChange={handleSortChange}
								sortDisabled={isSearching}
								showManualOrder={playlist?.type === "manual"}
								onShuffleAll={handleShuffleAll}
								onPlayAll={handlePlayAll}
							/>

							<div className="track-list-wrapper">
								<TrackList
									rows={displayRows}
									activePath={activePath}
									stats={trackStats.stats}
									looseFromIndex={looseFromIndex}
									emptyText={emptyText}
									onPlay={(track) => playTrack(track, displayFiles)}
									onToggleFavorite={trackStats.toggleFavorite}
									onOpenMenu={(row, x, y) => setMenu({ x, y, entries: trackMenu(row) })}
									onReorder={manualPlaylist && sortOrder === "manual" && !isSearching
										? (itemIds) => playlists.reorder(manualPlaylist.id, itemIds)
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
				/>
			</div>

			<PlayerBar
				currentTrack={currentTrack ?? null}
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
					onPlayNext={() => {
						playNext(addTo);
						setAddTo(null);
						notifyInfo("Playing next");
					}}
					onAddToQueue={() => {
						addToQueue(addTo);
						setAddTo(null);
						notifyInfo("Added to queue");
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
					title={editor.playlist ? "Edit smart playlist" : "New smart playlist"}
					initialName={editor.playlist?.name ?? "New smart playlist"}
					initialRules={editor.playlist?.rules}
					tags={editor.tags}
					onSave={saveSmartPlaylist}
					onClose={() => setEditor(null)}
				/>
			)}

			<Notices />
		</>
	);
}

export default App;