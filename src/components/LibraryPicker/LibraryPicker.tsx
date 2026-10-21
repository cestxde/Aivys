import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, X } from "lucide-react";
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
        // Folder picking is desktop-only; on mobile this returns null.
        const selected = await open({ directory: true, multiple: false });
        if (typeof selected === "string") {
            onOpen(selected);
        }
    };

    return (
        <div className="library-picker">
            <div className="library-picker-inner">
                <h1 className="library-picker-title">Choose your music folder</h1>
                <p className="library-picker-subtitle">
                    Pick a folder and Aivys will scan it for audio files.
                </p>

                <button className="library-choose-btn" onClick={handleChoose}>
                    <FolderOpen size={18} />
                    Choose folder
                </button>

                {error && <div className="library-picker-error">{error}</div>}

                {recentPaths.length > 0 && (
                    <div className="library-recent">
                        <div className="library-recent-title">Recent</div>
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
                                        title="Remove from recent"
                                        aria-label="Remove from recent"
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
