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
