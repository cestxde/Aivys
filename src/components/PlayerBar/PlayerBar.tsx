import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Shuffle,
    Repeat,
    Repeat1
} from "lucide-react";
import { useRef, useEffect, useState } from "react";
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
    const containerRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);

    const checkOverflow = () => {
        if (containerRef.current && textRef.current) {
            const containerWidth = containerRef.current.offsetWidth;
            const textWidth = textRef.current.scrollWidth;
            setIsOverflowing(textWidth > containerWidth);
        }
    };

    useEffect(() => {
        const timer = setTimeout(checkOverflow, 50);

        window.addEventListener('resize', checkOverflow);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', checkOverflow);
        };
    }, [props.currentTrackName]);

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
                    <span className="now-playing">
                        {props.isPlaying ? "Now Playing" : "Paused"}
                    </span>
                    <span
                        ref={containerRef}
                        key={props.currentTrackName}
                        className={`track-name-display ${isOverflowing ? "is-overflowing" : ""}`}
                    >
                        <span ref={textRef} className="marquee-content">
                            {props.currentTrackName || "No track"}
                        </span>
                        {isOverflowing && (
                            <span className="marquee-duplicate">
                                {props.currentTrackName}
                            </span>
                        )}
                    </span>
                </div>

                <div className="playback-controls">
                    <button className={`control-btn secondary ${props.isShuffle ? "active" : ""}`} onClick={props.onToggleShuffle} disabled={!hasTrack}>
                        <Shuffle size={20} />
                    </button>
                    <button className="control-btn" onClick={props.onPrev} disabled={!hasTrack}>
                        <SkipBack size={22} fill="currentColor" />
                    </button>
                    <button className="control-btn play-pause" onClick={props.onTogglePlay} disabled={!hasTrack}>
                        {props.isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '2px' }} />}
                    </button>
                    <button className="control-btn" onClick={props.onNext} disabled={!hasTrack}>
                        <SkipForward size={22} fill="currentColor" />
                    </button>
                    <button className={`control-btn secondary ${props.repeatMode !== 'none' ? "active" : ""}`} onClick={props.onToggleRepeat} disabled={!hasTrack}>
                        {props.repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                    </button>
                </div>

                <VolumeControl volume={props.volume} onVolumeChange={props.onVolumeChange} />
            </div>
        </div>
    );
};