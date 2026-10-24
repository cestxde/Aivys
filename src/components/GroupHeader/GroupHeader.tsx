import { Fragment, type ComponentType } from "react";
import { ArrowLeft, ChevronRight, Folder, MoreVertical } from "lucide-react";
import type { ListRow } from "../../types";
import { formatTotalDuration } from "../../utils/format";
import type { TrackGroup } from "../../utils/groups";
import { CoverMosaic } from "../PlaylistCover/PlaylistCover";
import { CardPlayButton, PlayingMark } from "../CardPlayButton/CardPlayButton";
import { t } from "../../i18n";
import "../PlaylistHeader/PlaylistHeader.css";
import "./GroupHeader.css";

export interface Crumb {
    label: string;
    onClick: () => void;
}

interface GroupHeaderProps {
    /** "Artist", "Album", "Folder". */
    kind: string;
    icon: ComponentType<{ size?: number }>;
    title: string;
    /** Extra summary parts before the track count (album artist, year). */
    details?: (string | null)[];
    covers: string[];
    round?: boolean;
    /** How many tracks there should be (an album's tags): shown as "4 of 12". */
    trackTotal?: number | null;
    rows: ListRow[];
    backTitle: string;
    onBack?: () => void;
    /** Path to the current item (folders), shown above the title. */
    crumbs?: Crumb[];
}

const COVER_SIZE = 120;

/** Heading of an artist's, album's or folder's track list. */
export const GroupHeader = ({
    kind,
    icon: Icon,
    title,
    details = [],
    covers,
    round = false,
    trackTotal,
    rows,
    backTitle,
    onBack,
    crumbs,
}: GroupHeaderProps) => {
    const totalSeconds = rows.reduce((sum, row) => sum + row.track.duration, 0);
    const summary = [
        ...details,
        trackTotal && trackTotal >= rows.length
            ? t("group.tracksOf", { have: rows.length, count: trackTotal })
            : t("common.tracks", { count: rows.length }),
        rows.length > 0 ? formatTotalDuration(totalSeconds) : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className={`playlist-header ${round ? "group-header-round" : ""}`}>
            {onBack && (
                <button className="playlist-back" title={backTitle} onClick={onBack}>
                    <ArrowLeft size={18} />
                </button>
            )}
            <CoverMosaic covers={covers} size={COVER_SIZE} icon={Icon} className="playlist-header-cover" />

            <div className="playlist-info">
                {crumbs && crumbs.length > 0 ? (
                    <nav className="group-crumbs" aria-label={t("group.folderPath")}>
                        {crumbs.map((crumb, index) => (
                            <Fragment key={index}>
                                {index > 0 && <ChevronRight size={12} />}
                                <button className="group-crumb" onClick={crumb.onClick}>{crumb.label}</button>
                            </Fragment>
                        ))}
                    </nav>
                ) : (
                    <span className="playlist-kind">
                        <Icon size={14} /> {kind}
                    </span>
                )}
                <h1 className="playlist-name" title={title}>{title}</h1>
                <span className="playlist-summary">{summary}</span>
            </div>
        </div>
    );
};

interface FolderGridProps {
    folders: TrackGroup[];
    onOpen: (folder: TrackGroup) => void;
    onPlay: (folder: TrackGroup) => void;
    /** Path of the folder playback was started from, to highlight it. */
    playingKey: string | null;
    onOpenMenu: (folder: TrackGroup, x: number, y: number) => void;
}

/** Subfolders of the open folder, as cards above its tracks. */
export const FolderGrid = ({ folders, onOpen, onPlay, playingKey, onOpenMenu }: FolderGridProps) => (
    <div className="folder-grid">
        {folders.map(folder => (
            <div
                key={folder.key}
                className={`folder-card card-hover ${folder.key === playingKey ? "is-playing" : ""}`}
                role="button"
                tabIndex={0}
                title={folder.name}
                onClick={() => onOpen(folder)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(folder)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenMenu(folder, e.clientX, e.clientY);
                }}
            >
                <Folder size={20} className="folder-card-icon" />
                <span className="folder-card-text">
                    <span className="folder-card-name">
                        {folder.key === playingKey && <PlayingMark />}
                        {folder.name}
                    </span>
                    <span className="folder-card-meta">
                        {t("common.tracks", { count: folder.tracks.length })}
                    </span>
                </span>
                <CardPlayButton onPlay={() => onPlay(folder)} />
                <button
                    className="playlists-menu-button"
                    title={t("common.more")}
                    aria-haspopup="menu"
                    onClick={(e) => {
                        e.stopPropagation();
                        const box = e.currentTarget.getBoundingClientRect();
                        onOpenMenu(folder, box.right - 200, box.bottom + 2);
                    }}
                >
                    <MoreVertical size={16} />
                </button>
            </div>
        ))}
    </div>
);
