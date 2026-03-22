import "./PlayerBar.css";

const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

interface PlayerBarProps {
    currentTrackName: string | null;
    isPlaying: boolean;
    volume: number;
    onTogglePlay: () => void;
    onVolumeChange: (value: number) => void;
    onPrev: () => void;
    onNext: () => void;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
}

export const PlayerBar = ({
    currentTrackName,
    isPlaying,
    volume,
    onTogglePlay,
    onVolumeChange,
    onPrev,
    onNext,
    currentTime,
    duration,
    onSeek
}: PlayerBarProps) => {
    if (!currentTrackName) return null;

    return (
        <div className="player-bar-wrapper">
            <div className="seek-container">
                <span className="time-label">{formatDuration(currentTime)}</span>
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={currentTime}
                    onChange={(e) => onSeek(parseFloat(e.target.value))}
                    className="seek-slider"
                    style={{
                        background: `linear-gradient(to right, var(--accent) ${(currentTime / (duration || 1)) * 100}%, var(--border) ${(currentTime / (duration || 1)) * 100}%)`
                    }}
                />
                <span className="time-label">{formatDuration(duration)}</span>
            </div>

            <div className="player-bar-content">
                <div className="track-info">
                    <span className="now-playing">Now Playing</span>
                    <span className="track-name-display">{currentTrackName}</span>
                </div>

                <div className="playback-controls">
                    <button className="control-btn" onClick={onPrev}>⏮</button>
                    <button className="control-btn play-pause" onClick={onTogglePlay}>
                        {isPlaying ? "⏸" : "▶"}
                    </button>
                    <button className="control-btn" onClick={onNext}>⏭</button>
                </div>

                <div className="volume-section">
                    <span className="volume-icon">Vol</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                        className="volume-slider"
                    />
                </div>
            </div>
        </div>
    );
};