import type { ReactNode } from "react";
import { Library, ListMusic, Tag, Heart, FolderOpen, History, TrendingUp } from "lucide-react";
import { ThemedLogo } from "../ThemedLogo";
import type { LibraryView } from "../../types";
import "./Sidebar.css";

interface SidebarItem {
    label: string;
    icon: ReactNode;
    /** The view the item opens; items without one are not implemented yet. */
    view?: LibraryView;
}

const ITEMS: SidebarItem[] = [
    { label: "Library", icon: <Library size={18} />, view: "library" },
    { label: "Favorites", icon: <Heart size={18} />, view: "favorites" },
    { label: "Recently played", icon: <History size={18} />, view: "recentlyPlayed" },
    { label: "Most played", icon: <TrendingUp size={18} />, view: "mostPlayed" },
    { label: "Playlists", icon: <ListMusic size={18} /> },
    { label: "Tags", icon: <Tag size={18} /> },
];

interface SidebarProps {
    /** Full path of the currently open library folder. */
    libraryPath: string;
    /** Called when the user wants to switch to another folder. */
    onChangeLibrary: () => void;
    view: LibraryView;
    onViewChange: (view: LibraryView) => void;
}

/** Last path segment, falling back to the full path. */
const folderName = (path: string): string => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : path;
};

/**
 * Left navigation rail: brand, the current library folder + a "change folder"
 * action, the list views, and (disabled) placeholders for upcoming sections.
 * Hidden on narrow layouts by CSS, keeping the track list as the primary view.
 */
export const Sidebar = ({ libraryPath, onChangeLibrary, view, onViewChange }: SidebarProps) => {
    return (
        <nav className="sidebar">
            <div className="sidebar-brand">
                <ThemedLogo className="sidebar-logo" />
            </div>

            <button
                className="sidebar-item sidebar-library-btn"
                onClick={onChangeLibrary}
                title={libraryPath}
            >
                <span className="sidebar-icon"><FolderOpen size={18} /></span>
                <span className="sidebar-library-text">
                    <span className="sidebar-label">Change folder</span>
                    {libraryPath && (
                        <span className="sidebar-folder-name">{folderName(libraryPath)}</span>
                    )}
                </span>
            </button>

            <div className="sidebar-divider" />

            {ITEMS.map((item) => (
                <button
                    key={item.label}
                    className={`sidebar-item ${item.view === view ? "active" : ""}`}
                    disabled={!item.view}
                    title={item.view ? item.label : `${item.label} (coming soon)`}
                    aria-current={item.view === view ? "page" : undefined}
                    onClick={() => item.view && onViewChange(item.view)}
                >
                    <span className="sidebar-icon">{item.icon}</span>
                    <span className="sidebar-label">{item.label}</span>
                </button>
            ))}
        </nav>
    );
};
