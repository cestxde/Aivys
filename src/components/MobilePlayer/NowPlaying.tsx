import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
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
import { useBackLayer } from "../../hooks/useBackLayer";
import "./MobilePlayer.css";

interface NowPlayingProps {
    track: Track;
    /** The tracks a swipe goes to (shown beside this one); null at an end. */
    previous: Track | null;
    next: Track | null;
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

/** A quicker flick changes it too (px per ms). */
const FLICK_SPEED = 0.5;

/** How long the strip takes to settle after the finger lets go (ms). */
const SLIDE_MS = 200;

/**
 * The previous, current and next tracks side by side, the current one on
 * screen: the strip follows a finger swiping sideways. Let go far (or fast)
 * enough, it slides on to the neighbour, which then becomes the current
 * track; otherwise, or with no neighbour there, it slides back.
 */
const useSwipe = (onNext: (() => void) | null, onPrevious: (() => void) | null) => {
    const [offset, setOffset] = useState(0);
    const [animated, setAnimated] = useState(false);
    const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
    const last = useRef({ x: 0, time: 0, speed: 0 });
    const settling = useRef(false);
    // The strip's width, for how far the swipe has gone.
    const [width, setWidth] = useState(1);
    // A swipe is no tap: the click that ends it opens nothing.
    const swiped = useRef(false);

    const onPointerDown = (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || settling.current) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
        last.current = { x: e.clientX, time: e.timeStamp, speed: 0 };
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
            setWidth(e.currentTarget.offsetWidth || 1);
            swiped.current = true;
            setAnimated(false);
        }
        const elapsed = e.timeStamp - last.current.time;
        if (elapsed > 0) {
            last.current = { x: e.clientX, time: e.timeStamp, speed: (e.clientX - last.current.x) / elapsed };
        }
        // Toward no neighbour, it gives only a little.
        const blocked = dx < 0 ? !onNext : !onPrevious;
        setOffset(blocked ? dx * 0.25 : dx);
    };

    const settle = (to: number, then?: () => void) => {
        settling.current = true;
        setAnimated(true);
        setOffset(to);
        setTimeout(() => {
            // The neighbour becomes the current track and the strip is back
            // in place under it, in one render.
            then?.();
            setAnimated(false);
            setOffset(0);
            settling.current = false;
        }, SLIDE_MS);
    };

    const onPointerUp = (e: PointerEvent<HTMLElement>) => {
        const from = start.current;
        start.current = null;
        if (!from?.horizontal) return;
        const width = e.currentTarget.offsetWidth;
        const dx = e.clientX - from.x;
        const go = dx < 0 ? onNext : onPrevious;
        const far = Math.abs(dx) >= width * SWIPE_FRACTION || Math.abs(last.current.speed) >= FLICK_SPEED;
        // A finger turned back before letting go stays.
        const backward = last.current.speed !== 0 && Math.sign(last.current.speed) !== Math.sign(dx);
        if (!go || !far || backward) {
            settle(0);
            return;
        }
        settle(dx < 0 ? -width : width, go);
    };

    const onPointerCancel = () => {
        if (start.current?.horizontal) settle(0);
        start.current = null;
    };

    return {
        /**
         * What lies under the strip (the tags) fades out as the swipe goes,
         * gone by a third of the way (a taller neighbour would run over it),
         * and fades back in under the new track.
         */
        underStyle: {
            opacity: Math.max(0, 1 - Math.abs(offset) / (width / 3)),
            transition: animated || offset === 0 ? `opacity ${SLIDE_MS}ms ease-out` : "none",
        },
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

/** A track beside the current one in the strip: its cover and name, nothing to press. */
const Neighbour = ({ track, side }: { track: Track | null; side: "previous" | "next" }) => (
    <div className={`now-playing-panel neighbour ${side}`} aria-hidden>
        {track && (
            <>
                <div className="now-playing-cover-wrap">
                    <CoverArt path={track.coverPath} size={320} className="now-playing-cover" />
                </div>
                <div className="now-playing-heading">
                    <h2 className="now-playing-title">{displayTitle(track)}</h2>
                    <span className="now-playing-artist">{displayArtists(track)}</span>
                </div>
            </>
        )}
    </div>
);

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
    const swipe = useSwipe(props.next ? props.onNext : null, props.previous ? props.onSwipePrevious : null);

    // Closed, the tags take one line: as many as fit whole, then "+N" that
    // opens them all over the buttons and the seek bar. A new track shows
    // them closed again.
    const [tagsOpenFor, setTagsOpenFor] = useState<string | null>(null);
    const tagsOpen = tagsOpenFor === track.path;
    useBackLayer(tagsOpen, () => setTagsOpenFor(null));
    const tagsBox = useRef<HTMLDivElement>(null);
    const tagsKey = `${track.path}${tags.map(tag => tag.id).join(",")}`;
    // How many fit on the line, as measured for these tags at this width.
    const [fit, setFit] = useState({ key: "", count: 0 });
    const shownTags = tagsOpen || fit.key !== tagsKey ? tags.length : fit.count;
    // From all of them, one fewer while the line wraps (before paint, so
    // the steps never show).
    useLayoutEffect(() => {
        if (tagsOpen) return;
        const items = [...(tagsBox.current?.children ?? [])] as HTMLElement[];
        const wraps = items.some(item => item.offsetTop !== items[0].offsetTop);
        const count = wraps ? Math.max(0, shownTags - 1) : shownTags;
        if (count !== shownTags || fit.key !== tagsKey) setFit({ key: tagsKey, count });
    }, [tagsKey, shownTags, tagsOpen, fit.key]);
    // Another width (the phone turned): measured again.
    useEffect(() => {
        const reset = () => setFit({ key: "", count: 0 });
        window.addEventListener("resize", reset);
        return () => window.removeEventListener("resize", reset);
    }, []);

    return (
        <div className={`now-playing ${tagsOpen ? "tags-open" : ""}`} role="dialog" aria-label={t("player.nowPlaying")}>
            <div className="now-playing-header">
                <button className="now-playing-icon" title={t("common.close")} onClick={props.onClose}>
                    <ChevronDown size={28} />
                </button>
            </div>

            <div className="now-playing-body">
                <div className="now-playing-swipe" {...swipe.handlers}>
                    <div className="now-playing-strip" style={swipe.style}>
                        <Neighbour track={props.previous} side="previous" />
                        <div className="now-playing-panel">
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
                        <Neighbour track={props.next} side="next" />
                    </div>
                </div>

                <div className="now-playing-tags" ref={tagsBox} style={swipe.underStyle}>
                    {tags.slice(0, shownTags).map(tag => (
                        <TagChip
                            key={tag.id}
                            tag={tag}
                            onClick={() => props.onOpenTag(tag)}
                            onRemove={() => props.onRemoveTag(track, tag)}
                        />
                    ))}
                    {shownTags < tags.length && (
                        <button
                            className="now-playing-tags-more"
                            title={t("player.allTags", { count: tags.length })}
                            onClick={() => setTagsOpenFor(track.path)}
                        >
                            +{tags.length - shownTags}
                        </button>
                    )}
                    <button className="detail-tags-edit" onClick={() => props.onEditTags(track)}>
                        <Tag size={13} /> {tags.length > 0 ? t("detail.editTags") : t("detail.addTags")}
                    </button>
                </div>
                {tagsOpen && (
                    <button className="now-playing-tags-toggle" onClick={() => setTagsOpenFor(null)}>
                        <ChevronDown size={14} /> {t("player.lessTags")}
                    </button>
                )}
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
