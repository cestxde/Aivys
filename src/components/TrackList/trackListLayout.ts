import type { ListRow } from "../../types";
import type { SortSection } from "../../utils/sort";

/** What a row press does when nothing is selected yet. */
export const NO_SELECTION: Set<string> = new Set();

/** `ids` with `moved` placed before/after `target`. */
export const moveItem = (ids: string[], moved: string, target: string, after: boolean): string[] => {
	const rest = ids.filter(id => id !== moved);
	const index = rest.indexOf(target);
	if (index < 0) return ids;
	rest.splice(after ? index + 1 : index, 0, moved);
	return rest;
};

export const AUTOSCROLL_EDGE = 48;
export const SPAN_EDGE = 72;
export const SPAN_SPEED = 18;

export type TrackListEntry =
	| { kind: "separator"; key: string }
	| { kind: "section"; key: string; section: SortSection; count: number; hidden: boolean }
	| { kind: "row"; key: string; row: ListRow; index: number };

export type TrackListHeights = Record<TrackListEntry["kind"], number>;

let measuredHeights: TrackListHeights = { row: 62, section: 34, separator: 30 };

export const measuredTrackListHeights = (): TrackListHeights => measuredHeights;

export const setMeasuredTrackListHeights = (next: TrackListHeights) => {
	measuredHeights = next;
};

export const OVERSCAN = 800;

export const entryAt = (offsets: number[], y: number): number => {
	let low = 0;
	let high = offsets.length - 1;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (offsets[middle + 1] <= y) low = middle + 1;
		else high = middle;
	}
	return low;
};
