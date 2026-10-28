import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
    ChevronDown, Disc3, Heart, Info, ListMusic, ListPlus, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Tag,
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
    /** The previous track, however far into this one (a swipe). */
    onSwipePrevious: () => void;
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
    /** The track has somewhere to go to (its artist, album, folder). */
    canGoTo: boolean;
    /** The "go to" menu, at a viewport position. */
    onOpenGoTo: (track: Track, x: number, y: number) => void;
    canOpenArtist: (name: string) => boolean;
    onOpenArtist: (name: string) => void;
}

/** How far, in a fraction of its width, the track is swiped to change it. */
const SWIPE_FRACTION = 0.22;

/** How long the swiped track takes to slide out, or the new one in (ms). */
const SLIDE_MS = 180;

/**
 * The track's cover and name follow a finger swiping sideways: let go far
 * enough, they slide out and the next (to the left) or previous (to the
 * right) track slides in from the other side; otherwise they slide back.
 */
const useSwipe = (onNext: () => void, onPrevious: () => void) => {
    const [offset, setOffset] = useState(0);
    const [animated, setAnimated] = useState(false);
    const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
    // A swipe is no tap: the click that ends it opens nothing.
    const swiped = useRef(false);

    const slide = (to: number, then?: () => void) => {
        setAnimated(true);
        setOffset(to);
        setTimeout(() => then?.(), SLIDE_MS);
    };

    const onPointerDown = (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || animated) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
        swiped.current = false;
    };

    const onPointerMove = (e: PointerEvent<HTMLElement>) => {
        const from = start.current;
        if (!from || from.id !== e.pointerId) return;
        const dx = e.clientX - from.x;
        const dy = e.clientY - from.y;
        if (from.horizontal === null) {
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
            from.horizontal = Math.abs(dx) > Math.abs(dy);
            if (!from.horizontal) {
                start.current = null;
                return;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            swiped.current = true;
            setAnimated(false);
        }
        setOffset(dx);
    };

    const onPointerUp = (e: PointerEvent<HTMLElement>) => {
        const from = start.current;
        start.current = null;
        if (!from?.horizontal) return;
        const width = e.currentTarget.offsetWidth;
        const dx = e.clientX - from.x;
        if (Math.abs(dx) < width * SWIPE_FRACTION) {
            slide(0);
            return;
        }
        const out = dx < 0 ? -width : width;
        slide(out, () => {
            (dx < 0 ? onNext : onPrevious)();
            // The new track from the other side, then into place.
            setAnimated(false);
            setOffset(-out);
            requestAnimationFrame(() => requestAnimationFrame(() => slide(0, () => setAnimated(false))));
        });
    };

    const onPointerCancel = () => {
        if (start.current?.horizontal) slide(0);
        start.current = null;
    };

    return {
        style: {
            transform: offset ? `translateX(${offset}px)` : undefined,
            transition: animated ? `transform ${SLIDE_MS}ms ease-out` : undefined,
        },
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onClickCapture: (e: { stopPropagation: () => void; preventDefault: () => void }) => {
                if (!swiped.current) return;
                swiped.current = false;
                e.stopPropagation();
                e.preventDefault();
            },
        },
    };
};

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
    const swipe = useSwipe(props.onNext, props.onSwipePrevious);

    return (
        <div className="now-playing" role="dialog" aria-label={t("player.nowPlaying")}>
            <div className="now-playing-header">
                <button className="now-playing-icon" title={t("common.close")} onClick={props.onClose}>
                    <ChevronDown size={28} />
                </button>
            </div>

            <div className="now-playing-body">
                <div className="now-playing-swipe" style={swipe.style} {...swipe.handlers}>
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
                <button
                    className="now-playing-icon"
                    title={t("menu.goTo")}
                    aria-haspopup="menu"
                    disabled={!props.canGoTo}
                    onClick={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        props.onOpenGoTo(track, box.left, box.bottom + 2);
                    }}
                >
                    <Disc3 size={24} />
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
