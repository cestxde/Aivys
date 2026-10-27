/**
 * Access to the music folders on Android, given to the page by the app's
 * activity (`StorageAccess.kt`); null elsewhere. The library is read and
 * written by its real paths, so the app needs "All files access".
 */
interface AndroidStorage {
    /** Whether the app can read and write the shared storage. */
    granted(): boolean;
    /** Opens the system page (or dialog) that grants it. */
    request(): void;
    /** The shared storage's root, e.g. /storage/emulated/0. */
    root(): string;
    /** The mounted volumes (the phone's own, a memory card) as JSON `StorageVolume[]`. */
    volumes(): string;
}

/** A place music can be on: the phone's own storage or a memory card. */
export interface StorageVolume {
    path: string;
    name: string;
    removable: boolean;
}

export const androidStorage: AndroidStorage | null =
    (window as unknown as { AivysStorage?: AndroidStorage }).AivysStorage ?? null;

/** The mounted volumes, the phone's own first; just its root if they cannot be read. */
export const storageVolumes = (): StorageVolume[] => {
    if (!androidStorage) return [];
    try {
        const volumes = JSON.parse(androidStorage.volumes()) as StorageVolume[];
        if (volumes.length > 0) return volumes;
    } catch {
        // An older app without volumes(): the phone's own storage only.
    }
    return [{ path: androidStorage.root(), name: "", removable: false }];
};
