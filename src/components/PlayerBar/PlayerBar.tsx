import { TrackSlider } from "./TrackSlider";
import { VolumeControl } from "./VolumeControl";
import "./PlayerBar.css";

interface PlayerBarProps {
    currentTrackName: string | null;
    isPlaying: boolean;
    volume: number;
    currentTime: number;
    duration: number;
    isShuffle: boolean;
    repeatMode: 'none' | 'one' | 'all';
    onTogglePlay: () => void;
    onVolumeChange: (value: number) => void;
    onPrev: () => void;
    onNext: () => void;
    onSeek: (time: number) => void;
    onToggleShuffle: () => void;
    onToggleRepeat: () => void;
}

export const PlayerBar = (props: PlayerBarProps) => {
    const hasTrack = !!props.currentTrackName;

    return (
        <div className="player-bar-wrapper">
            <TrackSlider
                currentTime={props.currentTime}
                duration={props.duration}
                disabled={!hasTrack}
                onSeek={props.onSeek}
            />

            <div className="player-bar-content">
                <div className="track-info">
                    <span className="now-playing">{props.isPlaying ? "Now Playing" : "Paused"}</span>
                    <span className="track-name-display">{props.currentTrackName || "No track"}</span>
                </div>

                <div className="playback-controls">
                    <button
                        className={`control-btn secondary ${props.isShuffle ? "active" : ""}`}
                        onClick={props.onToggleShuffle}
                        disabled={!hasTrack}
                        title="Shuffle"
                    >
                        🔀
                    </button>

                    <button className="control-btn" onClick={props.onPrev} disabled={!hasTrack}>⏮</button>

                    <button className="control-btn play-pause" onClick={props.onTogglePlay} disabled={!hasTrack}>
                        {props.isPlaying ? "⏸" : "▶"}
                    </button>

                    <button className="control-btn" onClick={props.onNext} disabled={!hasTrack}>⏭</button>

                    <button
                        className={`control-btn secondary ${props.repeatMode !== 'none' ? "active" : ""}`}
                        onClick={props.onToggleRepeat}
                        disabled={!hasTrack}
                        title={`Repeat: ${props.repeatMode}`}
                    >
                        {props.repeatMode === 'one' ? "🔂" : "🔁"}
                    </button>
                </div>

                <VolumeControl volume={props.volume} onVolumeChange={props.onVolumeChange} />
            </div>
        </div>
    );
};