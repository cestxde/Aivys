import { useState, type ComponentType, type CSSProperties } from "react";
import { LayoutGrid, List, MoreVertical, Plus, Sparkles } from "lucide-react";
import type { Playlist, SystemView, Track } from "../../types";
import { PlaylistCover } from "../PlaylistCover/PlaylistCover";
import { CardPlayButton } from "../CardPlayButton/CardPlayButton";
import { t } from "../../i18n";
import "./PlaylistsPage.css";

export type PlaylistsLayout = "grid" | "list";

/** A built-in playlist pinned above the user's playlists. */
export interface PinnedPlaylist {
    id: SystemView;
    name: string;
    icon: ComponentType<{ size?: number }>;
    /** Tile color. */
    color: string;
    count: number;
}

interface PlaylistsPageProps {
    pinned: PinnedPlaylist[];
    playlists: Playlist[];
    /** Library tracks by relative path, for member covers and counts. */
    tracksByPath: Map<string, Track>;
    layout: PlaylistsLayout;
    onLayoutChange: (layout: PlaylistsLayout) => void;
    onOpenPinned: (id: SystemView) => void;
    onPlayPinned: (id: SystemView) => void;
    onOpen: (playlist: Playlist) => void;
    onPlay: (playlist: Playlist) => void;
    onOpenMenu: (playlist: Playlist, x: number, y: number) => void;
    onCreate: () => void;
    onCreateSmart: () => void;
}

const memberCovers = (playlist: Playlist, tracksByPath: Map<string, Track>): string[] =>
    (playlist.items ?? []).flatMap(item => tracksByPath.get(item.path)?.coverPath ?? []);

const trackCount = (count: number) => t("common.tracks", { count });

const describe = (playlist: Playlist): string =>
    playlist.type === "smart" ? t("playlist.kindSmart") : trackCount(playlist.items?.length ?? 0);

/** Grid / list switch shared by the collection pages. */
export const LayoutToggle = ({ layout, onChange }: { layout: PlaylistsLayout; onChange: (layout: PlaylistsLayout) => void }) => (
    <div className="playlists-layout" role="group" aria-label={t("common.layout")}>
        <button
            className={layout === "grid" ? "active" : ""}
            title={t("common.grid")}
            aria-pressed={layout === "grid"}
            onClick={() => onChange("grid")}
        >
            <LayoutGrid size={16} />
        </button>
        <button
            className={layout === "list" ? "active" : ""}
            title={t("common.list")}
            aria-pressed={layout === "list"}
            onClick={() => onChange("list")}
        >
            <List size={16} />
        </button>
    </div>
);

/** Icon tile of a pinned playlist. */
const PinnedCover = ({ item, size }: { item: PinnedPlaylist; size?: number }) => {
    const Icon = item.icon;
    return (
        <div
            className="pinned-cover"
            style={{ "--pinned-color": item.color, width: size, height: size } as CSSProperties}
        >
            <Icon size={size ? Math.round(size * 0.45) : 36} />
        </div>
    );
};

/** All playlists of the library, as a grid of cards or a list, built-in ones first. */
export const PlaylistsPage = ({
    pinned,
    playlists,
    tracksByPath,
    layout,
    onLayoutChange,
    onOpenPinned,
    onPlayPinned,
    onOpen,
    onPlay,
    onOpenMenu,
    onCreate,
    onCreateSmart,
}: PlaylistsPageProps) => {
    const [filter, setFilter] = useState("");
    const query = filter.trim().toLowerCase();
    const matches = (name: string) => !query || name.toLowerCase().includes(query);
    const shownPinned = pinned.filter(item => matches(item.name));
    const shown = [...playlists]
        .filter(p => matches(p.name))
        .sort((a, b) => a.name.localeCompare(b.name));

    const actions = (playlist: Playlist) => (
        <>
            <CardPlayButton onPlay={() => onPlay(playlist)} />
            {menuButton(playlist)}
        </>
    );

    const menuButton = (playlist: Playlist) => (
        <button
            className="playlists-menu-button"
            title={t("common.more")}
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

    const pinnedSection = shownPinned.length > 0 && (layout === "grid" ? (
        <div className="pinned-grid">
            {shownPinned.map(item => (
                <div
                    key={item.id}
                    className="playlist-card pinned-card card-hover"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenPinned(item.id)}
                    onKeyDown={(e) => e.key === "Enter" && onOpenPinned(item.id)}
                >
                    <PinnedCover item={item} />
                    <div className="playlist-card-footer">
                        <div className="playlist-card-text">
                            <span className="playlist-card-name">{item.name}</span>
                            <span className="playlist-card-meta">{trackCount(item.count)}</span>
                        </div>
                        {item.count > 0 && <CardPlayButton onPlay={() => onPlayPinned(item.id)} />}
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <div className="music-grid playlists-list">
            {shownPinned.map(item => (
                <div key={item.id} className="audio-item playlist-row card-hover" onClick={() => onOpenPinned(item.id)}>
                    <PinnedCover item={item} size={48} />
                    <div className="track-main-info">
                        <span className="track-title">{item.name}</span>
                        <span className="track-artist">{trackCount(item.count)}</span>
                    </div>
                    {item.count > 0 && <CardPlayButton onPlay={() => onPlayPinned(item.id)} />}
                </div>
            ))}
        </div>
    ));

    return (
        <div className="playlists-page">
            <div className="playlists-toolbar">
                <h1 className="playlists-title">{t("nav.playlists")}</h1>
                <input
                    className="search-input playlists-filter"
                    placeholder={t("playlists.filter")}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <LayoutToggle layout={layout} onChange={onLayoutChange} />
                <button className="toolbar-button shuffle-button playlists-create" onClick={onCreateSmart}>
                    <Sparkles size={14} /> {t("playlists.newSmart")}
                </button>
                <button className="toolbar-button play-button playlists-create" onClick={onCreate}>
                    <Plus size={14} /> {t("playlists.new")}
                </button>
            </div>

            {pinnedSection}

            {shownPinned.length > 0 && <div className="playlists-section-label">{t("playlists.yours")}</div>}

            {shown.length === 0 ? (
                <div className="playlists-empty">
                    {playlists.length === 0
                        ? t("playlists.empty")
                        : t("playlists.noMatch")}
                </div>
            ) : layout === "grid" ? (
                <div className="playlists-grid">
                    {shown.map(playlist => (
                        <div
                            key={playlist.id}
                            className="playlist-card card-hover"
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
                                {actions(playlist)}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="music-grid playlists-list">
                    {shown.map(playlist => (
                        <div
                            key={playlist.id}
                            className="audio-item playlist-row card-hover"
                            onClick={() => onOpen(playlist)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                onOpenMenu(playlist, e.clientX, e.clientY);
                            }}
                        >
                            <PlaylistCover
                                playlist={playlist}
                                memberCovers={memberCovers(playlist, tracksByPath)}
                                size={48}
                            />
                            <div className="track-main-info">
                                <span className="track-title">{playlist.name}</span>
                                <span className="track-artist">{describe(playlist)}</span>
                            </div>
                            {actions(playlist)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
