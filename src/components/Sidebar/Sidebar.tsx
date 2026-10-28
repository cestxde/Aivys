import { Fragment, useRef, type ReactNode } from "react";
import { Library, ListMusic, Tag, Heart, FolderOpen, History, TrendingUp, MicVocal, Disc3, Folder, Menu, Settings } from "lucide-react";
import { ThemedLogo } from "../ThemedLogo";
import { PlayingMark } from "../CardPlayButton/CardPlayButton";
import type { View } from "../../types";
import { t, type MessageKey } from "../../i18n";
import { useDrawerSwipe } from "../../hooks/useDrawerSwipe";
import "./Sidebar.css";

interface SidebarItem {
    label: MessageKey;
    icon: ReactNode;
    view: View;
}

const SETTINGS: SidebarItem = { label: "nav.settings", icon: <Settings size={18} />, view: { kind: "settings" } };

const FOLDERS: SidebarItem = { label: "nav.folders", icon: <Folder size={18} />, view: { kind: "folder", id: "" } };

/** Groups of items, separated by dividers. */
const SECTIONS: SidebarItem[][] = [
    [
        { label: "nav.library", icon: <Library size={18} />, view: { kind: "system", id: "library" } },
        { label: "nav.favorites", icon: <Heart size={18} />, view: { kind: "system", id: "favorites" } },
    ],
    [
        { label: "nav.playlists", icon: <ListMusic size={18} />, view: { kind: "playlists" } },
        { label: "nav.artists", icon: <MicVocal size={18} />, view: { kind: "artists" } },
        { label: "nav.albums", icon: <Disc3 size={18} />, view: { kind: "albums" } },
        { label: "nav.tags", icon: <Tag size={18} />, view: { kind: "tags" } },
        FOLDERS,
    ],
    [
        { label: "nav.mostPlayed", icon: <TrendingUp size={18} />, view: { kind: "system", id: "mostPlayed" } },
        { label: "nav.recentlyPlayed", icon: <History size={18} />, view: { kind: "system", id: "recentlyPlayed" } },
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
    /** Key of the view playback was started from ("album:<key>"), if playing. */
    playingKey: string | null;
    /** Narrow screens: the rail is a drawer, shown while this is true. */
    drawerOpen: boolean;
    onOpenDrawer: () => void;
    onCloseDrawer: () => void;
    /** Phones: a swipe right opens the drawer, a swipe left closes it. */
    swipeDrawer: boolean;
}

/** Whether playback started from `item`'s view or something under it. */
const playsFrom = (item: View, key: string | null): boolean => {
    if (!key) return false;
    switch (item.kind) {
        case "system": return key === `system:${item.id}`;
        case "playlists": return key.startsWith("playlist:");
        case "artists": return key.startsWith("artist:");
        case "albums": return key.startsWith("album:");
        case "tags": return key.startsWith("tag:");
        case "folder": return key.startsWith("folder:");
        default: return false;
    }
};

/** Whether a sidebar item is the current one (an open playlist counts as "Playlists", and so on). */
const isCurrent = (item: View, view: View): boolean => {
    switch (item.kind) {
        case "playlists": return view.kind === "playlists" || view.kind === "playlist";
        case "tags": return view.kind === "tags" || view.kind === "tag";
        case "artists": return view.kind === "artists" || view.kind === "artist";
        case "albums": return view.kind === "albums" || view.kind === "album";
        case "folder": return view.kind === "folder";
        case "settings": return view.kind === "settings";
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
 * On narrow screens (phones) a drawer over the content, opened from the
 * `MobileHeader` or a swipe right, and closed by picking something, tapping
 * beside it or a swipe left.
 */
export const Sidebar = ({
    libraryPath, onChangeLibrary, view, onViewChange, showFolders, playingKey, drawerOpen, onOpenDrawer, onCloseDrawer, swipeDrawer,
}: SidebarProps) => {
    const drawer = useRef<HTMLElement>(null);
    const backdrop = useRef<HTMLDivElement>(null);
    useDrawerSwipe(swipeDrawer, drawerOpen, drawer, backdrop, onOpenDrawer, onCloseDrawer);

    const go = (next: View) => {
        onViewChange(next);
        onCloseDrawer();
    };

    const renderItem = (item: SidebarItem) => (
        <button
            key={item.label}
            className={`sidebar-item ${isCurrent(item.view, view) ? "active" : ""}`}
            title={t(item.label)}
            aria-current={isCurrent(item.view, view) ? "page" : undefined}
            onClick={() => go(item.view)}
        >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{t(item.label)}</span>
            {playsFrom(item.view, playingKey) && <PlayingMark />}
        </button>
    );

    return (
        <>
        <div ref={backdrop} className={`sidebar-backdrop ${drawerOpen ? "open" : ""}`} onClick={onCloseDrawer} />
        <nav ref={drawer} className={`sidebar ${drawerOpen ? "open" : ""}`}>
            <div className="sidebar-brand">
                <ThemedLogo className="sidebar-logo" />
            </div>

            <button
                className="sidebar-item sidebar-library-btn"
                onClick={() => {
                    onCloseDrawer();
                    onChangeLibrary();
                }}
                title={libraryPath}
            >
                <span className="sidebar-icon"><FolderOpen size={18} /></span>
                <span className="sidebar-library-text">
                    <span className="sidebar-label">{t("nav.changeFolder")}</span>
                    {libraryPath && (
                        <span className="sidebar-folder-name">{folderName(libraryPath)}</span>
                    )}
                </span>
            </button>

            {SECTIONS.map((items, index) => (
                <Fragment key={index}>
                    <div className="sidebar-divider" />
                    {items.filter(item => item !== FOLDERS || showFolders).map(renderItem)}
                </Fragment>
            ))}

            <div className="sidebar-bottom">
                <div className="sidebar-divider" />
                {renderItem(SETTINGS)}
            </div>
        </nav>
        </>
    );
};

/** Narrow screens only: a bar above the content with the button that opens the sidebar. */
export const MobileHeader = ({ onOpenDrawer }: { onOpenDrawer: () => void }) => (
    <header className="mobile-header">
        <button className="mobile-header-menu" title={t("nav.menu")} aria-label={t("nav.menu")} onClick={onOpenDrawer}>
            <Menu size={22} />
        </button>
        <ThemedLogo className="mobile-header-logo" />
    </header>
);
