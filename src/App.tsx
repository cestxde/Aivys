import "./App.css";
import { useState, useEffect } from "react";
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
import { useTrackListLogic } from "./hooks/useTrackListLogic";
import { useTrackStats } from "./hooks/useTrackStats";
import { usePlayTracking } from "./hooks/usePlayTracking";
import { addRecentPath, removeRecentPath, type LibraryView } from "./types";

const EMPTY_TEXT: Record<LibraryView, string> = {
	library: "No tracks found. Scan a directory to start.",
	favorites: "No favorites yet. Use the heart next to a track to add it.",
	recentlyPlayed: "Nothing played yet.",
	mostPlayed: "Nothing played yet.",
};

type View = "loading" | "picker" | "library";

function App() {
	const { settings, updateSettings } = usePlayerSettings();
	const library = useLibrary();
	const [view, setView] = useState<View>("loading");
	const [pickerError, setPickerError] = useState<string | null>(null);
	const [libraryView, setLibraryView] = useState<LibraryView>("library");

	const {
		activePath, playTrack,
		isPlaying, togglePlay, volume, setVolume,
		currentTime, duration, seek, stop,
		onNext, onPrev,
		toggleShuffle, isShuffle,
		repeatMode, toggleRepeatMode,
		element
	} = useAudioPlayer(library.files, settings, updateSettings);

	const files = library.files;
	const currentTrack = files.find(f => f.path === activePath);

	const trackStats = useTrackStats(files);
	usePlayTracking(element, currentTrack ?? null, trackStats.recordPlay, trackStats.recordComplete);

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
		sortOrder, setSortOrder,
		displayFiles, looseFromIndex, isSearching, handleShuffleAll
	} = useTrackListLogic(
		files,
		libraryView,
		trackStats.stats,
		isShuffle,
		toggleShuffle,
		playTrack
	);

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
			</main>
		);
	}

	return (
		<>
			<div className="app-layout">
				<Sidebar
					libraryPath={settings.lastPath}
					onChangeLibrary={goToPicker}
					view={libraryView}
					onViewChange={setLibraryView}
				/>

				<main className="container">
					<Toolbar
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						sortOrder={sortOrder}
						onSortChange={setSortOrder}
						sortDisabled={libraryView !== "library" || isSearching}
						onShuffleAll={handleShuffleAll}
						onPlayAll={handlePlayAll}
					/>

					<div className="track-list-wrapper">
						<TrackList
							files={displayFiles}
							activePath={activePath}
							stats={trackStats.stats}
							looseFromIndex={looseFromIndex}
							emptyText={isSearching ? "Nothing matches your search." : EMPTY_TEXT[libraryView]}
							onPlay={(track) => playTrack(track, displayFiles)}
							onToggleFavorite={trackStats.toggleFavorite}
						/>
					</div>
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
		</>
	);
}

export default App;