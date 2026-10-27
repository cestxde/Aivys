import { useState, type ReactNode } from "react";
import {
    ChevronDown, Heart, Info, ListMusic, ListPlus, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Tag,
} from "lucide-react";
import type { Track, TrackStats, UserTag } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { tagsOf } from "../../utils/tags";
import { CoverArt } from "../CoverArt";
import { CoverViewer } from "../CoverViewer/CoverViewer";
import { ArtistLinks } from "../ArtistLinks/ArtistLinks";
import { TagChip } from "../TagChip/TagChip";
import { TrackSlider } from "../PlayerBar/TrackSlider";
import { t } from "../../i18n";
import "./MobilePlayer.css";

interface NowPlayingProps {
    track: Track;
    stats: TrackStats | null;
    tagsById: Map<string, UserTag>;
    /** The audio element, for the seek bar. */
    element: HTMLAudioElement;
    isPlaying: boolean;
    isShuffle: boolean;
    repeatMode: "none" | "one" | "all";
    /** Tracks after the current one, on the queue button. */
    upcoming: number;
    onClose: () => void;
    onTogglePlay: () => void;
    onPrev: () => void;
    onNext: () => void;
    onSeek: (time: number) => void;
    onToggleShuffle: () => void;
    onToggleRepeat: () => void;
    onToggleFavorite: (track: Track) => void;
    onAddTo: (track: Track) => void;
    onEditTags: (track: Track) => void;
    onOpenTag: (tag: UserTag) => void;
    onRemoveTag: (track: Track, tag: UserTag) => void;
    onOpenQueue: () => void;
    onOpenDetails: () => void;
    canOpenArtist: (name: string) => boolean;
    onOpenArtist: (name: string) => void;
}

/**
 * Phones: the full-screen player, from the mini player. The track with its
 * tags, the ways to the queue and to the track's details, and the controls.
 */
export const NowPlaying = (props: NowPlayingProps) => {
    const { track, stats } = props;
    const [showCover, setShowCover] = useState(false);
    const artist = displayArtists(track);
    const tags = tagsOf(stats?.tags, props.tagsById);
    const favorite = stats?.favorite ?? false;

    return (
        <div className="now-playing" role="dialog" aria-label={t("player.nowPlaying")}>
            <div className="now-playing-header">
                <button className="now-playing-icon" title={t("common.close")} onClick={props.onClose}>
                    <ChevronDown size={28} />
                </button>
            </div>

            <div className="now-playing-body">
                <div className="now-playing-cover-wrap">
                    <CoverArt
                        path={track.coverPath}
                        size={320}
                        className="now-playing-cover"
                        onClick={track.coverPath ? () => setShowCover(true) : undefined}
                    />
                </div>

                <div className="now-playing-heading">
                    <h2 className="now-playing-title">{displayTitle(track)}</h2>
                    {artist && (
                        <span className="now-playing-artist">
                            <ArtistLinks line={artist} artists={track.artists} canOpen={props.canOpenArtist} onOpen={props.onOpenArtist} />
                        </span>
                    )}
                </div>

                <div className="now-playing-tags">
                    {tags.map(tag => (
                        <TagChip
                            key={tag.id}
                            tag={tag}
                            onClick={() => props.onOpenTag(tag)}
                            onRemove={() => props.onRemoveTag(track, tag)}
                        />
                    ))}
                    <button className="detail-tags-edit" onClick={() => props.onEditTags(track)}>
                        <Tag size={13} /> {tags.length > 0 ? t("detail.editTags") : t("detail.addTags")}
                    </button>
                </div>
            </div>

            <div className="now-playing-actions">
                <button className="now-playing-icon" title={t("player.queue")} onClick={props.onOpenQueue}>
                    <ListMusic size={24} />
                    {props.upcoming > 0 && <span className="now-playing-badge">{props.upcoming}</span>}
                </button>
                <button
                    className={`now-playing-icon ${favorite ? "is-favorite" : ""}`}
                    title={favorite ? t("common.removeFromFavorites") : t("common.addToFavorites")}
                    aria-pressed={favorite}
                    onClick={() => props.onToggleFavorite(track)}
                >
                    <Heart size={24} fill={favorite ? "currentColor" : "none"} />
                </button>
                <button className="now-playing-icon" title={t("common.addTo")} onClick={() => props.onAddTo(track)}>
                    <ListPlus size={24} />
                </button>
                <button className="now-playing-icon" title={t("panel.track")} onClick={props.onOpenDetails}>
                    <Info size={24} />
                </button>
            </div>

            <div className="now-playing-seek">
                <TrackSlider element={props.element} disabled={false} onSeek={props.onSeek} />
            </div>

            <div className="now-playing-controls">
                <button
                    className={`now-playing-icon secondary ${props.isShuffle ? "active" : ""}`}
                    title={t("player.shuffle")}
                    aria-pressed={props.isShuffle}
                    onClick={props.onToggleShuffle}
                >
                    <Shuffle size={22} />
                </button>
                <button className="now-playing-icon" title={t("player.previous")} onClick={props.onPrev}>
                    <SkipBack size={26} fill="currentColor" />
                </button>
                <button
                    className="now-playing-play"
                    title={props.isPlaying ? t("player.pause") : t("player.play")}
                    onClick={props.onTogglePlay}
                >
                    {props.isPlaying ? <Pause size={38} fill="currentColor" /> : <Play size={38} fill="currentColor" />}
                </button>
                <button className="now-playing-icon" title={t("player.next")} onClick={props.onNext}>
                    <SkipForward size={26} fill="currentColor" />
                </button>
                <button
                    className={`now-playing-icon secondary ${props.repeatMode !== "none" ? "active" : ""}`}
                    title={t(props.repeatMode === "one" ? "player.repeatOne" : props.repeatMode === "all" ? "player.repeatAll" : "player.repeatOff")}
                    onClick={props.onToggleRepeat}
                >
                    {props.repeatMode === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}
                </button>
            </div>

            {showCover && <CoverViewer path={track.coverPath} onClose={() => setShowCover(false)} />}
        </div>
    );
};

/** Phones: a screen over the player (the queue, the track's details), with a way back. */
export const PhoneSheet = ({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) => (
    <div className="phone-sheet" role="dialog" aria-label={title}>
        <div className="phone-sheet-header">
            <button className="now-playing-icon" title={t("common.back")} onClick={onBack}>
                <ChevronDown size={26} />
            </button>
            <h2 className="phone-sheet-title">{title}</h2>
        </div>
        <div className="phone-sheet-body">{children}</div>
    </div>
);
