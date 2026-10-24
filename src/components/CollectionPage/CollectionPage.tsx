import { useCallback, useState, type ComponentType, type MouseEvent } from "react";
import { ArrowUpDown, Check, ChevronDown, ChevronRight, MoreVertical } from "lucide-react";
import type { TrackGroup } from "../../utils/groups";
import { groupCovers } from "../../utils/groups";
import { CoverMosaic } from "../PlaylistCover/PlaylistCover";
import { CardPlayButton, PlayingMark } from "../CardPlayButton/CardPlayButton";
import { LayoutToggle, type PlaylistsLayout } from "../PlaylistsPage/PlaylistsPage";
import { t } from "../../i18n";
import { useRememberedScroll, useRememberedState, useStoredState } from "../../hooks/useRemembered";
import { ContextMenu, type MenuEntry } from "../ContextMenu/ContextMenu";
import "../PlaylistsPage/PlaylistsPage.css";
import "./CollectionPage.css";

/** A way to order the cards; `compare` gives the natural direction. */
export interface CollectionSort {
    id: string;
    label: string;
    compare: (a: TrackGroup, b: TrackGroup) => number;
}

/** A part of the page: the groups that pass `test`, under a heading. */
export interface CollectionSection {
    id: string;
    label: string;
    test: (group: TrackGroup) => boolean;
    /** Starts folded (unless a filter is typed). */
    folded?: boolean;
}

interface SortChoice {
    id: string;
    reversed: boolean;
}

const isSortChoice = (value: unknown): value is SortChoice =>
    !!value && typeof (value as SortChoice).id === "string" && typeof (value as SortChoice).reversed === "boolean";

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
    /** A further line on the card (on a list row, after `describe`). */
    detail?: (group: TrackGroup) => string | null;
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
    /** Ways to order the cards, the first being the default. */
    sorts: CollectionSort[];
    /** Split into parts (otherwise one list). */
    sections?: CollectionSection[];
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
    detail,
    emptyText,
    filterPlaceholder,
    noMatchText,
    layout,
    onLayoutChange,
    onOpen,
    onPlay,
    playingKey,
    onOpenMenu,
    sorts,
    sections,
}: CollectionPageProps) => {
    const [filter, setFilter] = useRememberedState(`${memoryKey}.filter`, "");
    const [limits, setLimits] = useRememberedState<Record<string, number>>(`${memoryKey}.limits`, {});
    // Sections whose folding the user flipped from their default.
    const [flipped, setFlipped] = useRememberedState<string[]>(`${memoryKey}.flipped`, []);
    const [sortChoice, setSortChoice] = useStoredState<SortChoice>(
        `${memoryKey}.sort`, { id: sorts[0].id, reversed: false }, isSortChoice);
    const [sortMenuAt, setSortMenuAt] = useState<{ x: number; y: number } | null>(null);
    const closeSortMenu = useCallback(() => setSortMenuAt(null), []);
    const { ref: scrollRef, onScroll: onPageScroll } = useRememberedScroll(memoryKey);

    const sort = sorts.find(option => option.id === sortChoice.id) ?? sorts[0];
    const query = filter.trim().toLowerCase();
    const matching = (query
        ? groups.filter(g => g.name.toLowerCase().includes(query) || g.subtitle?.toLowerCase().includes(query))
        : [...groups]
    ).sort((a, b) => (sortChoice.reversed ? -1 : 1) * sort.compare(a, b));
    const parts = sections
        ? sections.map(section => ({ ...section, groups: matching.filter(section.test) }))
        : [{ id: "all", label: "", test: () => true, folded: false, groups: matching }];
    const shape = round ? "collection-round" : "";

    const chooseSort = (id: string) =>
        setSortChoice({ id, reversed: id === sortChoice.id ? !sortChoice.reversed : false });
    const sortEntries: MenuEntry[] = [
        { kind: "label", label: t("toolbar.sortBy") },
        ...sorts.map((option): MenuEntry => ({
            kind: "item",
            label: option.label,
            icon: option.id === sort.id ? <Check size={16} /> : undefined,
            detail: option.id === sort.id && sortChoice.reversed ? t("collection.reversed") : undefined,
            onSelect: () => chooseSort(option.id),
        })),
    ];

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

    const renderGroups = (shown: TrackGroup[]) => layout === "grid" ? (
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
                            {detail?.(group) && <span className="playlist-card-meta">{detail(group)}</span>}
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
                        <span className="track-artist" title={describe(group)}>
                            {[describe(group), detail?.(group)].filter(Boolean).join(" · ")}
                        </span>
                    </div>
                    {actions(group)}
                </div>
            ))}
        </div>
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
                        setLimits({});
                    }}
                />
                <button
                    className="sort-button"
                    aria-haspopup="menu"
                    title={t("toolbar.sortBy")}
                    // The open menu closes on outside presses; let this click toggle it instead.
                    onPointerDown={(e) => sortMenuAt && e.stopPropagation()}
                    onClick={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        setSortMenuAt(sortMenuAt ? null : { x: box.left, y: box.bottom + 4 });
                    }}
                >
                    <ArrowUpDown size={15} />
                    <span className="sort-button-label">{sort.label}</span>
                    <ChevronDown size={14} />
                </button>
                <LayoutToggle layout={layout} onChange={onLayoutChange} />
                {sortMenuAt && <ContextMenu x={sortMenuAt.x} y={sortMenuAt.y} entries={sortEntries} onClose={closeSortMenu} />}
            </div>

            {matching.length === 0 && (
                <div className="playlists-empty">
                    {groups.length === 0 ? emptyText : noMatchText}
                </div>
            )}

            {parts.map(part => {
                if (part.groups.length === 0) return null;
                // A typed filter shows every part, so nothing it finds is hidden.
                const open = !!query || !!part.folded === flipped.includes(part.id);
                const limit = limits[part.id] ?? PAGE;
                const shown = part.groups.slice(0, limit);
                return (
                    <section key={part.id} className="collection-section">
                        {sections && (
                            <button
                                className={`collection-section-title ${open ? "open" : ""}`}
                                aria-expanded={open}
                                disabled={!!query}
                                onClick={() => setFlipped(flipped.includes(part.id)
                                    ? flipped.filter(id => id !== part.id)
                                    : [...flipped, part.id])}
                            >
                                <ChevronRight size={14} className="collection-section-chevron" />
                                {part.label}
                                <span className="collection-section-count">{part.groups.length}</span>
                            </button>
                        )}
                        {open && renderGroups(shown)}
                        {open && part.groups.length > shown.length && (
                            <button
                                className="collection-more"
                                onClick={() => setLimits({ ...limits, [part.id]: limit + PAGE })}
                            >
                                {t("collection.showMore", { count: part.groups.length - shown.length })}
                            </button>
                        )}
                    </section>
                );
            })}
        </div>
    );
};
