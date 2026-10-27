import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, Folder, FolderCheck, HardDrive, ShieldCheck, Smartphone } from "lucide-react";
import { androidStorage, storageVolumes, type StorageVolume } from "../../utils/androidStorage";
import { t } from "../../i18n";

interface FolderBrowserProps {
    /** Called with the chosen folder path. */
    onOpen: (path: string) => void;
}

/** What the browser shows for `path`: its folders, or why it cannot. */
interface Listing {
    path: string;
    folders: string[] | null;
    error: string | null;
}

const volumeName = (volume: StorageVolume) =>
    volume.name || (volume.removable ? t("picker.android.card") : t("picker.android.storage"));

/**
 * Choosing the library folder on Android, which has no folder dialog that
 * gives a path: asks for "All files access" first, then walks the storage
 * volumes (the phone's own, a memory card) from their roots.
 */
export const FolderBrowser = ({ onOpen }: FolderBrowserProps) => {
    const [volumes] = useState(storageVolumes);
    const [granted, setGranted] = useState(() => androidStorage?.granted() ?? true);
    // null: the list of volumes (with only one, its root instead).
    const [path, setPath] = useState<string | null>(volumes.length === 1 ? volumes[0].path : null);
    const [listing, setListing] = useState<Listing | null>(null);

    // Access is granted on a system page: check again when the app comes back.
    useEffect(() => {
        const check = () => {
            if (document.visibilityState === "visible") setGranted(androidStorage?.granted() ?? true);
        };
        document.addEventListener("visibilitychange", check);
        window.addEventListener("focus", check);
        return () => {
            document.removeEventListener("visibilitychange", check);
            window.removeEventListener("focus", check);
        };
    }, []);

    useEffect(() => {
        if (!granted || path === null) return;
        let cancelled = false;
        invoke<string[]>("list_folders", { path })
            .then(folders => !cancelled && setListing({ path, folders, error: null }))
            .catch(e => !cancelled && setListing({ path, folders: null, error: String(e) }));
        return () => {
            cancelled = true;
        };
    }, [granted, path]);

    if (!granted) {
        return (
            <div className="folder-browser">
                <p className="folder-browser-note">{t("picker.android.needAccess")}</p>
                <button className="library-choose-btn" onClick={() => androidStorage?.request()}>
                    <ShieldCheck size={18} />
                    {t("picker.android.grant")}
                </button>
            </div>
        );
    }

    if (path === null) {
        return (
            <div className="folder-browser">
                <div className="folder-browser-path">{t("picker.android.where")}</div>
                <div className="folder-browser-list">
                    {volumes.map(volume => (
                        <button key={volume.path} className="folder-browser-item" onClick={() => setPath(volume.path)}>
                            {volume.removable ? <HardDrive size={18} /> : <Smartphone size={18} />}
                            <span>{volumeName(volume)}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    const volume = volumes.find(v => path === v.path || path.startsWith(`${v.path}/`)) ?? volumes[0];
    const atVolumeRoot = path === volume.path;
    // Up from a volume's root: the list of volumes, when there are several.
    const parent = atVolumeRoot
        ? (volumes.length > 1 ? null : undefined)
        : path.slice(0, path.lastIndexOf("/")) || "/";
    const shown = listing?.path === path ? listing : null;
    const label = atVolumeRoot ? volumeName(volume) : `${volumeName(volume)} / ${path.slice(volume.path.length + 1)}`;

    return (
        <div className="folder-browser">
            <div className="folder-browser-path" title={path}>{label}</div>
            <div className="folder-browser-list">
                {parent !== undefined && (
                    <button className="folder-browser-item" onClick={() => setPath(parent)}>
                        <ArrowUp size={18} />
                        <span>{t("picker.android.up")}</span>
                    </button>
                )}
                {shown?.folders?.map(name => (
                    <button key={name} className="folder-browser-item" onClick={() => setPath(`${path}/${name}`)}>
                        <Folder size={18} />
                        <span>{name}</span>
                    </button>
                ))}
                {shown?.folders?.length === 0 && <div className="folder-browser-empty">{t("picker.android.noFolders")}</div>}
                {shown?.error && <div className="library-picker-error">{shown.error}</div>}
            </div>
            <button className="library-choose-btn" onClick={() => onOpen(path)}>
                <FolderCheck size={18} />
                {t("picker.android.open")}
            </button>
        </div>
    );
};
