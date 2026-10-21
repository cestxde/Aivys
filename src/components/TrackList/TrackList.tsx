import "./TrackList.css";
import type { Track } from "../../types";
import { displayTitle } from "../../utils/track";
import { formatDuration } from "../../utils/format";
import { CoverArt } from "../CoverArt";

interface TrackListProps {
    files: Track[];
    activePath: string | null;

    onPlay: (track: Track) => void;
}

export const TrackList = ({ files, activePath, onPlay }: TrackListProps) => {
    return (
        <div className="music-grid">
            {files.length === 0 ? (
                <div className="empty-state">No tracks found. Scan a directory to start.</div>
            ) : (
                files.map((file) => {
                    const title = displayTitle(file);
                    const artist = file.artists.length > 0
                        ? file.artists.join(", ")
                        : "Unknown artist";
                    return (
                        <div
                            key={file.path}
                            onClick={() => onPlay(file)}
                            className={`audio-item ${activePath === file.path ? 'active' : ''}`}
                        >
                            <CoverArt path={file.coverPath} size={36} className="track-cover" />
                            <div className="track-main-info">
                                <span className="track-title">{title}</span>
                                <span className="track-artist">{artist}</span>
                            </div>
                            <span className="duration-tag">
                                {formatDuration(file.duration)}
                            </span>
                        </div>
                    );
                })
            )}
        </div>
    );
};