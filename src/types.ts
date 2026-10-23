export interface Track {
    path: string;
    // Path relative to the library root ("/"-separated); the key for .aivys data
    relPath: string;
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

/** Per-track state derived from the .aivys event journals (get_track_stats). */
export interface TrackStats {
    playCount: number;
    lastPlayedAt: number | null;
    // 1-5, null = unrated
    rating: number | null;
    favorite: boolean;
    favoritedAt: number | null;
    // Assigned user tag ids
    tags: string[];
}

export const EMPTY_STATS: TrackStats = {
    playCount: 0,
    lastPlayedAt: null,
    rating: null,
    favorite: false,
    favoritedAt: null,
    tags: [],
};

/** How a search result matched: as typed, via transliteration/keyboard layout, or with typos. */
export type MatchKind = 'exact' | 'translit' | 'fuzzy';

export interface SearchHit {
    relPath: string;
    kind: MatchKind;
}

/** A user-defined colored tag (tags.json); assignments are in TrackStats.tags. */
export interface UserTag {
    id: string;
    name: string;
    // "#rrggbb"
    color: string;
    createdAt: number;
    updatedAt: number;
}

/** Built-in list views. */
export type SystemView = 'library' | 'favorites' | 'recentlyPlayed' | 'mostPlayed';

/** What the main track list shows. */
export type View =
    | { kind: 'system'; id: SystemView }
    | { kind: 'playlists' }
    | { kind: 'playlist'; id: string }
    | { kind: 'tags' }
    | { kind: 'tag'; id: string };

export interface SortSpec {
    field: string;
    dir: 'asc' | 'desc';
}

export interface PlaylistItem {
    id: string;
    path: string;
    addedAt: number;
}

/** Smart-playlist condition (see docs/aivys-format.md §8.4.3). */
export interface Condition {
    field: string;
    op: string;
    value: string | number | boolean | (string | number)[];
}

export interface SmartRules {
    match: 'all' | 'any';
    conditions: Condition[];
    sort?: SortSpec;
    limit?: number | null;
}

/** A playlist as returned by the backend (removed items already hidden). */
export interface Playlist {
    id: string;
    name: string;
    type: 'manual' | 'smart';
    sort?: SortSpec;
    items?: PlaylistItem[];
    rules?: SmartRules;
    createdAt: number;
    updatedAt: number;
    // Written by a newer app version: show, but do not edit.
    readOnly: boolean;
    // Absolute path of the custom cover image, if any.
    coverPath: string | null;
}

/** One row of the track list; `itemId` is set for manual-playlist entries. */
export interface ListRow {
    key: string;
    track: Track;
    itemId?: string;
}

export type SortOrder = 'name' | 'artist' | 'album' | 'date' | 'duration' | 'manual';

export type RepeatMode = 'none' | 'all' | 'one';

export interface PlayerSettings {
    volume: number;
    isShuffle: boolean;
    repeatMode: RepeatMode;
    lastPath: string;
    // Recently opened library folders, most recent first.
    recentPaths: string[];
}

export const DEFAULT_SETTINGS: PlayerSettings = {
    volume: 0.5,
    isShuffle: false,
    repeatMode: 'none',
    lastPath: '',
    recentPaths: []
};

/** Maximum number of recent folders to remember. */
export const MAX_RECENT_PATHS = 5;

/** Push `path` to the front of the recent list (deduped, capped). */
export const addRecentPath = (recent: string[], path: string): string[] => {
    const rest = recent.filter(p => p !== path);
    return [path, ...rest].slice(0, MAX_RECENT_PATHS);
};

/** Remove `path` from the recent list. */
export const removeRecentPath = (recent: string[], path: string): string[] => {
    return recent.filter(p => p !== path);
};