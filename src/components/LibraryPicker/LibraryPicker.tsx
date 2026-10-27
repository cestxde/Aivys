import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, X } from "lucide-react";
import { t } from "../../i18n";
import { androidStorage } from "../../utils/androidStorage";
import { FolderBrowser } from "./FolderBrowser";
import "./LibraryPicker.css";

interface LibraryPickerProps {
    /** Recently opened folders (full paths), most recent first. */
    recentPaths: string[];
    /** Error to display (e.g. the last folder is gone). */
    error?: string | null;
    /** Called with a chosen folder path. */
    onOpen: (path: string) => void;
    /** Called to remove a path from the recent list. */
    onRemoveRecent: (path: string) => void;
}

/** Last path segment, used as a friendly folder name. Handles both / and \. */
const folderName = (path: string): string => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : path;
};

export const LibraryPicker = ({ recentPaths, error, onOpen, onRemoveRecent }: LibraryPickerProps) => {
    const handleChoose = async () => {
        const selected = await open({ directory: true, multiple: false });
        if (typeof selected === "string") {
            onOpen(selected);
        }
    };

    return (
        <div className="library-picker">
            <div className="library-picker-inner">
                <h1 className="library-picker-title">{t("picker.title")}</h1>
                <p className="library-picker-subtitle">
                    {t("picker.subtitle")}
                </p>

                {/* Android has no folder dialog that gives a path: an in-app browser. */}
                {androidStorage ? <FolderBrowser onOpen={onOpen} /> : (
                    <button className="library-choose-btn" onClick={handleChoose}>
                        <FolderOpen size={18} />
                        {t("picker.choose")}
                    </button>
                )}

                {error && <div className="library-picker-error">{error}</div>}

                {recentPaths.length > 0 && (
                    <div className="library-recent">
                        <div className="library-recent-title">{t("picker.recent")}</div>
                        <ul className="library-recent-list">
                            {recentPaths.map((path) => (
                                <li key={path} className="library-recent-row">
                                    <button
                                        className="library-recent-item"
                                        onClick={() => onOpen(path)}
                                        title={path}
                                    >
                                        <span className="library-recent-name">{folderName(path)}</span>
                                        <span className="library-recent-path">{path}</span>
                                    </button>
                                    <button
                                        className="library-recent-remove"
                                        onClick={() => onRemoveRecent(path)}
                                        title={t("picker.removeRecent")}
                                        aria-label={t("picker.removeRecent")}
                                    >
                                        <X size={16} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};
