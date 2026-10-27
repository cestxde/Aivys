import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { Track } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { CoverArt } from "../CoverArt";
import { Marquee } from "../PlayerBar/Marquee";
import { t } from "../../i18n";
import "./MobilePlayer.css";

interface MiniPlayerProps {
    track: Track;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onPrev: () => void;
    onNext: () => void;
    /** Opens the full-screen player (a tap beside the buttons). */
    onOpen: () => void;
}

/**
 * Phones: the player as a bar at the bottom, over the end of the list (which
 * scrolls on under it), the full player behind a tap.
 */
export const MiniPlayer = ({ track, isPlaying, onTogglePlay, onPrev, onNext, onOpen }: MiniPlayerProps) => {
    const artist = displayArtists(track);
    return (
        <div className="mini-player" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
            <CoverArt path={track.coverPath} size={44} className="mini-player-cover" />
            <div className="mini-player-text">
                <Marquee text={displayTitle(track)} className="mini-player-title" />
                {artist && <span className="mini-player-artist">{artist}</span>}
            </div>
            {/* The buttons act; a tap anywhere else opens the full player. */}
            <div className="mini-player-buttons" onClick={(e) => e.stopPropagation()}>
                <button className="mini-player-button" title={t("player.previous")} onClick={onPrev}>
                    <SkipBack size={22} fill="currentColor" />
                </button>
                <button className="mini-player-button" title={isPlaying ? t("player.pause") : t("player.play")} onClick={onTogglePlay}>
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
                <button className="mini-player-button" title={t("player.next")} onClick={onNext}>
                    <SkipForward size={22} fill="currentColor" />
                </button>
            </div>
        </div>
    );
};
