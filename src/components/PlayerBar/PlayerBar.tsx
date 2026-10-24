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
import type { Track } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { CoverArt } from "../CoverArt";
import { ArtistLinks } from "../ArtistLinks/ArtistLinks";
import { CoverViewer } from "../CoverViewer/CoverViewer";
import { TrackSlider } from "./TrackSlider";
import { VolumeControl } from "./VolumeControl";
import { t } from "../../i18n";
import "./PlayerBar.css";

interface PlayerBarProps {
    currentTrack: Track | null;
    canOpenArtist: (name: string) => boolean;
    onOpenArtist: (name: string) => void;
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
    const hasTrack = !!props.currentTrack;
    const title = props.currentTrack ? displayTitle(props.currentTrack) : null;
    const artist = props.currentTrack ? displayArtists(props.currentTrack) : null;

    const containerRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [showCover, setShowCover] = useState(false);

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
    }, [title]);

    return (
        <div className="player-bar-wrapper">
            <TrackSlider
                currentTime={props.currentTime}
                duration={props.duration}
                disabled={!hasTrack}
                onSeek={props.onSeek}
            />

            <div className="player-bar-content">
                <div className="player-track-cell">
                    <CoverArt
                        path={props.currentTrack?.coverPath}
                        size={40}
                        className="player-cover"
                        onClick={hasTrack ? () => setShowCover(true) : undefined}
                    />
                    <div className="track-info">
                        <span
                            ref={containerRef}
                            key={title}
                            className={`track-name-display ${isOverflowing ? "is-overflowing" : ""}`}
                        >
                            <span ref={textRef} className="marquee-content">
                                {title || t("player.noTrack")}
                            </span>
                            {isOverflowing && (
                                <span className="marquee-duplicate">
                                    {title}
                                </span>
                            )}
                        </span>
                        {artist && props.currentTrack && (
                            <span className="track-artist-display">
                                <ArtistLinks
                                    line={artist}
                                    artists={props.currentTrack.artists}
                                    canOpen={props.canOpenArtist}
                                    onOpen={props.onOpenArtist}
                                />
                            </span>
                        )}
                    </div>
                </div>

                <div className="playback-controls">
                    <button
                        className={`control-btn secondary ${props.isShuffle ? "active" : ""}`}
                        title={t("player.shuffle")}
                        aria-pressed={props.isShuffle}
                        onClick={props.onToggleShuffle}
                    >
                        <Shuffle size={20} />
                    </button>
                    <button className="control-btn" title={t("player.previous")} onClick={props.onPrev} disabled={!hasTrack}>
                        <SkipBack size={22} fill="currentColor" />
                    </button>
                    <button
                        className="control-btn play-pause"
                        title={props.isPlaying ? t("player.pause") : t("player.play")}
                        onClick={props.onTogglePlay}
                        disabled={!hasTrack}
                    >
                        {props.isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '2px' }} />}
                    </button>
                    <button className="control-btn" title={t("player.next")} onClick={props.onNext} disabled={!hasTrack}>
                        <SkipForward size={22} fill="currentColor" />
                    </button>
                    <button
                        className={`control-btn secondary ${props.repeatMode !== 'none' ? "active" : ""}`}
                        title={t(props.repeatMode === 'one' ? "player.repeatOne" : props.repeatMode === 'all' ? "player.repeatAll" : "player.repeatOff")}
                        onClick={props.onToggleRepeat}
                    >
                        {props.repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                    </button>
                </div>

                <VolumeControl volume={props.volume} onVolumeChange={props.onVolumeChange} />
            </div>

            {showCover && props.currentTrack && (
                <CoverViewer
                    path={props.currentTrack.coverPath}
                    onClose={() => setShowCover(false)}
                />
            )}
        </div>
    );
};