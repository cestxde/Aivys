import type { SortSpec, Track } from "../types";
import { compareText, getLanguage, t, type MessageKey } from "../i18n";
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
    label: MessageKey;
    natural: ViewSort['dir'];
    asc: MessageKey;
    desc: MessageKey;
    /** Compared as text (A–Z icons) rather than numbers. */
    text: boolean;
}

export const SORT_FIELDS: SortFieldInfo[] = [
    { field: 'addedAt', label: "sort.addedAt", natural: 'desc', asc: "sort.oldestFirst", desc: "sort.newestFirst", text: false },
    { field: 'title', label: "sort.title", natural: 'asc', asc: "sort.aToZ", desc: "sort.zToA", text: true },
    { field: 'artist', label: "sort.artist", natural: 'asc', asc: "sort.aToZ", desc: "sort.zToA", text: true },
    { field: 'album', label: "sort.album", natural: 'asc', asc: "sort.aToZ", desc: "sort.zToA", text: true },
    { field: 'duration', label: "sort.duration", natural: 'asc', asc: "sort.shortestFirst", desc: "sort.longestFirst", text: false },
    { field: 'year', label: "sort.year", natural: 'desc', asc: "sort.oldestFirst", desc: "sort.newestFirst", text: false },
];

/** Name of the sort's field; `defaultLabel` names the view's own order. */
export const sortLabel = (sort: ViewSort, defaultLabel: string): string => {
    const info = SORT_FIELDS.find(info => info.field === sort.field);
    return info ? t(info.label) : defaultLabel;
};

/** What the sort's direction means, e.g. "Newest first"; the view's own order can be reversed. */
export const directionLabel = (sort: ViewSort, defaultLabel: string): string => {
    const info = SORT_FIELDS.find(info => info.field === sort.field);
    if (info) return t(info[sort.dir]);
    return sort.dir === 'asc' ? defaultLabel : t("sort.reversed", { order: defaultLabel });
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
    const byText = compareText;
    const byNumber = (a: number, b: number) => a - b;
    return (a: Track, b: Track): number => {
        switch (sort.field) {
            case 'default': return 0;
            case 'addedAt': return sign * (a.dateCreated - b.dateCreated);
            case 'title': return sign * compareText(displayTitle(a), displayTitle(b));
            case 'duration': return sign * (a.duration - b.duration);
            case 'artist':
                return compareOptional(firstArtist(a), firstArtist(b), byText, sign)
                    || compareText(a.album ?? "", b.album ?? "")
                    || albumOrder(a, b);
            case 'album':
                return compareOptional(text(a.album), text(b.album), byText, sign) || albumOrder(a, b);
            case 'year':
                return compareOptional(a.year, b.year, byNumber, sign)
                    || compareText(a.album ?? "", b.album ?? "")
                    || albumOrder(a, b);
        }
    };
};

/** A section of a sorted list. */
export interface SortSection {
    key: string;
    label: string;
}

const DURATION_BUCKETS: [number, MessageKey][] = [
    [120, "section.under2"],
    [240, "section.to4"],
    [360, "section.to6"],
    [600, "section.to10"],
    [Infinity, "section.long"],
];

/** The section a track falls in under a sort; null for the view's own order. */
export const sectionOf = (field: SortField): ((track: Track) => SortSection) | null => {
    switch (field) {
        case 'default': return null;
        case 'addedAt': return track => {
            const date = new Date(track.dateCreated * 1000);
            return {
                key: `${date.getFullYear()}-${date.getMonth()}`,
                label: date.toLocaleDateString(getLanguage(), { month: "long", year: "numeric" }),
            };
        };
        case 'title': return track => {
            const first = displayTitle(track).trim().charAt(0).toLocaleUpperCase(getLanguage());
            const label = /\p{L}/u.test(first) ? first : "#";
            return { key: label, label };
        };
        case 'artist': return track => {
            const artist = firstArtist(track);
            return { key: artist?.toLowerCase() ?? "", label: artist ?? t("common.unknownArtist") };
        };
        case 'album': return track => {
            const album = text(track.album);
            return { key: album?.toLowerCase() ?? "", label: album ?? t("section.noAlbum") };
        };
        case 'duration': return track => {
            const [limit, label] = DURATION_BUCKETS.find(([limit]) => track.duration < limit)!;
            return { key: String(limit), label: t(label) };
        };
        case 'year': return track => ({
            key: String(track.year ?? ""),
            label: track.year != null ? String(track.year) : t("section.unknownYear"),
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
