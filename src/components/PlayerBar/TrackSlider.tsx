import { Slider } from "../Slider/Slider";

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
    return (
        <div className="seek-container">
            <span className="time-label">{formatDuration(currentTime)}</span>
            <Slider
                value={currentTime}
                min={0}
                max={duration || 0}
                step={0.1}
                disabled={disabled}
                onChange={onSeek}
                formatTooltip={(val) => formatDuration(val)}
                className="seek-slider-layout"
                changeOn="release"
            />
            <span className="time-label">{formatDuration(duration)}</span>
        </div>
    );
};