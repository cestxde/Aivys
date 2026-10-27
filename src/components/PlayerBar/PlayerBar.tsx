import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Shuffle,
    Repeat,
    Repeat1, ListMusic
} from "lucide-react";
import { useState } from "react";
import type { Track } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { CoverArt } from "../CoverArt";
import { ArtistLinks } from "../ArtistLinks/ArtistLinks";
import { CoverViewer } from "../CoverViewer/CoverViewer";
import { TrackSlider } from "./TrackSlider";
import { VolumeControl } from "./VolumeControl";
import { Marquee } from "./Marquee";
import { t } from "../../i18n";
import "./PlayerBar.css";

interface PlayerBarProps {
    currentTrack: Track | null;
    canOpenArtist: (name: string) => boolean;
    onOpenArtist: (name: string) => void;
    isPlaying: boolean;
    volume: number;
    /** The audio element, for the position and length shown on the seek bar. */
    element: HTMLAudioElement;
    isShuffle: boolean;
    repeatMode: 'none' | 'one' | 'all';
    onTogglePlay: () => void;
    onVolumeChange: (value: number) => void;
    onPrev: () => void;
    onNext: () => void;
    onSeek: (time: number) => void;
    onToggleShuffle: () => void;
    /** The queue is shown (in the right panel). */
    queueOpen: boolean;
    onToggleQueue: () => void;
    onToggleRepeat: () => void;
}

export const PlayerBar = (props: PlayerBarProps) => {
    const hasTrack = !!props.currentTrack;
    const title = props.currentTrack ? displayTitle(props.currentTrack) : null;
    const artist = props.currentTrack ? displayArtists(props.currentTrack) : null;

    const [showCover, setShowCover] = useState(false);

    return (
        <div className="player-bar-wrapper">
            <TrackSlider
                element={props.element}
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
                        <Marquee text={title || t("player.noTrack")} />
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

                <div className="player-side">
                    <button
                        className={`control-btn secondary queue-toggle ${props.queueOpen ? "active" : ""}`}
                        title={t("player.queue")}
                        aria-pressed={props.queueOpen}
                        onClick={props.onToggleQueue}
                    >
                        <ListMusic size={20} />
                    </button>
                    <VolumeControl volume={props.volume} onVolumeChange={props.onVolumeChange} />
                </div>
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