import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface AudioFile {
	name: string;
	path: string;
	duration: number; // Duration in seconds
}

function App() {
	const [path, setPath] = useState("");
	const [files, setFiles] = useState<AudioFile[]>([]);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [activePath, setActivePath] = useState<string | null>(null);

	// Helper to format seconds into MM:SS
	const formatDuration = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const handleScan = async () => {
		try {
			// Invoke the Rust command
			const result: AudioFile[] = await invoke("scan_directory", { basePath: path });
			setFiles(result);
		} catch (error) {
			console.error("Scan error:", error);
		}
	};

	const playTrack = (filePath: string) => {
		const assetUrl = convertFileSrc(filePath);

		if (!audioRef.current) {
			audioRef.current = new Audio(assetUrl);
		} else {
			audioRef.current.pause();
			audioRef.current.src = assetUrl;
			audioRef.current.load();
		}

		audioRef.current.play().catch(e => console.error("Playback error:", e));
	};

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

			<div className="music-grid">
				{files.map((file, i) => (
					<div
						key={i}
						onClick={() => {
							playTrack(file.path);
							setActivePath(file.path);
						}}
						className={`audio-item ${activePath === file.path ? 'active' : ''}`}
					>
						<div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', overflow: 'hidden', flex: 1 }}>
							<span style={{ fontWeight: 500, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
								{file.name}
							</span>
							<span style={{ fontSize: '10px', opacity: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
								{file.path.split(/[\\/]/).slice(-2, -1)}
							</span>
						</div>

						<span className="duration-tag">
							{formatDuration(file.duration)}
						</span>
					</div>
				))}
			</div>
		</main>
	);
}

export default App;