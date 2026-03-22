import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { TrackList } from "./components/TrackList";

function App() {
	const { path, setPath, files, activePath, handleScan, playTrack } = useAudioPlayer();

	return (
		<main style={{ padding: '40px', background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
			<h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px', color: 'var(--text-h)' }}>
				Aivys Player
			</h1>

			<div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
				<input
					type="text"
					placeholder="Enter path (e.g., D:/Music)"
					style={{
						flex: 1,
						background: 'var(--code-bg)',
						border: '1px solid var(--border)',
						color: 'var(--text-h)',
						padding: '8px 12px',
						borderRadius: '4px',
						outline: 'none'
					}}
					value={path}
					onChange={(e) => setPath(e.target.value)}
				/>
				<button
					onClick={handleScan}
					style={{
						background: 'var(--accent)',
						color: 'white',
						padding: '0 24px',
						borderRadius: '4px',
						border: 'none',
						cursor: 'pointer',
						fontWeight: 500
					}}
				>
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