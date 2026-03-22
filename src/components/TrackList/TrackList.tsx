import "./TrackList.css";
import type { AudioFile } from "../../types";

interface TrackListProps {
    files: AudioFile[];
    activePath: string | null;
    onPlay: (path: string) => void;
}

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const TrackList = ({ files, activePath, onPlay }: TrackListProps) => {
    return (
        <div className="music-grid">
            {files.length === 0 ? (
                <div className="empty-state">No tracks found. Scan a directory to start.</div>
            ) : (
                files.map((file, i) => (
                    <div
                        key={i}
                        onClick={() => onPlay(file.path)}
                        className={`audio-item ${activePath === file.path ? 'active' : ''}`}
                    >
                        <div className="track-main-info">
                            <span className="track-name">{file.name}</span>
                            <span className="track-folder">
                                {file.path.split(/[\\/]/).slice(-2, -1)}
                            </span>
                        </div>
                        <span className="duration-tag">
                            {formatDuration(file.duration)}
                        </span>
                    </div>
                ))
            )}
        </div>
    );
};