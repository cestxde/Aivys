import type { ComponentType, MouseEvent } from "react";
import { MoreVertical } from "lucide-react";
import type { TrackGroup } from "../../utils/groups";
import { groupCovers } from "../../utils/groups";
import { CoverMosaic } from "../PlaylistCover/PlaylistCover";
import { CardPlayButton, PlayingMark } from "../CardPlayButton/CardPlayButton";
import { LayoutToggle, type PlaylistsLayout } from "../PlaylistsPage/PlaylistsPage";
import { t } from "../../i18n";
import { useRememberedScroll, useRememberedState } from "../../hooks/useRemembered";
import "../PlaylistsPage/PlaylistsPage.css";
import "./CollectionPage.css";

interface CollectionPageProps {
    /** Remembers the page's filter and position ("artists", "albums"). */
    memoryKey: string;
    title: string;
    groups: TrackGroup[];
    /** Placeholder cover icon. */
    icon: ComponentType<{ size?: number }>;
    /** Round covers (artists). */
    round?: boolean;
    describe: (group: TrackGroup) => string;
    emptyText: string;
    filterPlaceholder: string;
    noMatchText: string;
    layout: PlaylistsLayout;
    onLayoutChange: (layout: PlaylistsLayout) => void;
    onOpen: (group: TrackGroup) => void;
    onPlay: (group: TrackGroup) => void;
    /** Key of the group playback was started from, to highlight it. */
    playingKey: string | null;
    onOpenMenu: (group: TrackGroup, x: number, y: number) => void;
}

/** How many cards are rendered before "Show more" (big libraries). */
const PAGE = 300;

/** All artists or albums of the library, as a grid of cards or a list. */
export const CollectionPage = ({
    memoryKey,
    title,
    groups,
    icon,
    round = false,
    describe,
    emptyText,
    filterPlaceholder,
    noMatchText,
    layout,
    onLayoutChange,
    onOpen,
    onPlay,
    playingKey,
    onOpenMenu,
}: CollectionPageProps) => {
    const [filter, setFilter] = useRememberedState(`${memoryKey}.filter`, "");
    const [limit, setLimit] = useRememberedState(`${memoryKey}.limit`, PAGE);
    const { ref: scrollRef, onScroll: onPageScroll } = useRememberedScroll(memoryKey);
    const query = filter.trim().toLowerCase();
    const matching = query
        ? groups.filter(g => g.name.toLowerCase().includes(query) || g.subtitle?.toLowerCase().includes(query))
        : groups;
    const shown = matching.slice(0, limit);
    const shape = round ? "collection-round" : "";

    const handlers = (group: TrackGroup) => ({
        onClick: () => onOpen(group),
        onContextMenu: (e: MouseEvent) => {
            e.preventDefault();
            onOpenMenu(group, e.clientX, e.clientY);
        },
    });

    const actions = (group: TrackGroup) => (
        <>
            <CardPlayButton onPlay={() => onPlay(group)} />
            {menuButton(group)}
        </>
    );

    const menuButton = (group: TrackGroup) => (
        <button
            className="playlists-menu-button"
            title={t("common.more")}
            aria-haspopup="menu"
            onClick={(e) => {
                e.stopPropagation();
                const box = e.currentTarget.getBoundingClientRect();
                onOpenMenu(group, box.right - 200, box.bottom + 2);
            }}
        >
            <MoreVertical size={16} />
        </button>
    );

    return (
        <div className="playlists-page" ref={scrollRef} onScroll={onPageScroll}>
            <div className="playlists-toolbar">
                <h1 className="playlists-title">{title}</h1>
                <input
                    className="search-input playlists-filter"
                    placeholder={filterPlaceholder}
                    value={filter}
                    onChange={(e) => {
                        setFilter(e.target.value);
                        setLimit(PAGE);
                    }}
                />
                <LayoutToggle layout={layout} onChange={onLayoutChange} />
            </div>

            {shown.length === 0 ? (
                <div className="playlists-empty">
                    {groups.length === 0 ? emptyText : noMatchText}
                </div>
            ) : layout === "grid" ? (
                <div className="playlists-grid">
                    {shown.map(group => (
                        <div
                            key={group.key}
                            className={`playlist-card card-hover ${shape} ${group.key === playingKey ? "is-playing" : ""}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && onOpen(group)}
                            {...handlers(group)}
                        >
                            <CoverMosaic
                                covers={groupCovers(group, round ? 1 : 4)}
                                size={160}
                                icon={icon}
                                className="playlist-card-cover"
                            />
                            <div className="playlist-card-footer">
                                <div className="playlist-card-text">
                                    <span className="playlist-card-name" title={group.name}>
                                        {group.key === playingKey && <PlayingMark />}
                                        {group.name}
                                    </span>
                                    <span className="playlist-card-meta" title={describe(group)}>{describe(group)}</span>
                                </div>
                                {actions(group)}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="music-grid playlists-list">
                    {shown.map(group => (
                        <div key={group.key} className={`audio-item playlist-row card-hover ${shape} ${group.key === playingKey ? "is-playing active" : ""}`} {...handlers(group)}>
                            <CoverMosaic covers={groupCovers(group, round ? 1 : 4)} size={48} icon={icon} />
                            <div className="track-main-info">
                                <span className="track-title">
                                    {group.key === playingKey && <PlayingMark />}
                                    {group.name}
                                </span>
                                <span className="track-artist" title={describe(group)}>{describe(group)}</span>
                            </div>
                            {actions(group)}
                        </div>
                    ))}
                </div>
            )}

            {matching.length > shown.length && (
                <button className="collection-more" onClick={() => setLimit(limit + PAGE)}>
                    {t("collection.showMore", { count: matching.length - shown.length })}
                </button>
            )}
        </div>
    );
};
