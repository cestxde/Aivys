import { Slider } from "../Slider/Slider";
import { formatDuration } from "../../utils/format";
import { usePlaybackTime } from "../../hooks/useAudioController";

interface TrackSliderProps {
    element: HTMLAudioElement;
    disabled: boolean;
    onSeek: (time: number) => void;
}

/** The seek bar; the only part of the app that re-renders as playback runs. */
export const TrackSlider = ({ element, disabled, onSeek }: TrackSliderProps) => {
    const { currentTime, duration } = usePlaybackTime(element);
    // src changes with the track; resets sticky seek previews on skip.
    const syncKey = element.src;
    return (
        <div className="seek-container">
            <span className="time-label">{formatDuration(currentTime)}</span>
            <Slider
                value={currentTime}
                min={0}
                max={duration > 0 && Number.isFinite(duration) ? duration : 0}
                step={0.1}
                disabled={disabled || !(duration > 0)}
                onChange={onSeek}
                formatTooltip={(val) => formatDuration(val)}
                className="seek-slider-layout"
                changeOn="release"
                syncKey={syncKey}
            />
            <span className="time-label">{formatDuration(duration)}</span>
        </div>
    );
};
