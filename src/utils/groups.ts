import type { Track } from "../types";
import { displayTitle } from "./track";
import { compareText, t } from "../i18n";

/** Tracks grouped under one artist, album or folder. */
export interface TrackGroup {
    /** Stable id within its kind (used in views). */
    key: string;
    name: string;
    /** Secondary line: the album's artist, the artist's album count, ... */
    subtitle: string | null;
    year: number | null;
    tracks: Track[];
}

// Tracks without an artist; a fixed key, so an open view survives a language change.
const UNKNOWN_ARTIST_KEY = "\u0000unknown";

const byName = (a: TrackGroup, b: TrackGroup) => compareText(a.name, b.name);

/** Covers of the group's tracks, distinct, in track order (for mosaics). */
export const groupCovers = (group: TrackGroup, max = 4): string[] =>
    [...new Set(group.tracks.flatMap(t => t.coverPath ?? []))].slice(0, max);

/** "/"-separated parent folder of a library-relative path ("" for the root). */
export const folderOf = (relPath: string): string => {
    const slash = relPath.lastIndexOf("/");
    return slash < 0 ? "" : relPath.slice(0, slash);
};

/** Album order: disc, track number, then title. */
export const compareAlbumOrder = (a: Track, b: Track): number =>
    (a.discNumber ?? 0) - (b.discNumber ?? 0) ||
    (a.trackNumber ?? 0) - (b.trackNumber ?? 0) ||
    compareText(displayTitle(a), displayTitle(b));

/** Library order of an artist's or a folder's tracks: by album, then album order. */
export const compareByAlbum = (a: Track, b: Track): number =>
    compareText(a.album ?? "", b.album ?? "") || compareAlbumOrder(a, b);

const artistKey = (name: string) => name.trim().toLowerCase();

/** One group per artist (a track with several artists is in each of them). */
export const groupArtists = (files: Track[]): TrackGroup[] => {
    const groups = new Map<string, TrackGroup>();
    for (const track of files) {
        const names = track.artists.length > 0 ? track.artists : [null];
        for (const name of names) {
            const key = name === null ? UNKNOWN_ARTIST_KEY : artistKey(name);
            if (!key) continue;
            const group = groups.get(key)
                ?? { key, name: name?.trim() ?? t("common.unknownArtist"), subtitle: null, year: null, tracks: [] };
            group.tracks.push(track);
            groups.set(key, group);
        }
    }
    for (const group of groups.values()) {
        group.tracks.sort(compareByAlbum);
        const albums = new Set(group.tracks.flatMap(t => t.album ? [t.album.toLowerCase()] : [])).size;
        group.subtitle = albums > 0 ? t("common.albums", { count: albums }) : null;
    }
    return [...groups.values()].sort(byName);
};

/**
 * Album id: its album artist and title; without an album artist the folder
 * stands in, so a compilation of many artists stays one album.
 */
const albumKey = (track: Track, album: string): string => {
    const owner = track.albumArtist?.trim().toLowerCase() || `dir:${folderOf(track.relPath)}`;
    return `${owner}\u001f${album.toLowerCase()}`;
};

/** One group per album; tracks without an album tag are left out. */
export const groupAlbums = (files: Track[]): TrackGroup[] => {
    const groups = new Map<string, TrackGroup>();
    for (const track of files) {
        const album = track.album?.trim();
        if (!album) continue;
        const key = albumKey(track, album);
        const group = groups.get(key) ?? { key, name: album, subtitle: null, year: null, tracks: [] };
        group.tracks.push(track);
        groups.set(key, group);
    }
    for (const group of groups.values()) {
        group.tracks.sort(compareAlbumOrder);
        const first = group.tracks[0];
        // Lead artists only: a guest on one track does not make it "Various artists".
        const artists = new Set(group.tracks.flatMap(t => t.artists.length > 0 ? [artistKey(t.artists[0])] : []));
        group.subtitle = first.albumArtist?.trim()
            || (artists.size === 1 ? first.artists[0] ?? null : artists.size > 1 ? t("common.variousArtists") : null);
        group.year = group.tracks.find(t => t.year != null)?.year ?? null;
    }
    return [...groups.values()].sort(byName);
};

/** Whether the library has any subfolder with tracks. */
export const hasFolders = (files: Track[]): boolean => files.some(f => f.relPath.includes("/"));

/** Tracks in `folder` or below it, in path order. */
export const folderTracks = (files: Track[], folder: string): Track[] => {
    const prefix = folder ? `${folder}/` : "";
    return files
        .filter(f => f.relPath.startsWith(prefix))
        .sort((a, b) => compareText(a.relPath, b.relPath));
};

/** Direct subfolders of `folder` that contain tracks, with all tracks below each. */
export const subfolders = (files: Track[], folder: string): TrackGroup[] => {
    const prefix = folder ? `${folder}/` : "";
    const groups = new Map<string, TrackGroup>();
    for (const track of files) {
        if (!track.relPath.startsWith(prefix)) continue;
        const rest = track.relPath.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash < 0) continue;
        const name = rest.slice(0, slash);
        const key = prefix + name;
        const group = groups.get(key) ?? { key, name, subtitle: null, year: null, tracks: [] };
        group.tracks.push(track);
        groups.set(key, group);
    }
    return [...groups.values()].sort(byName);
};
