import { useLayoutEffect, useRef, useState } from "react";
import { Disc3 } from "lucide-react";
import type { TrackGroup } from "../../utils/groups";
import { groupCovers } from "../../utils/groups";
import { CoverMosaic } from "../PlaylistCover/PlaylistCover";
import { CardPlayButton, PlayingMark } from "../CardPlayButton/CardPlayButton";
import { t } from "../../i18n";
import "../PlaylistsPage/PlaylistsPage.css";
import "./AlbumStrip.css";

interface AlbumStripProps {
    albums: TrackGroup[];
    /** Key of the album playback was started from, to highlight it. */
    playingKey: string | null;
    onOpen: (album: TrackGroup) => void;
    onPlay: (album: TrackGroup) => void;
    onOpenMenu: (album: TrackGroup, x: number, y: number) => void;
}

/** Cards of an artist's albums above the tracks: one row, all on demand. */
export const AlbumStrip = ({ albums, playingKey, onOpen, onPlay, onOpenMenu }: AlbumStripProps) => {
    const [expanded, setExpanded] = useState(false);
    const [overflows, setOverflows] = useState(false);
    const gridRef = useRef<HTMLDivElement>(null);

    // Collapsed, the grid is cut to the height of one card (cards grow with
    // the column width); note whether that hides any.
    useLayoutEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const check = () => {
            const card = grid.firstElementChild as HTMLElement | null;
            const row = card?.offsetHeight ?? 0;
            grid.style.maxHeight = expanded || !row ? "" : `${row}px`;
            setOverflows(row > 0 && grid.scrollHeight > row + 1);
        };
        check();
        const resize = new ResizeObserver(check);
        resize.observe(grid);
        return () => resize.disconnect();
    }, [albums, expanded]);

    return (
        <section className="album-strip">
            <div className="album-strip-header">
                <span className="album-strip-title">
                    {t("nav.albums")} <span className="album-strip-count">{albums.length}</span>
                </span>
                {(overflows || expanded) && (
                    <button className="album-strip-toggle" onClick={() => setExpanded(!expanded)}>
                        {expanded ? t("group.showLess") : t("group.showAll")}
                    </button>
                )}
            </div>
            <div ref={gridRef} className={`album-strip-grid ${expanded ? "expanded" : ""}`}>
                {albums.map(album => {
                    const playing = album.key === playingKey;
                    return (
                        <div
                            key={album.key}
                            className={`playlist-card card-hover album-strip-card ${playing ? "is-playing" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpen(album)}
                            onKeyDown={(e) => e.key === "Enter" && onOpen(album)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                onOpenMenu(album, e.clientX, e.clientY);
                            }}
                        >
                            <CoverMosaic covers={groupCovers(album, 1)} size={120} icon={Disc3} className="playlist-card-cover" />
                            <div className="playlist-card-footer">
                                <div className="playlist-card-text">
                                    <span className="playlist-card-name" title={album.name}>
                                        {playing && <PlayingMark />}
                                        {album.name}
                                    </span>
                                    <span className="playlist-card-meta">
                                        {[album.year, t("common.tracks", { count: album.tracks.length })].filter(Boolean).join(" · ")}
                                    </span>
                                </div>
                                <CardPlayButton onPlay={() => onPlay(album)} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};
