import "./PlayerBar.css";

interface PlayerBarProps {
    currentTrackName: string | null;
    isPlaying: boolean;
    volume: number;
    onTogglePlay: () => void;
    onVolumeChange: (value: number) => void;
    onPrev: () => void;
    onNext: () => void;
}

export const PlayerBar = ({
    currentTrackName,
    isPlaying,
    volume,
    onTogglePlay,
    onVolumeChange,
    onPrev,
    onNext,
}: PlayerBarProps) => {
    if (!currentTrackName) return null;

    return (
        <div className="player-bar">
            <div className="track-info">
                <span className="now-playing">Now Playing</span>
                <span className="track-name-display">{currentTrackName}</span>
            </div>

            <div className="playback-controls">
                <button className="control-btn" onClick={onPrev} title="Previous">
                    ⏮
                </button>
                <button className="control-btn play-pause" onClick={onTogglePlay}>
                    {isPlaying ? "⏸" : "▶"}
                </button>
                <button className="control-btn" onClick={onNext} title="Next">
                    ⏭
                </button>
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
    );
};