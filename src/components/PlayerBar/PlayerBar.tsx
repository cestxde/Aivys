import { useState } from "react";
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
    const [seekTooltip, setSeekTooltip] = useState({ text: "", x: 0, visible: false });
    const [volTooltip, setVolTooltip] = useState({ text: "", x: 0, visible: false });

    const hasTrack = !!currentTrackName;

    const handleMouseMove = (
        e: React.MouseEvent<HTMLInputElement>,
        type: 'seek' | 'vol'
    ) => {
        const input = e.currentTarget;
        const rect = input.getBoundingClientRect();
        const wrapperRect = input.parentElement?.getBoundingClientRect();

        if (!wrapperRect) return;

        const xInsideInput = e.clientX - rect.left;
        const percent = Math.min(Math.max(xInsideInput / rect.width, 0), 1);

        const xForTooltip = e.clientX - wrapperRect.left;

        if (type === 'seek') {
            setSeekTooltip({
                text: formatDuration(percent * (duration || 0)),
                x: xForTooltip,
                visible: true
            });
        } else {
            setVolTooltip({
                text: `${Math.round(percent * 100)}%`,
                x: xForTooltip,
                visible: true
            });
        }
    };

    return (
        <div className="player-bar-wrapper">
            <div className="seek-container">
                <div
                    className={`slider-tooltip ${seekTooltip.visible && hasTrack ? "visible" : ""}`}
                    style={{ left: `${seekTooltip.x}px` }}
                >
                    {seekTooltip.text}
                </div>

                <span className="time-label">{formatDuration(currentTime)}</span>

                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={currentTime}
                    disabled={!hasTrack}
                    onChange={(e) => onSeek(parseFloat(e.target.value))}
                    onMouseMove={(e) => handleMouseMove(e, 'seek')}
                    onMouseEnter={() => setSeekTooltip(prev => ({ ...prev, visible: true }))}
                    onMouseLeave={() => setSeekTooltip(prev => ({ ...prev, visible: false }))}
                    className="seek-slider"
                    style={{
                        background: hasTrack
                            ? `linear-gradient(to right, var(--accent) ${(currentTime / (duration || 1)) * 100}%, var(--border) ${(currentTime / (duration || 1)) * 100}%)`
                            : "var(--border)"
                    }}
                />

                <span className="time-label">{formatDuration(duration)}</span>
            </div>

            <div className="player-bar-content">
                <div className="track-info">
                    <span className="now-playing">{isPlaying ? "Now Playing" : "Paused"}</span>
                    <span className="track-name-display">{currentTrackName || "No track"}</span>
                </div>

                <div className="playback-controls">
                    <button className="control-btn" onClick={onPrev} disabled={!hasTrack}>⏮</button>
                    <button className="control-btn play-pause" onClick={onTogglePlay} disabled={!hasTrack}>
                        {isPlaying ? "⏸" : "▶"}
                    </button>
                    <button className="control-btn" onClick={onNext} disabled={!hasTrack}>⏭</button>
                </div>

                <div className="volume-section">
                    <span className="volume-icon">🔈</span>
                    <div className="volume-slider-wrapper">
                        <div
                            className={`slider-tooltip ${volTooltip.visible ? "visible" : ""}`}
                            style={{ left: `${volTooltip.x}px` }}
                        >
                            {volTooltip.text}
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                            onMouseMove={(e) => handleMouseMove(e, 'vol')}
                            onMouseEnter={() => setVolTooltip(prev => ({ ...prev, visible: true }))}
                            onMouseLeave={() => setVolTooltip(prev => ({ ...prev, visible: false }))}
                            className="volume-slider-clean"
                            style={{
                                background: `linear-gradient(to right, var(--accent) ${volume * 100}%, var(--border) ${volume * 100}%)`
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};