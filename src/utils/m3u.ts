import type { Track } from "../types";
import { sanitizeFileName } from "./fileName";
import { displayArtists, displayTitle } from "./track";

export type M3uPathMode = "relative" | "absolute";

/** One EXTINF line's display name: "Artist - Title" or just the title. */
const extInfName = (track: Track): string => {
    const title = displayTitle(track);
    const artists = displayArtists(track);
    return artists ? `${artists} - ${title}` : title;
};

/**
 * An M3U8 playlist body. Relative paths use the library's `relPath` (forward
 * slashes); absolute paths use each track's full `path`.
 */
export const buildM3u8 = (tracks: Track[], mode: M3uPathMode): string => {
    const lines = ["#EXTM3U"];
    for (const track of tracks) {
        const duration = Number.isFinite(track.duration) ? Math.max(0, Math.round(track.duration)) : -1;
        lines.push(`#EXTINF:${duration},${extInfName(track)}`);
        lines.push(mode === "relative" ? track.relPath : track.path);
    }
    return lines.join("\n") + "\n";
};

/** A safe default basename (with `.m3u8`) for the save dialog. */
export const m3uFileName = (name: string): string =>
    `${sanitizeFileName(name) || "playlist"}.m3u8`;

/** Join a directory and a file name for the dialog's `defaultPath`. */
export const joinDirFile = (dir: string, file: string): string => {
    const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
    return `${dir.replace(/[\\/]+$/, "")}${sep}${file}`;
};

/** Parent directory of a file path (keeps the path's separator style). */
export const parentDir = (filePath: string): string => {
    const normalized = filePath.replace(/\\/g, "/");
    const cut = normalized.lastIndexOf("/");
    if (cut <= 0) return "";
    const parent = normalized.slice(0, cut);
    return filePath.includes("\\") ? parent.replace(/\//g, "\\") : parent;
};

/** File stem without extension, for naming an imported playlist. */
export const fileStem = (filePath: string): string => {
    const base = filePath.replace(/^.*[/\\]/, "");
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
};

/** Path entries from an M3U/M3U8 body (comments and blanks skipped). */
export const parseM3u = (text: string): string[] => {
    const paths: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        // Network URLs are out of scope for a local library playlist.
        if (/^[a-z][a-z0-9+.-]*:/i.test(line) && !/^[a-z]:[\\/]/i.test(line)) continue;
        paths.push(line);
    }
    return paths;
};

const isAbsolutePath = (path: string): boolean =>
    /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\") || path.startsWith("/");

/** Lowercase, forward slashes, no trailing slash (except a drive root). */
export const normalizePathKey = (path: string): string => {
    let key = path.replace(/\\/g, "/").replace(/\/+$/, "");
    if (/^[a-z]:$/i.test(key)) key += "/";
    return key.toLowerCase();
};

/** Candidates for matching an M3U entry against the open library. */
const resolveCandidates = (entry: string, m3uDir: string, libraryRoot: string): string[] => {
    const out: string[] = [];
    const add = (path: string) => {
        if (path && !out.includes(path)) out.push(path);
    };
    if (isAbsolutePath(entry)) {
        add(entry);
    } else {
        const rel = entry.replace(/^[/\\]+/, "");
        if (m3uDir) add(joinDirFile(m3uDir, rel));
        if (libraryRoot) add(joinDirFile(libraryRoot, rel));
        add(rel.replace(/\\/g, "/"));
    }
    return out;
};

export interface M3uMatchResult {
    /** Library tracks in M3U order (duplicates kept if the file listed them twice). */
    tracks: Track[];
    missing: number;
}

/**
 * Match M3U path lines to library tracks. Tries absolute path, path relative to
 * the playlist file, then relative to the library root; compares against both
 * `path` and `relPath`.
 */
export const matchM3uTracks = (
    entries: string[],
    files: Track[],
    m3uPath: string,
    libraryRoot: string,
): M3uMatchResult => {
    const byKey = new Map<string, Track>();
    for (const track of files) {
        byKey.set(normalizePathKey(track.path), track);
        byKey.set(normalizePathKey(track.relPath), track);
        // Also index "libraryRoot/relPath" for absolute-looking relatives.
        if (libraryRoot) {
            byKey.set(normalizePathKey(joinDirFile(libraryRoot, track.relPath)), track);
        }
    }

    const m3uDir = parentDir(m3uPath);
    const tracks: Track[] = [];
    let missing = 0;
    for (const entry of entries) {
        let found: Track | undefined;
        for (const candidate of resolveCandidates(entry, m3uDir, libraryRoot)) {
            found = byKey.get(normalizePathKey(candidate));
            if (found) break;
        }
        if (found) tracks.push(found);
        else missing++;
    }
    return { tracks, missing };
};
