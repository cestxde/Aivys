import type { Track, TrackStats } from "../types";

export type HiddenLevel = "library" | "everywhere";

export const hiddenLevelOf = (stats: TrackStats | undefined): HiddenLevel | null =>
    stats?.hidden ?? null;

export const isHiddenEverywhere = (stats: TrackStats | undefined): boolean =>
    hiddenLevelOf(stats) === "everywhere";

export const isHiddenFromLibrary = (stats: TrackStats | undefined): boolean => {
    const level = hiddenLevelOf(stats);
    return level === "library" || level === "everywhere";
};

/** Tracks visible outside the Hidden view (everywhere-hidden left out). */
export const browseTracks = (files: Track[], stats: Record<string, TrackStats>): Track[] =>
    files.filter(track => !isHiddenEverywhere(stats[track.relPath]));

export const filterSmartPaths = (paths: string[], stats: Record<string, TrackStats>): string[] =>
    paths.filter(path => !isHiddenEverywhere(stats[path]));