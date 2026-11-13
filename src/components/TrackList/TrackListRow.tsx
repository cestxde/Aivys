import { Check, GripVertical, MoreVertical } from "lucide-react";
import type { ListRow, Track } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { formatDuration } from "../../utils/format";
import { CoverArt } from "../CoverArt";
import { t } from "../../i18n";
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from "react";

interface TrackListRowProps {
	row: ListRow;
	index: number;
	activePath: string | null;
	selected: Set<string>;
	dragging: string | null;
	dropTarget: { key: string; after: boolean } | null;
	hintOf?: ((track: Track) => string | null) | null;
	numberOf?: ((track: Track) => string) | null;
	onPlay: (track: Track, row: ListRow) => void;
	onOpenMenu?: (row: ListRow, x: number, y: number) => void;
	onReorder?: (itemIds: string[]) => void;
	onSelect?: (row: ListRow, index: number, how: { range: boolean; additive: boolean }) => void;
	lastPointer: MutableRefObject<string>;
	touchTarget: MutableRefObject<EventTarget | null>;
	span: MutableRefObject<{ base: Set<string>; from: number; to: number; x: number; y: number } | null>;
	followTouch: MutableRefObject<(target: EventTarget) => void>;
	startDrag: (e: ReactPointerEvent<HTMLElement>, row: ListRow) => void;
	moveDrag: (e: ReactPointerEvent<HTMLElement>) => void;
	endDrag: (commit: boolean) => void;
}

export const TrackListRow = ({
	row,
	index,
	activePath,
	selected,
	dragging,
	dropTarget,
	hintOf,
	numberOf,
	onPlay,
	onOpenMenu,
	onReorder,
	onSelect,
	lastPointer,
	touchTarget,
	span,
	followTouch,
	startDrag,
	moveDrag,
	endDrag,
}: TrackListRowProps) => {
	const isSelected = selected.has(row.key);
	const file = row.track;
	const hint = hintOf?.(file);
	const title = displayTitle(file);
	const artist = displayArtists(file) ?? t("common.unknownArtist");
	const drop = dropTarget?.key === row.key && dragging !== row.key
		? (dropTarget.after ? "drop-after" : "drop-before")
		: "";
	const openMenuAt = (r: ListRow, x: number, y: number) => onOpenMenu?.(r, x, y);

	return (
		<div
			data-row-key={row.key}
			onPointerDown={(e) => {
				lastPointer.current = e.pointerType;
			}}
			onTouchStart={(e) => {
				touchTarget.current = e.target;
			}}
			onMouseDown={(e) => e.shiftKey && e.preventDefault()}
			onClick={(e) => {
				const additive = e.ctrlKey || e.metaKey;
				const touchSelecting = selected.size > 0 && lastPointer.current === "touch";
				if (onSelect && (additive || e.shiftKey || touchSelecting)) {
					onSelect(row, index, { range: e.shiftKey, additive: additive || touchSelecting });
					return;
				}
				onPlay(file, row);
			}}
			onContextMenu={(e) => {
				e.preventDefault();
				if (onSelect && lastPointer.current === "touch") {
					span.current = { base: new Set(selected), from: index, to: index, x: e.clientX, y: e.clientY };
					followTouch.current(touchTarget.current ?? e.target);
					onSelect(row, index, { range: false, additive: true });
					return;
				}
				openMenuAt(row, e.clientX, e.clientY);
			}}
			aria-selected={onSelect ? isSelected : undefined}
			className={`audio-item ${activePath === file.path ? "active" : ""} ${isSelected ? "selected" : ""} ${dragging === row.key ? "dragging" : ""} ${drop}`}
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
			{onSelect && (
				<span
					className={`row-check ${selected.size > 0 ? "shown" : ""}`}
					role="checkbox"
					aria-checked={isSelected}
					aria-hidden={selected.size === 0}
					onClick={(e) => {
						e.stopPropagation();
						onSelect(row, index, { range: e.shiftKey, additive: true });
					}}
				>
					<span className={`row-check-box ${isSelected ? "checked" : ""}`}>
						{isSelected && <Check size={14} strokeWidth={3} />}
					</span>
				</span>
			)}
			{numberOf && <span className="track-number">{numberOf(file)}</span>}
			<CoverArt path={file.coverPath} size={42} className="track-cover" />
			<div className="track-main-info">
				<span className="track-title">{title}</span>
				<span className="track-artist">{artist}</span>
			</div>
			{hint && <span className="track-hint" title={hint}>{hint}</span>}
			<span className="duration-tag">{formatDuration(file.duration)}</span>
			{onOpenMenu && (
				<button
					className="row-button menu-button"
					title={t("common.more")}
					aria-haspopup="menu"
					onClick={(e) => {
						e.stopPropagation();
						const box = e.currentTarget.getBoundingClientRect();
						openMenuAt(row, box.right - 200, box.bottom + 2);
					}}
				>
					<MoreVertical size={16} />
				</button>
			)}
		</div>
	);
};
