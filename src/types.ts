export interface AudioFile {
    name: string;
    path: string;
    duration: number;
    modified: number;
}

export type SortOrder = 'name' | 'artist' | 'date' | 'manual';

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