export interface Track {
    path: string;
    // Display name (file name), kept for backwards compatibility with existing UI
    name: string;
    // Core musical metadata read from the file tags
    title: string | null;
    artists: string[];
    album: string | null;
    albumArtist: string | null;
    trackNumber: number | null;
    discNumber: number | null;
    year: number | null;
    genre: string[];
    // Technical info
    duration: number;      // seconds
    bitrate: number | null;
    sampleRate: number | null;
    format: string | null; // e.g. "mp3", "flac"

    // Path to the extracted cover art file in the app data cache, if any.
    coverPath: string | null;

    // Timestamps (unix seconds).
    // dateCreated is the stable "date added" that must NOT change when metadata is edited.
    dateCreated: number;
    // Technical file mtime, used only for cache invalidation on rescan.
    fileMtime: number;
    // When the user last changed metadata through the app (0 = never).
    metadataModifiedAt: number;
}

export type SortOrder = 'name' | 'artist' | 'album' | 'date' | 'duration' | 'manual';

export interface PlayerSettings {
    volume: number;
    isShuffle: boolean;
    repeatMode: 'none' | 'all' | 'one';
    lastPath: string;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
    volume: 0.5,
    isShuffle: false,
    repeatMode: 'none',
    lastPath: ''
};