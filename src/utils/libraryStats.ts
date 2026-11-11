import type { Track, TrackStats } from "../types";
import { artistKey } from "./groups";

/** How long without a play before a track shows up in "worth revisiting". */
export const FORGOTTEN_AFTER_SEC = 90 * 24 * 60 * 60;

/** Rolling windows for the stats period switch. */
export type StatsPeriod = "day" | "month" | "year" | "all";

export const STATS_PERIODS: StatsPeriod[] = ["day", "month", "year", "all"];

/** Unix seconds at the start of a rolling window, or `null` for all time. */
export const sinceOf = (period: StatsPeriod, nowSec = Math.floor(Date.now() / 1000)): number | null => {
    switch (period) {
        case "day": return nowSec - 24 * 60 * 60;
        case "month": return nowSec - 30 * 24 * 60 * 60;
        case "year": return nowSec - 365 * 24 * 60 * 60;
        case "all": return null;
    }
};

/** Listening-time windows for the hours/days dropdown on the stats page. */
export type ListenRange =
    | "1h" | "6h" | "12h" | "24h"
    | "7d" | "30d" | "90d"
    | "all";

export const LISTEN_HOUR_RANGES: ListenRange[] = ["1h", "6h", "12h", "24h"];
export const LISTEN_DAY_RANGES: ListenRange[] = ["7d", "30d", "90d", "all"];

/** Unix seconds at the start of a listening window, or `null` for all time. */
export const listenSinceOf = (
    range: ListenRange,
    nowSec = Math.floor(Date.now() / 1000),
): number | null => {
    switch (range) {
        case "1h": return nowSec - 60 * 60;
        case "6h": return nowSec - 6 * 60 * 60;
        case "12h": return nowSec - 12 * 60 * 60;
        case "24h": return nowSec - 24 * 60 * 60;
        case "7d": return nowSec - 7 * 24 * 60 * 60;
        case "30d": return nowSec - 30 * 24 * 60 * 60;
        case "90d": return nowSec - 90 * 24 * 60 * 60;
        case "all": return null;
    }
};

/** Whole minutes from a total of listening seconds. */
export const listenMinutesOf = (seconds: number): number => Math.floor(Math.max(0, seconds) / 60);

export interface RankedTrack {
    track: Track;
    plays: number;
    lastPlayedAt: number | null;
}

export interface RankedArtist {
    key: string;
    name: string;
    plays: number;
    tracks: number;
}

export interface LibraryOverview {
    tracks: number;
    plays: number;
    favorites: number;
    topTracks: RankedTrack[];
    topArtists: RankedArtist[];
    forgotten: RankedTrack[];
}

export const STATS_TOP = 10;
export const STATS_PREVIEW = 3;

/**
 * Overview numbers and rankings. `periodPlays` is per-path counts for the
 * chosen window (`null` = use all-time `playCount` from `stats`).
 */
export const libraryOverview = (
    files: Track[],
    stats: Record<string, TrackStats>,
    periodPlays: Record<string, number> | null = null,
    nowSec = Math.floor(Date.now() / 1000),
): LibraryOverview => {
    let favorites = 0;
    const ranked: RankedTrack[] = [];
    const artists = new Map<string, RankedArtist>();
    let plays = 0;

    for (const track of files) {
        const st = stats[track.relPath];
        if (st?.favorite) favorites += 1;

        const count = periodPlays ? (periodPlays[track.relPath] ?? 0) : (st?.playCount ?? 0);
        plays += count;

        if (count > 0) {
            ranked.push({
                track,
                plays: count,
                lastPlayedAt: st?.lastPlayedAt ?? null,
            });
            for (const name of track.artists) {
                const key = artistKey(name);
                if (!key) continue;
                const row = artists.get(key);
                if (row) {
                    row.plays += count;
                    row.tracks += 1;
                } else {
                    artists.set(key, { key, name: name.trim(), plays: count, tracks: 1 });
                }
            }
        }
    }

    // Plays of paths no longer in the library still count toward the total.
    if (periodPlays) {
        const known = new Set(files.map(track => track.relPath));
        for (const [path, count] of Object.entries(periodPlays)) {
            if (!known.has(path)) plays += count;
        }
    }

    const byPlays = (a: RankedTrack, b: RankedTrack) =>
        b.plays - a.plays || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0);

    const topTracks = [...ranked].sort(byPlays).slice(0, STATS_TOP);
    const topArtists = [...artists.values()]
        .sort((a, b) => b.plays - a.plays || b.tracks - a.tracks || a.name.localeCompare(b.name))
        .slice(0, STATS_TOP);

    // Always from all-time last play, not the selected window.
    const cutoff = nowSec - FORGOTTEN_AFTER_SEC;
    const forgotten = files
        .flatMap(track => {
            const st = stats[track.relPath];
            const count = st?.playCount ?? 0;
            const last = st?.lastPlayedAt ?? null;
            if (count <= 0 || last === null || last >= cutoff) return [];
            return [{ track, plays: count, lastPlayedAt: last }];
        })
        .sort(byPlays)
        .slice(0, STATS_TOP);

    return { tracks: files.length, plays, favorites, topTracks, topArtists, forgotten };
};
