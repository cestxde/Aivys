import "./TrackList.css";
import { Fragment, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronRight, GripVertical, MoreVertical } from "lucide-react";
import type { ListRow, Track } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { formatDuration } from "../../utils/format";
import type { SortSection } from "../../utils/sort";
import { CoverArt } from "../CoverArt";
import { t } from "../../i18n";

interface TrackListProps {
    rows: ListRow[];
    activePath: string | null;
    /** Index from which results are loose search matches (-1: none). */
    looseFromIndex?: number;
    emptyText?: string;
    /** Split the rows into collapsible sections (consecutive rows with the same key). */
    sectionOf?: ((track: Track) => SortSection) | null;
    /** Gray detail next to each track (the value it is sorted by). */
    hintOf?: ((track: Track) => string | null) | null;
    /** A number before each track, e.g. its position on the album. */
    numberOf?: ((track: Track) => string) | null;

    onPlay: (track: Track) => void;
    /** Open the track menu at a viewport position (right click or the ⋮ button). */
    onOpenMenu?: (row: ListRow, x: number, y: number) => void;
    /** Rows can be dragged into a new order (manual playlist, manual sort). */
    onReorder?: (itemIds: string[]) => void;
}

interface DropTarget {
    key: string;
    after: boolean;
}

/** `ids` with `moved` placed before/after `target`. */
const moveItem = (ids: string[], moved: string, target: string, after: boolean): string[] => {
    const rest = ids.filter(id => id !== moved);
    const index = rest.indexOf(target);
    if (index < 0) return ids;
    rest.splice(after ? index + 1 : index, 0, moved);
    return rest;
};

/** Distance from the scroll container's edge that scrolls while dragging. */
const AUTOSCROLL_EDGE = 48;

