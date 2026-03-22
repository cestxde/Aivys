import { useState } from "react";

const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

interface TrackSliderProps {
    currentTime: number;
    duration: number;
    disabled: boolean;
    onSeek: (time: number) => void;
}

export const TrackSlider = ({ currentTime, duration, disabled, onSeek }: TrackSliderProps) => {
    const [tooltip, setTooltip] = useState({ text: "", x: 0, visible: false });

    const handleMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        const rect = input.getBoundingClientRect();
        const wrapperRect = input.parentElement?.getBoundingClientRect();
        if (!wrapperRect) return;

        const xInsideInput = e.clientX - rect.left;
        const percent = Math.min(Math.max(xInsideInput / rect.width, 0), 1);
        const xForTooltip = e.clientX - wrapperRect.left;

        setTooltip({
            text: formatDuration(percent * (duration || 0)),
            x: xForTooltip,
            visible: true
        });
    };

    return (
        <div className="seek-container">
            <div
                className={`slider-tooltip ${tooltip.visible && !disabled ? "visible" : ""}`}
                style={{ left: `${tooltip.x}px` }}
            >
                {tooltip.text}
            </div>
            <span className="time-label">{formatDuration(currentTime)}</span>
            <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                disabled={disabled}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
                onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                className="seek-slider"
                style={{
                    background: !disabled
                        ? `linear-gradient(to right, var(--accent) ${(currentTime / (duration || 1)) * 100}%, var(--border) ${(currentTime / (duration || 1)) * 100}%)`
                        : "var(--border)"
                }}
            />
            <span className="time-label">{formatDuration(duration)}</span>
        </div>
    );
};