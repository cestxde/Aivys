import { useState } from "react";
import { LayoutGrid, List, MoreVertical, Plus, Sparkles } from "lucide-react";
import type { Playlist, Track } from "../../types";
import { PlaylistCover } from "../PlaylistCover/PlaylistCover";
import "./PlaylistsPage.css";

export type PlaylistsLayout = "grid" | "list";

interface PlaylistsPageProps {
    playlists: Playlist[];
    /** Library tracks by relative path, for member covers and counts. */
    tracksByPath: Map<string, Track>;
    layout: PlaylistsLayout;
    onLayoutChange: (layout: PlaylistsLayout) => void;
    onOpen: (playlist: Playlist) => void;
    onOpenMenu: (playlist: Playlist, x: number, y: number) => void;
    onCreate: () => void;
    onCreateSmart: () => void;
}

const memberCovers = (playlist: Playlist, tracksByPath: Map<string, Track>): string[] =>
    (playlist.items ?? []).flatMap(item => tracksByPath.get(item.path)?.coverPath ?? []);

const describe = (playlist: Playlist): string => {
    if (playlist.type === "smart") return "Smart playlist";
    const count = playlist.items?.length ?? 0;
    return `${count} ${count === 1 ? "track" : "tracks"}`;
};

/** All playlists of the library, as a grid of cards or a list. */
export const PlaylistsPage = ({
    playlists,
    tracksByPath,
    layout,
    onLayoutChange,
    onOpen,
    onOpenMenu,
    onCreate,
    onCreateSmart,
}: PlaylistsPageProps) => {
    const [filter, setFilter] = useState("");
    const query = filter.trim().toLowerCase();
    const shown = [...playlists]
        .filter(p => !query || p.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));

    const menuButton = (playlist: Playlist) => (
        <button
            className="playlists-menu-button"
            title="More"
            aria-haspopup="menu"
            onClick={(e) => {
                e.stopPropagation();
                const box = e.currentTarget.getBoundingClientRect();
                onOpenMenu(playlist, box.right - 200, box.bottom + 2);
            }}
        >
            <MoreVertical size={16} />
        </button>
    );

    return (
        <div className="playlists-page">
            <div className="playlists-toolbar">
                <h1 className="playlists-title">Playlists</h1>
                <input
                    className="search-input playlists-filter"
                    placeholder="Filter playlists..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <div className="playlists-layout" role="group" aria-label="Layout">
                    <button
                        className={layout === "grid" ? "active" : ""}
                        title="Grid"
                        aria-pressed={layout === "grid"}
                        onClick={() => onLayoutChange("grid")}
                    >
                        <LayoutGrid size={16} />
                    </button>
                    <button
                        className={layout === "list" ? "active" : ""}
                        title="List"
                        aria-pressed={layout === "list"}
                        onClick={() => onLayoutChange("list")}
                    >
                        <List size={16} />
                    </button>
                </div>
                <button className="toolbar-button shuffle-button playlists-create" onClick={onCreateSmart}>
                    <Sparkles size={14} /> Smart playlist
                </button>
                <button className="toolbar-button play-button playlists-create" onClick={onCreate}>
                    <Plus size={14} /> New playlist
                </button>
            </div>

            {shown.length === 0 ? (
                <div className="playlists-empty">
                    {playlists.length === 0
                        ? "No playlists yet. Create one, or right-click a track and choose \"Add to…\"."
                        : "No playlists match the filter."}
                </div>
            ) : layout === "grid" ? (
                <div className="playlists-grid">
                    {shown.map(playlist => (
                        <div
                            key={playlist.id}
                            className="playlist-card"
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpen(playlist)}
                            onKeyDown={(e) => e.key === "Enter" && onOpen(playlist)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                onOpenMenu(playlist, e.clientX, e.clientY);
                            }}
                        >
                            <PlaylistCover
                                playlist={playlist}
                                memberCovers={memberCovers(playlist, tracksByPath)}
                                size={160}
                                className="playlist-card-cover"
                            />
                            <div className="playlist-card-footer">
                                <div className="playlist-card-text">
                                    <span className="playlist-card-name">{playlist.name}</span>
                                    <span className="playlist-card-meta">{describe(playlist)}</span>
                                </div>
                                {menuButton(playlist)}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="music-grid playlists-list">
                    {shown.map(playlist => (
                        <div
                            key={playlist.id}
                            className="audio-item playlist-row"
                            onClick={() => onOpen(playlist)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                onOpenMenu(playlist, e.clientX, e.clientY);
                            }}
                        >
                            <PlaylistCover
                                playlist={playlist}
                                memberCovers={memberCovers(playlist, tracksByPath)}
                                size={36}
                            />
                            <div className="track-main-info">
                                <span className="track-title">{playlist.name}</span>
                                <span className="track-artist">{describe(playlist)}</span>
                            </div>
                            {menuButton(playlist)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
