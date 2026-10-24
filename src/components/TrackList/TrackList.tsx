import "./TrackList.css";
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
    /** Keys of the selected rows. */
    selected?: Set<string>;
    /**
     * Select a row instead of playing it: Ctrl/Cmd+click adds or removes it,
     * Shift+click takes the range from the last one, and by touch a long press
     * starts selecting and taps go on.
     */
    onSelect?: (row: ListRow, index: number, how: { range: boolean; additive: boolean }) => void;
}

/** What a row press does when nothing is selected yet. */
const NO_SELECTION: Set<string> = new Set();

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

/** What the list shows, top to bottom. */
type Entry =
    | { kind: "separator"; key: string }
    | { kind: "section"; key: string; section: SortSection; count: number; hidden: boolean }
    | { kind: "row"; key: string; row: ListRow; index: number };

type Heights = Record<Entry["kind"], number>;

/**
 * Height of each kind of entry, gap included, as last measured; shared by all
 * lists, so a list opens at the right height. Rough until the first measure.
 */
let measured: Heights = { row: 62, section: 34, separator: 30 };

/** Rows rendered beyond the visible part, in pixels, so scrolling never shows a gap. */
const OVERSCAN = 800;

/** Index of the first entry whose bottom is below `y` (offsets are entry tops plus the end). */
const entryAt = (offsets: number[], y: number): number => {
    let low = 0;
    let high = offsets.length - 1;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (offsets[middle + 1] <= y) low = middle + 1;
        else high = middle;
    }
    return low;
};

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
    selected = NO_SELECTION,
    onSelect,
}: TrackListProps) => {
    // Touch and mouse differ: a long press (contextmenu by touch) selects.
    const lastPointer = useRef<string>("mouse");
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

    const entries = useMemo(() => {
        const list: Entry[] = [];
        rows.forEach((row, index) => {
            const start = starts.get(index);
            const key = keys[index];
            const hidden = key !== null && collapsed.has(key);
            if (index === looseFromIndex && !hidden) list.push({ kind: "separator", key: "~similar" });
            if (start) list.push({ kind: "section", key: `~section:${index}`, ...start, hidden });
            if (!hidden) list.push({ kind: "row", key: row.key, row, index });
        });
        return list;
    }, [rows, starts, keys, collapsed, looseFromIndex]);

    // Only the entries near the visible part of the scroll container are
    // rendered; spacers keep the full height. A long library would otherwise
    // build thousands of rows on every view change.
    const rootRef = useRef<HTMLDivElement>(null);
    const [heights, setHeights] = useState<Heights>(measured);
    const [visible, setVisible] = useState({ top: 0, height: 1000 });

    const offsets = useMemo(() => {
        const result = [0];
        for (const entry of entries) result.push(result[result.length - 1] + heights[entry.kind]);
        return result;
    }, [entries, heights]);

    // Follow the scroll container (the track list wrapper).
    useLayoutEffect(() => {
        const root = rootRef.current;
        const scroller = root?.closest<HTMLElement>(".track-list-wrapper");
        if (!root || !scroller) return;
        const update = () => {
            // The list may sit below other content (a folder's subfolders).
            const listTop = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
            const top = scroller.scrollTop - listTop;
            const height = scroller.clientHeight;
            setVisible(prev => (Math.abs(prev.top - top) < 1 && prev.height === height ? prev : { top, height }));
        };
        update();
        scroller.addEventListener("scroll", update, { passive: true });
        const resize = new ResizeObserver(update);
        resize.observe(scroller);
        // Content above the list (album cards, subfolders) moves it when it grows.
        for (const child of scroller.children) {
            if (child !== root) resize.observe(child);
        }
        return () => {
            scroller.removeEventListener("scroll", update);
            resize.disconnect();
        };
    }, []);

    // Measure the real heights once entries of a kind are on screen.
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const next = { ...heights };
        let changed = false;
        for (const [kind, selector] of [["row", ".audio-item"], ["section", ".list-section"], ["separator", ".list-separator"]] as const) {
            const element = root.querySelector(`:scope > ${selector}`);
            // + the 1px gap between entries
            const height = element ? element.getBoundingClientRect().height + 1 : null;
            if (height !== null && Math.abs(height - next[kind]) > 0.5) {
                next[kind] = height;
                changed = true;
            }
        }
        if (changed) {
            measured = next;
            setHeights(next);
        }
    }, [heights, entries, visible]);

    // While dragging everything stays rendered: the dragged row must not
    // disappear when the list scrolls under it.
    const first = dragging ? 0 : entryAt(offsets, visible.top - OVERSCAN);
    const last = dragging ? entries.length : Math.min(entries.length, entryAt(offsets, visible.top + visible.height + OVERSCAN) + 1);
    const total = offsets[offsets.length - 1];
    // A spacer is one entry more, so one gap less.
    const padTop = Math.max(0, offsets[first] - 1);
    const padBottom = Math.max(0, total - offsets[last] - 1);

    const renderEntry = (entry: Entry) => {
        if (entry.kind === "separator") {
            return <div key={entry.key} className="list-separator">{t("list.similar")}</div>;
        }
        if (entry.kind === "section") {
            return (
                <button
                    key={entry.key}
                    className={`list-section ${entry.hidden ? "" : "open"}`}
                    aria-expanded={!entry.hidden}
                    onClick={() => toggleSection(entry.section.key)}
                >
                    <ChevronRight size={14} className="list-section-chevron" />
                    <span className="list-section-label">{entry.section.label}</span>
                    <span className="list-section-count">{entry.count}</span>
                </button>
            );
        }
        const { row, index } = entry;
        const isSelected = selected.has(row.key);
        const file = row.track;
        const hint = hintOf?.(file);
        const title = displayTitle(file);
        const artist = displayArtists(file) ?? t("common.unknownArtist");
        const drop = dropTarget?.key === row.key && dragging !== row.key
            ? (dropTarget.after ? "drop-after" : "drop-before")
            : "";
        return (
            <div
                key={row.key}
                data-row-key={row.key}
                onPointerDown={(e) => {
                    lastPointer.current = e.pointerType;
                }}
                // Shift+click would also select text.
                onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                onClick={(e) => {
                    const additive = e.ctrlKey || e.metaKey;
                    const touchSelecting = selected.size > 0 && lastPointer.current === "touch";
                    if (onSelect && (additive || e.shiftKey || touchSelecting)) {
                        onSelect(row, index, { range: e.shiftKey, additive: additive || touchSelecting });
                        return;
                    }
                    onPlay(file);
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (onSelect && lastPointer.current === "touch") {
                        onSelect(row, index, { range: false, additive: true });
                        return;
                    }
                    openMenuAt(row, e.clientX, e.clientY);
                }}
                aria-selected={onSelect ? isSelected : undefined}
                className={`audio-item ${activePath === file.path ? 'active' : ''} ${isSelected ? 'selected' : ''} ${dragging === row.key ? 'dragging' : ''} ${drop}`}
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
        );
    };

    return (
        <div ref={rootRef} className={`music-grid ${dragging ? "is-reordering" : ""}`}>
            {rows.length === 0 ? (
                <div className="empty-state">{emptyText}</div>
            ) : (
                <>
                    {padTop > 0 && <div className="list-spacer" style={{ height: padTop }} />}
                    {entries.slice(first, last).map(renderEntry)}
                    {padBottom > 0 && <div className="list-spacer" style={{ height: padBottom }} />}
                </>
            )}
        </div>
    );
};
