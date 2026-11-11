import type { Track } from "../types";

/** Whether `ch` is forbidden in a Windows file name (controls or `<>:"/\|?*`). */
const isForbiddenChar = (ch: string): boolean => {
    const code = ch.charCodeAt(0);
    return code < 32 || '<>:"/\\|?*'.includes(ch);
};

/** Strip characters a file name may not have, and trim spaces/dots at the ends. */
export const sanitizeFileName = (name: string): string =>
    [...name].filter(ch => !isForbiddenChar(ch)).join("").replace(/^[\s.]+|[\s.]+$/g, "");

/** The extension of `name`, including the leading dot (or "" if none). */
const extensionOf = (name: string): string => {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(i) : "";
};

/** `name` without its last extension. */
const stemOf = (name: string): string => {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
};

/**
 * Suggested basename from the track's tags: `Artist - Title.ext`.
 * Returns null when there is no title to build from.
 */
export const fileNameFromTags = (track: Track): string | null => {
    const title = track.title?.trim();
    if (!title) return null;
    const artist = track.artistLine.trim();
    const body = sanitizeFileName(artist ? `${artist} - ${title}` : title);
    if (!body) return null;
    return body + extensionOf(track.name);
};

/** One way to split a file name into artist / title (and maybe a track number). */
export interface NameVariant {
    artist: string;
    title: string;
    trackNumber?: number;
}

const SEPARATORS = [" - ", " – ", " — "] as const;

/** Leading track number forms: `01`, `01.`, `01 -`, `01. `. */
const LEADING_NUMBER = /^(?:(\d{1,3})\s*[-.)]\s*|\b(\d{1,3})\s+)/;

/**
 * Candidate artist/title splits of the file's basename. Each occurrence of a
 * dash-like separator is a cut point (dashes also appear inside names).
 */
export const parseFileNameVariants = (track: Track): NameVariant[] => {
    let stem = stemOf(track.name).trim();
    if (!stem) return [];

    let trackNumber: number | undefined;
    const numbered = stem.match(LEADING_NUMBER);
    if (numbered) {
        const n = Number(numbered[1] ?? numbered[2]);
        if (Number.isFinite(n) && n > 0) {
            trackNumber = n;
            stem = stem.slice(numbered[0].length).trim();
        }
    }

    const seen = new Set<string>();
    const variants: NameVariant[] = [];

    const add = (artist: string, title: string) => {
        const a = artist.trim();
        const t = title.trim();
        if (!a || !t) return;
        const key = `${a}\0${t}\0${trackNumber ?? ""}`;
        if (seen.has(key)) return;
        seen.add(key);
        variants.push(trackNumber !== undefined ? { artist: a, title: t, trackNumber } : { artist: a, title: t });
    };

    for (const sep of SEPARATORS) {
        let from = 0;
        while (from < stem.length) {
            const at = stem.indexOf(sep, from);
            if (at < 0) break;
            add(stem.slice(0, at), stem.slice(at + sep.length));
            from = at + 1;
        }
    }

    return variants;
};

/**
 * Best automatic split of the file name: prefer a variant whose artist matches
 * the track's current artist line, otherwise the first cut.
 */
export const preferredFileNameVariant = (track: Track): NameVariant | null => {
    const variants = parseFileNameVariants(track);
    if (variants.length === 0) return null;
    const artist = track.artistLine.trim().toLowerCase();
    if (artist) {
        const match = variants.find(variant => variant.artist.toLowerCase() === artist);
        if (match) return match;
    }
    return variants[0];
};
