import "./TrackList.css";
import { Fragment } from "react";
import { Heart } from "lucide-react";
import type { Track, TrackStats } from "../../types";
import { displayTitle } from "../../utils/track";
import { formatDuration } from "../../utils/format";
import { CoverArt } from "../CoverArt";

interface TrackListProps {
    files: Track[];
    activePath: string | null;
    stats: Record<string, TrackStats>;
    /** Index from which results are loose search matches (-1: none). */
    looseFromIndex?: number;
    emptyText?: string;

    onPlay: (track: Track) => void;
    onToggleFavorite: (track: Track) => void;
}

export const TrackList = ({
    files,
    activePath,
    stats,
    looseFromIndex = -1,
    emptyText = "No tracks found. Scan a directory to start.",
    onPlay,
    onToggleFavorite,
}: TrackListProps) => {
    return (
        <div className="music-grid">
            {files.length === 0 ? (
                <div className="empty-state">{emptyText}</div>
            ) : (
                files.map((file, index) => {
                    const title = displayTitle(file);
                    const artist = file.artists.length > 0
                        ? file.artists.join(", ")
                        : "Unknown artist";
                    const favorite = stats[file.relPath]?.favorite ?? false;
                    return (
                        <Fragment key={file.path}>
                            {index === looseFromIndex && (
                                <div className="list-separator">Similar matches</div>
                            )}
                            <div
                                onClick={() => onPlay(file)}
                                className={`audio-item ${activePath === file.path ? 'active' : ''}`}
                            >
                                <CoverArt path={file.coverPath} size={36} className="track-cover" />
                                <div className="track-main-info">
                                    <span className="track-title">{title}</span>
                                    <span className="track-artist">{artist}</span>
                                </div>
                                <button
                                    className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
                                    title={favorite ? "Remove from favorites" : "Add to favorites"}
                                    aria-pressed={favorite}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleFavorite(file);
                                    }}
                                >
                                    <Heart size={16} fill={favorite ? "currentColor" : "none"} />
                                </button>
                                <span className="duration-tag">
                                    {formatDuration(file.duration)}
                                </span>
                            </div>
                        </Fragment>
                    );
                })
            )}
        </div>
    );
};
