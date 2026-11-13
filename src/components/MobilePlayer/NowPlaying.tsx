import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    ChevronDown, ClipboardCopy, ClipboardPaste, Disc3, Heart, Info, ListMusic, ListPlus, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Tag,
} from "lucide-react";
import type { Track, TrackStats, UserTag } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { tagsOf } from "../../utils/tags";
import { CoverArt } from "../CoverArt";
import { CoverViewer } from "../CoverViewer/CoverViewer";
import { ArtistLinks } from "../ArtistLinks/ArtistLinks";
import { TagChip } from "../TagChip/TagChip";
import { ContextMenu, type MenuEntry } from "../ContextMenu/ContextMenu";
import { TrackSlider } from "../PlayerBar/TrackSlider";
import { t } from "../../i18n";
import { useBackLayer } from "../../hooks/useBackLayer";
import { useCoverColor } from "../../hooks/useCoverColor";
import { rgbCss } from "../../utils/coverColor";
import { SleepTimerButton } from "../SleepTimer/SleepTimerButton";
import type { SleepTimer } from "../../hooks/useSleepTimer";
import "./MobilePlayer.css";
import { useNowPlayingSwipe } from "./useNowPlayingSwipe";
import { NowPlayingNeighbour } from "./NowPlayingNeighbour";

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
    sleepTimer: SleepTimer;
    onSleepTimerChange: (timer: SleepTimer) => void;
    onSeek: (time: number) => void;
    onToggleShuffle: () => void;
    onToggleRepeat: () => void;
    onToggleFavorite: (track: Track) => void;
    onAddTo: (track: Track) => void;
    onEditTags: (track: Track) => void;
    onCopyTags: (track: Track) => void;
    onPasteTags: (track: Track) => void;
    onAddTags: (track: Track) => void;
    /** True when the in-app tag clipboard has at least one still-known tag. */
    hasTagClipboard: boolean;
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

/**
 * Phones: the full-screen player, from the mini player. The track with its
 * tags, the ways to the queue and to the track's details, and the controls.
 */
export const NowPlaying = (props: NowPlayingProps) => {
    const { track, stats } = props;
    const [showCover, setShowCover] = useState(false);
    const [tagsMenuAt, setTagsMenuAt] = useState<{ x: number; y: number } | null>(null);
    const closeTagsMenu = useCallback(() => setTagsMenuAt(null), []);
    const artist = displayArtists(track);
    const tags = tagsOf(stats?.tags, props.tagsById);
    const favorite = stats?.favorite ?? false;
    const swipe = useNowPlayingSwipe(props.next ? props.onNext : null, props.previous ? props.onSwipePrevious : null);
    const tint = useCoverColor(track.coverPath);
    const tintStyle = {
        // No cover: a dull gray wash, not the bright accent.
        "--cover-tint": tint ? rgbCss(tint) : "var(--border)",
    } as CSSProperties;

    const tagsMenu: MenuEntry[] = [
        { kind: "item", label: t("menu.editTags"), icon: <Tag size={16} />, onSelect: () => props.onEditTags(track) },
        ...(tags.length > 0 ? [{
            kind: "item" as const,
            label: t("menu.copyTags"),
            icon: <ClipboardCopy size={16} />,
            onSelect: () => props.onCopyTags(track),
        }] : []),
        ...(props.hasTagClipboard ? [
            { kind: "separator" as const },
            { kind: "item" as const, label: t("menu.pasteTags"), icon: <ClipboardPaste size={16} />, onSelect: () => props.onPasteTags(track) },
            { kind: "item" as const, label: t("menu.addTags"), icon: <ListPlus size={16} />, onSelect: () => props.onAddTags(track) },
        ] : []),
    ];

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
        <div
            className={`now-playing ${tagsOpen ? "tags-open" : ""}`}
            role="dialog"
            aria-label={t("player.nowPlaying")}
            style={tintStyle}
        >
            <div className="now-playing-header">
                <button className="now-playing-icon" title={t("common.close")} onClick={props.onClose}>
                    <ChevronDown size={28} />
                </button>
                <SleepTimerButton
                    timer={props.sleepTimer}
                    onChange={props.onSleepTimerChange}
                    className="now-playing-icon now-playing-sleep"
                    size={22}
                />
            </div>

            <div className="now-playing-body">
                <div className="now-playing-swipe" {...swipe.handlers}>
                    <div className="now-playing-strip" style={swipe.style}>
                        <NowPlayingNeighbour track={props.previous} side="previous" />
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
                        <NowPlayingNeighbour track={props.next} side="next" />
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
                    <button
                        className="detail-tags-edit"
                        aria-haspopup={tags.length > 0 ? "menu" : undefined}
                        aria-expanded={tags.length > 0 ? tagsMenuAt !== null : undefined}
                        onPointerDown={(e) => tagsMenuAt && e.stopPropagation()}
                        onClick={(e) => {
                            if (tags.length === 0) {
                                props.onEditTags(track);
                                return;
                            }
                            const box = e.currentTarget.getBoundingClientRect();
                            setTagsMenuAt(tagsMenuAt ? null : { x: box.left, y: box.bottom + 4 });
                        }}
                    >
                        <Tag size={13} /> {tags.length > 0 ? t("detail.editTags") : t("detail.addTags")}
                        {tags.length > 0 && <ChevronDown size={12} />}
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
            {tagsMenuAt && (
                <ContextMenu x={tagsMenuAt.x} y={tagsMenuAt.y} entries={tagsMenu} onClose={closeTagsMenu} />
            )}
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
