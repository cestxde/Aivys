import "./App.css";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { TrackList } from "./components/TrackList/TrackList";

function App() {
	const { path, setPath, files, activePath, handleScan, playTrack } = useAudioPlayer();

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
		</main>
	);
}

export default App;