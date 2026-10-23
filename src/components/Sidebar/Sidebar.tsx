import { Fragment, type ReactNode } from "react";
import { Library, ListMusic, Tag, Heart, FolderOpen, History, TrendingUp, MicVocal, Disc3, Folder } from "lucide-react";
import { ThemedLogo } from "../ThemedLogo";
import type { View } from "../../types";
import "./Sidebar.css";

interface SidebarItem {
    label: string;
    icon: ReactNode;
    view: View;
}

const FOLDERS: SidebarItem = { label: "Folders", icon: <Folder size={18} />, view: { kind: "folder", id: "" } };

/** Groups of items, separated by dividers. */
const SECTIONS: SidebarItem[][] = [
    [
        { label: "Library", icon: <Library size={18} />, view: { kind: "system", id: "library" } },
        { label: "Favorites", icon: <Heart size={18} />, view: { kind: "system", id: "favorites" } },
    ],
    [
        { label: "Playlists", icon: <ListMusic size={18} />, view: { kind: "playlists" } },
        { label: "Artists", icon: <MicVocal size={18} />, view: { kind: "artists" } },
        { label: "Albums", icon: <Disc3 size={18} />, view: { kind: "albums" } },
        { label: "Tags", icon: <Tag size={18} />, view: { kind: "tags" } },
        FOLDERS,
    ],
    [
        { label: "Most played", icon: <TrendingUp size={18} />, view: { kind: "system", id: "mostPlayed" } },
        { label: "Recently played", icon: <History size={18} />, view: { kind: "system", id: "recentlyPlayed" } },
    ],
];

interface SidebarProps {
    /** Full path of the currently open library folder. */
    libraryPath: string;
    /** Called when the user wants to switch to another folder. */
    onChangeLibrary: () => void;
    view: View;
    onViewChange: (view: View) => void;
    /** The library has subfolders with tracks. */
    showFolders: boolean;
}

/** Whether a sidebar item is the current one (an open playlist counts as "Playlists", and so on). */
const isCurrent = (item: View, view: View): boolean => {
    switch (item.kind) {
        case "playlists": return view.kind === "playlists" || view.kind === "playlist";
        case "tags": return view.kind === "tags" || view.kind === "tag";
        case "artists": return view.kind === "artists" || view.kind === "artist";
        case "albums": return view.kind === "albums" || view.kind === "album";
        case "folder": return view.kind === "folder";
        case "system": return view.kind === "system" && item.id === view.id;
        default: return false;
    }
};

/** Last path segment, falling back to the full path. */
const folderName = (path: string): string => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : path;
};

/**
 * Left navigation rail: brand, the current library folder + a "change folder"
 * action, and the views in groups: the library, its collections, history.
 * Hidden on narrow layouts by CSS, keeping the track list as the primary view.
 */
export const Sidebar = ({ libraryPath, onChangeLibrary, view, onViewChange, showFolders }: SidebarProps) => {
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

            {SECTIONS.map((items, index) => (
                <Fragment key={index}>
                    <div className="sidebar-divider" />
                    {items.filter(item => item !== FOLDERS || showFolders).map((item) => (
                        <button
                            key={item.label}
                            className={`sidebar-item ${isCurrent(item.view, view) ? "active" : ""}`}
                            title={item.label}
                            aria-current={isCurrent(item.view, view) ? "page" : undefined}
                            onClick={() => onViewChange(item.view)}
                        >
                            <span className="sidebar-icon">{item.icon}</span>
                            <span className="sidebar-label">{item.label}</span>
                        </button>
                    ))}
                </Fragment>
            ))}
        </nav>
    );
};
