import "./App.css";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { TrackList } from "./components/TrackList/TrackList";
import { PlayerBar } from "./components/PlayerBar/PlayerBar";

function App() {
	const {
		path, setPath, files, activePath, handleScan, playTrack,
		isPlaying, togglePlay, volume, setVolume,
		currentTime, duration, seek,
		onNext, onPrev,
		toggleShuffle, isShuffle,
		repeatMode, setRepeatMode
	} = useAudioPlayer();

	const currentTrack = files.find(f => f.path === activePath);

	return (
		<main className="container">
			<header className="header">
				<h1 className="title">Aivys Player</h1>
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

			<TrackList
				files={files}
				activePath={activePath}
				onPlay={playTrack}
			/>

			<PlayerBar
				currentTrackName={currentTrack?.name || null}
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
				onToggleShuffle={toggleShuffle}
				onToggleRepeat={() => {
					const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
					const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
					setRepeatMode(modes[nextIndex]);
				}}
			/>
		</main>
	);
}

export default App;