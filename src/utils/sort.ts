import type { SortSpec, Track } from "../types";
import { formatDate } from "./format";
import { displayTitle } from "./track";

/**
 * What a track list can be sorted by. `default` is the view's own order
 * (playlist order, most played first, ...); the others use the field names of
 * docs/aivys-format.md §8.4.3.
 */
export type SortField = 'default' | 'addedAt' | 'title' | 'artist' | 'album' | 'duration' | 'year';

export interface ViewSort {
    field: SortField;
    dir: 'asc' | 'desc';
}

/** How a sorted list shows the sort key: next to each track, or as collapsible sections. */
export type ListDisplay = 'inline' | 'sections';

export const DEFAULT_SORT: ViewSort = { field: 'default', dir: 'asc' };

/** A sortable field: its menu label, the direction it starts in, and what each direction means. */
export interface SortFieldInfo {
    field: Exclude<SortField, 'default'>;
    label: string;
    natural: ViewSort['dir'];
    asc: string;
    desc: string;
    /** Compared as text (A–Z icons) rather than numbers. */
    text: boolean;
}

export const SORT_FIELDS: SortFieldInfo[] = [
    { field: 'addedAt', label: "Date added", natural: 'desc', asc: "Oldest first", desc: "Newest first", text: false },
    { field: 'title', label: "Title", natural: 'asc', asc: "A to Z", desc: "Z to A", text: true },
    { field: 'artist', label: "Artist", natural: 'asc', asc: "A to Z", desc: "Z to A", text: true },
    { field: 'album', label: "Album", natural: 'asc', asc: "A to Z", desc: "Z to A", text: true },
    { field: 'duration', label: "Duration", natural: 'asc', asc: "Shortest first", desc: "Longest first", text: false },
    { field: 'year', label: "Year", natural: 'desc', asc: "Oldest first", desc: "Newest first", text: false },
];

/** Name of the sort's field; `defaultLabel` names the view's own order. */
export const sortLabel = (sort: ViewSort, defaultLabel: string): string =>
    SORT_FIELDS.find(info => info.field === sort.field)?.label ?? defaultLabel;

/** What the sort's direction means, e.g. "Newest first"; the view's own order can be reversed. */
export const directionLabel = (sort: ViewSort, defaultLabel: string): string => {
    const info = SORT_FIELDS.find(info => info.field === sort.field);
    if (info) return info[sort.dir];
    return sort.dir === 'asc' ? defaultLabel : `${defaultLabel}, reversed`;
};

/** Switching to `field` starts in its natural direction. */
export const sortBy = (field: SortField): ViewSort => ({
    field,
    dir: SORT_FIELDS.find(info => info.field === field)?.natural ?? 'asc',
});

// Older app versions stored these names for a manual playlist's view sort.
const LEGACY_FIELDS: Record<string, SortField> = { name: 'title', date: 'addedAt', manual: 'default' };
const FIELDS: SortField[] = ['default', 'addedAt', 'title', 'artist', 'album', 'duration', 'year'];

/** A persisted playlist sort as a view sort ("manual" is the playlist order). */
export const viewSortOf = (spec: SortSpec | undefined): ViewSort => {
    if (!spec) return DEFAULT_SORT;
    const field = LEGACY_FIELDS[spec.field] ?? (FIELDS.includes(spec.field as SortField) ? spec.field as SortField : 'default');
    return { field, dir: spec.dir === 'desc' ? 'desc' : 'asc' };
};

/** "manual" with `desc` is the playlist order reversed. */
export const sortSpecOf = (sort: ViewSort): SortSpec =>
    ({ field: sort.field === 'default' ? 'manual' : sort.field, dir: sort.dir });

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const albumOrder = (a: Track, b: Track) =>
    (a.discNumber ?? 0) - (b.discNumber ?? 0) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0);

/** Compare two optional values; missing ones always go last, whatever the direction. */
const compareOptional = <T,>(a: T | null, b: T | null, compare: (a: T, b: T) => number, sign: number): number => {
    if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
    return sign * compare(a, b);
};

const text = (value: string | null | undefined) => value?.trim() || null;
const firstArtist = (track: Track) => text(track.artists[0]);

/** Comparator for a sort (`default` is handled by the caller). Ties fall back to album order. */
export const compareBy = (sort: ViewSort) => {
    const sign = sort.dir === 'desc' ? -1 : 1;
    const byText = (a: string, b: string) => collator.compare(a, b);
    const byNumber = (a: number, b: number) => a - b;
    return (a: Track, b: Track): number => {
        switch (sort.field) {
            case 'default': return 0;
            case 'addedAt': return sign * (a.dateCreated - b.dateCreated);
            case 'title': return sign * collator.compare(displayTitle(a), displayTitle(b));
            case 'duration': return sign * (a.duration - b.duration);
            case 'artist':
                return compareOptional(firstArtist(a), firstArtist(b), byText, sign)
                    || collator.compare(a.album ?? "", b.album ?? "")
                    || albumOrder(a, b);
            case 'album':
                return compareOptional(text(a.album), text(b.album), byText, sign) || albumOrder(a, b);
            case 'year':
                return compareOptional(a.year, b.year, byNumber, sign)
                    || collator.compare(a.album ?? "", b.album ?? "")
                    || albumOrder(a, b);
        }
    };
};

/** A section of a sorted list. */
export interface SortSection {
    key: string;
    label: string;
}

const DURATION_BUCKETS: [number, string][] = [
    [120, "Under 2 min"],
    [240, "2–4 min"],
    [360, "4–6 min"],
    [600, "6–10 min"],
    [Infinity, "10 min and longer"],
];

/** The section a track falls in under a sort; null for the view's own order. */
export const sectionOf = (field: SortField): ((track: Track) => SortSection) | null => {
    switch (field) {
        case 'default': return null;
        case 'addedAt': return track => {
            const date = new Date(track.dateCreated * 1000);
            return {
                key: `${date.getFullYear()}-${date.getMonth()}`,
                label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
            };
        };
        case 'title': return track => {
            const first = displayTitle(track).trim().charAt(0).toLocaleUpperCase();
            const label = /\p{L}/u.test(first) ? first : "#";
            return { key: label, label };
        };
        case 'artist': return track => {
            const artist = firstArtist(track);
            return { key: artist?.toLowerCase() ?? "", label: artist ?? "Unknown artist" };
        };
        case 'album': return track => {
            const album = text(track.album);
            return { key: album?.toLowerCase() ?? "", label: album ?? "No album" };
        };
        case 'duration': return track => {
            const [limit, label] = DURATION_BUCKETS.find(([limit]) => track.duration < limit)!;
            return { key: String(limit), label };
        };
        case 'year': return track => ({
            key: String(track.year ?? ""),
            label: track.year != null ? String(track.year) : "Unknown year",
        });
    }
};

/** Gray text shown next to a track for a sort, when its row does not show the value already. */
export const hintOf = (field: SortField): ((track: Track) => string | null) | null => {
    switch (field) {
        case 'addedAt': return track => track.dateCreated ? formatDate(track.dateCreated) : null;
        case 'album': return track => text(track.album);
        case 'year': return track => track.year != null ? String(track.year) : null;
        default: return null;
    }
};
