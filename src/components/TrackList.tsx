import type { AudioFile } from "../types";

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
            {files.map((file, i) => (
                <div
                    key={i}
                    onClick={() => onPlay(file.path)}
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
    );
};