export const TrackList = ({
    rows,
    activePath,
    looseFromIndex = -1,
    emptyText = t("empty.library"),
    sectionOf,
    hintOf,
    numberOf,
    onPlay,
    onOpenMenu,
    onReorder,
}: TrackListProps) => {
    // Reordering with pointer events (mouse and touch alike): the handle
    // captures the pointer, the row under it becomes the drop target.
    const [dragging, setDragging] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
    const dropRef = useRef<DropTarget | null>(null);

    const startDrag = (e: ReactPointerEvent<HTMLElement>, row: ListRow) => {
        if (!row.itemId || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(row.key);
    };

    const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
        if (!dragging) return;
        const scroller = e.currentTarget.closest(".track-list-wrapper");
        if (scroller) {
            const box = scroller.getBoundingClientRect();
            if (e.clientY < box.top + AUTOSCROLL_EDGE) scroller.scrollBy(0, -12);
            else if (e.clientY > box.bottom - AUTOSCROLL_EDGE) scroller.scrollBy(0, 12);
        }

        const rowElement = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>("[data-row-key]");
        const key = rowElement?.dataset.rowKey;
        if (!rowElement || !key) return;
        const box = rowElement.getBoundingClientRect();
        const next = { key, after: e.clientY > box.top + box.height / 2 };
        if (dropRef.current?.key !== next.key || dropRef.current.after !== next.after) {
            dropRef.current = next;
            setDropTarget(next);
        }
    };

    const endDrag = (commit: boolean) => {
        const target = dropRef.current;
        const moved = rows.find(r => r.key === dragging)?.itemId;
        const onto = target && rows.find(r => r.key === target.key)?.itemId;
        setDragging(null);
        setDropTarget(null);
        dropRef.current = null;
        if (commit && onReorder && moved && onto && target && moved !== onto) {
            const ids = rows.flatMap(r => r.itemId ?? []);
            onReorder(moveItem(ids, moved, onto, target.after));
        }
    };

    // Sections start where the key changes: `starts` maps a row index to its
    // section and size, `keys` holds every row's section key. Collapsing a key
    // hides every section with that key.
    const { starts, keys } = useMemo(() => {
        const starts = new Map<number, { section: SortSection; count: number }>();
        const keys: (string | null)[] = [];
        let current: { section: SortSection; count: number } | null = null;
        rows.forEach((row, index) => {
            const section = sectionOf?.(row.track) ?? null;
            keys.push(section?.key ?? null);
            if (!section) return;
            if (current && current.section.key === section.key) {
                current.count++;
                return;
            }
            current = { section, count: 1 };
            starts.set(index, current);
        });
        return { starts, keys };
    }, [rows, sectionOf]);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const toggleSection = (key: string) => setCollapsed(prev => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        return next;
    });

    const openMenuAt = (row: ListRow, x: number, y: number) => onOpenMenu?.(row, x, y);

    return (
        <div className={`music-grid ${dragging ? "is-reordering" : ""}`}>
            {rows.length === 0 ? (
                <div className="empty-state">{emptyText}</div>
            ) : (
                rows.map((row, index) => {
                    const start = starts.get(index);
                    const key = keys[index];
                    const hidden = key !== null && collapsed.has(key);
                    const header = start && (
                        <button
                            className={`list-section ${hidden ? "" : "open"}`}
                            aria-expanded={!hidden}
                            onClick={() => toggleSection(start.section.key)}
                        >
                            <ChevronRight size={14} className="list-section-chevron" />
                            <span className="list-section-label">{start.section.label}</span>
                            <span className="list-section-count">{start.count}</span>
                        </button>
                    );
                    if (hidden) return <Fragment key={row.key}>{header}</Fragment>;

                    const file = row.track;
                    const hint = hintOf?.(file);
                    const title = displayTitle(file);
                    const artist = displayArtists(file) ?? t("common.unknownArtist");
                    const drop = dropTarget?.key === row.key && dragging !== row.key
                        ? (dropTarget.after ? "drop-after" : "drop-before")
                        : "";
                    return (
                        <Fragment key={row.key}>
                            {index === looseFromIndex && (
                                <div className="list-separator">{t("list.similar")}</div>
                            )}
                            {header}
                            <div
                                data-row-key={row.key}
                                onClick={() => onPlay(file)}
                                onContextMenu={onOpenMenu && ((e) => {
                                    e.preventDefault();
                                    openMenuAt(row, e.clientX, e.clientY);
                                })}
                                className={`audio-item ${activePath === file.path ? 'active' : ''} ${dragging === row.key ? 'dragging' : ''} ${drop}`}
                            >
                                {onReorder && row.itemId && (
                                    <span
                                        className="drag-handle"
                                        title={t("list.dragToReorder")}
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => startDrag(e, row)}
                                        onPointerMove={moveDrag}
                                        onPointerUp={() => endDrag(true)}
                                        onPointerCancel={() => endDrag(false)}
                                    >
                                        <GripVertical size={14} />
                                    </span>
                                )}
                                {numberOf && <span className="track-number">{numberOf(file)}</span>}
                                <CoverArt path={file.coverPath} size={36} className="track-cover" />
                                <div className="track-main-info">
                                    <span className="track-title">{title}</span>
                                    <span className="track-artist">{artist}</span>
                                </div>
                                {hint && <span className="track-hint" title={hint}>{hint}</span>}
                                <span className="duration-tag">
                                    {formatDuration(file.duration)}
                                </span>
                                {onOpenMenu && (
                                    <button
                                        className="row-button menu-button"
                                        title={t("common.more")}
                                        aria-haspopup="menu"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const box = e.currentTarget.getBoundingClientRect();
                                            // Right-aligned under the button (the menu clamps to the window).
                                            openMenuAt(row, box.right - 200, box.bottom + 2);
                                        }}
                                    >
                                        <MoreVertical size={16} />
                                    </button>
                                )}
                            </div>
                        </Fragment>
                    );
                })
            )}
        </div>
    );
};
