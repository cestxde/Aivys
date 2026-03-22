import { useState } from "react";

interface VolumeControlProps {
    volume: number;
    onVolumeChange: (value: number) => void;
}

export const VolumeControl = ({ volume, onVolumeChange }: VolumeControlProps) => {
    const [tooltip, setTooltip] = useState({ text: "", x: 0, visible: false });

    const handleMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
        const input = e.currentTarget;
        const rect = input.getBoundingClientRect();
        const wrapperRect = input.parentElement?.getBoundingClientRect();
        if (!wrapperRect) return;

        const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        setTooltip({
            text: `${Math.round(percent * 100)}%`,
            x: e.clientX - wrapperRect.left,
            visible: true
        });
    };

    return (
        <div className="volume-section">
            <span className="volume-icon">🔈</span>
            <div className="volume-slider-wrapper">
                <div className={`slider-tooltip ${tooltip.visible ? "visible" : ""}`} style={{ left: `${tooltip.x}px` }}>
                    {tooltip.text}
                </div>
                <input
                    type="range" min="0" max="1" step="0.01"
                    value={volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    onMouseMove={handleMouseMove}
                    onMouseEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
                    onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                    className="volume-slider-clean"
                    style={{ background: `linear-gradient(to right, var(--accent) ${volume * 100}%, var(--border) ${volume * 100}%)` }}
                />
            </div>
        </div>
    );
};