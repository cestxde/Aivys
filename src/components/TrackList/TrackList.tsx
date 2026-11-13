import "./TrackList.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { ListRow, Track } from "../../types";
import type { SortSection } from "../../utils/sort";
import { t } from "../../i18n";
import {
	AUTOSCROLL_EDGE, NO_SELECTION, OVERSCAN, SPAN_EDGE, SPAN_SPEED, entryAt, measuredTrackListHeights,
	moveItem, setMeasuredTrackListHeights, type TrackListEntry, type TrackListHeights,
} from "./trackListLayout";
import { TrackListRow } from "./TrackListRow";

interface TrackListProps {
	rows: ListRow[];
	activePath: string | null;
	looseFromIndex?: number;
	emptyText?: string;
	sectionOf?: ((track: Track) => SortSection) | null;
	hintOf?: ((track: Track) => string | null) | null;
	numberOf?: ((track: Track) => string) | null;
	onPlay: (track: Track, row: ListRow) => void;
	onOpenMenu?: (row: ListRow, x: number, y: number) => void;
	onReorder?: (itemIds: string[]) => void;
	selected?: Set<string>;
	onSelect?: (row: ListRow, index: number, how: { range: boolean; additive: boolean }) => void;
	onSelectSpan?: (base: Set<string>, from: number, to: number) => void;
}

interface DropTarget {
	key: string;
	after: boolean;
}

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
	onSelectSpan,
}: TrackListProps) => {
	const lastPointer = useRef<string>("mouse");
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

	const entries = useMemo(() => {
		const list: TrackListEntry[] = [];
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

	const rootRef = useRef<HTMLDivElement>(null);
	const span = useRef<{ base: Set<string>; from: number; to: number; x: number; y: number } | null>(null);
	const followTouch = useRef<(target: EventTarget) => void>(() => {});
	const touchTarget = useRef<EventTarget | null>(null);
	const latestSpan = useRef({ rows, onSelectSpan });
	useEffect(() => {
		latestSpan.current = { rows, onSelectSpan };
	});
	useEffect(() => {
		let frame = 0;
		const scroller = () => rootRef.current?.closest<HTMLElement>(".track-list-wrapper") ?? null;
		const follow = () => {
			const current = span.current;
			if (!current) return;
			const key = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
			const { rows, onSelectSpan } = latestSpan.current;
			const index = key ? rows.findIndex(row => row.key === key) : -1;
			if (index < 0 || index === current.to) return;
			current.to = index;
			onSelectSpan?.(current.base, current.from, index);
		};
		const scroll = () => {
			frame = 0;
			const current = span.current;
			const element = scroller();
			if (!current || !element) return;
			const box = element.getBoundingClientRect();
			const bottom = box.bottom - (parseFloat(getComputedStyle(element).paddingBottom) || 0);
			const step = current.y < box.top + SPAN_EDGE ? -(box.top + SPAN_EDGE - current.y)
				: current.y > bottom - SPAN_EDGE ? current.y - (bottom - SPAN_EDGE) : 0;
			if (step === 0) return;
			element.scrollBy(0, Math.sign(step) * Math.min(SPAN_SPEED, Math.abs(step) / 3 + 2));
			follow();
			frame = requestAnimationFrame(scroll);
		};
		const onMove = (e: TouchEvent) => {
			const current = span.current;
			if (!current) return;
			e.preventDefault();
			current.x = e.touches[0].clientX;
			current.y = e.touches[0].clientY;
			follow();
			if (!frame) frame = requestAnimationFrame(scroll);
		};
		let touched: EventTarget | null = null;
		const unlisten = () => {
			touched?.removeEventListener("touchmove", onMove as EventListener);
			touched?.removeEventListener("touchend", onEnd);
			touched?.removeEventListener("touchcancel", onEnd);
			touched = null;
		};
		function onEnd() {
			span.current = null;
			cancelAnimationFrame(frame);
			frame = 0;
			unlisten();
		}
		followTouch.current = (target) => {
			unlisten();
			touched = target;
			target.addEventListener("touchmove", onMove as EventListener, { passive: false });
			target.addEventListener("touchend", onEnd);
			target.addEventListener("touchcancel", onEnd);
		};
		return onEnd;
	}, []);

	const [heights, setHeights] = useState<TrackListHeights>(measuredTrackListHeights());
	const [visible, setVisible] = useState({ top: 0, height: 1000 });

	const offsets = useMemo(() => {
		const result = [0];
		for (const entry of entries) result.push(result[result.length - 1] + heights[entry.kind]);
		return result;
	}, [entries, heights]);

	useLayoutEffect(() => {
		const root = rootRef.current;
		const scroller = root?.closest<HTMLElement>(".track-list-wrapper");
		if (!root || !scroller) return;
		const update = () => {
			const listTop = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
			const top = scroller.scrollTop - listTop;
			const height = scroller.clientHeight;
			setVisible(prev => (Math.abs(prev.top - top) < 1 && prev.height === height ? prev : { top, height }));
		};
		update();
		scroller.addEventListener("scroll", update, { passive: true });
		const resize = new ResizeObserver(update);
		resize.observe(scroller);
		for (const child of scroller.children) {
			if (child !== root) resize.observe(child);
		}
		return () => {
			scroller.removeEventListener("scroll", update);
			resize.disconnect();
		};
	}, []);

	useLayoutEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const next = { ...heights };
		let changed = false;
		for (const [kind, selector] of [["row", ".audio-item"], ["section", ".list-section"], ["separator", ".list-separator"]] as const) {
			const element = root.querySelector(`:scope > ${selector}`);
			const height = element ? element.getBoundingClientRect().height + 1 : null;
			if (height !== null && Math.abs(height - next[kind]) > 0.5) {
				next[kind] = height;
				changed = true;
			}
		}
		if (changed) {
			setMeasuredTrackListHeights(next);
			setHeights(next);
		}
	}, [heights, entries, visible]);

	const first = dragging ? 0 : entryAt(offsets, visible.top - OVERSCAN);
	const last = dragging ? entries.length : Math.min(entries.length, entryAt(offsets, visible.top + visible.height + OVERSCAN) + 1);
	const total = offsets[offsets.length - 1];
	const padTop = Math.max(0, offsets[first] - 1);
	const padBottom = Math.max(0, total - offsets[last] - 1);

	const renderEntry = (entry: TrackListEntry) => {
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
		return (
			<TrackListRow
				key={row.key}
				row={row}
				index={index}
				activePath={activePath}
				selected={selected}
				dragging={dragging}
				dropTarget={dropTarget}
				hintOf={hintOf}
				numberOf={numberOf}
				onPlay={onPlay}
				onOpenMenu={onOpenMenu}
				onReorder={onReorder}
				onSelect={onSelect}
				lastPointer={lastPointer}
				touchTarget={touchTarget}
				span={span}
				followTouch={followTouch}
				startDrag={startDrag}
				moveDrag={moveDrag}
				endDrag={endDrag}
			/>
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
