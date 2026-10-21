import "./App.css";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useLibrary } from "./hooks/useLibrary";
import { TrackList } from "./components/TrackList/TrackList";
import { PlayerBar } from "./components/PlayerBar/PlayerBar";
import { Toolbar } from "./components/ToolBar/ToolBar";
import { useTrackListLogic } from "./hooks/useTrackListLogic";

import logo from "./assets/logo-white-en.svg";

function App() {
	const library = useLibrary();

	const {
		path, setPath, activePath, playTrack,
		isPlaying, togglePlay, volume, setVolume,
		currentTime, duration, seek,
		onNext, onPrev,
		toggleShuffle, isShuffle,
		repeatMode, toggleRepeatMode
	} = useAudioPlayer(library.files);

	const files = library.files;
	const handleScan = () => library.scan(path);

	const currentTrack = files.find(f => f.path === activePath);

	const {
		searchQuery, setSearchQuery,
		sortOrder, setSortOrder,
		displayFiles, handleShuffleAll
	} = useTrackListLogic(
		files,
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

	return (
		<>
			<main className="container">
				<header className="header">
					<div className="logo-wrapper">
						<img src={logo} alt="" className="app-logo" />
					</div>
				</header>

				<div className="scanner-container">
					<input
						className="path-input"
						type="text"
						placeholder="Enter path (e.g., D:/Music)"
						value={path}
						onChange={(e) => setPath(e.target.value)}
					/>
					<button className="scan-button" onClick={handleScan}>
						Scan Directory
					</button>
				</div>

				<Toolbar
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					sortOrder={sortOrder}
					onSortChange={setSortOrder}
					onShuffleAll={handleShuffleAll}
					onPlayAll={handlePlayAll}
				/>

				<div className="track-list-wrapper">
					<TrackList
						files={displayFiles}
						activePath={activePath}
						onPlay={(track) => playTrack(track, displayFiles)}
					/>
				</div>
			</main>

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