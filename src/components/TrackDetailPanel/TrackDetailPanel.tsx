import { useState } from "react";
import type { Track } from "../../types";
import { displayTitle } from "../../utils/track";
import { formatDuration } from "../../utils/format";
import { CoverArt } from "../CoverArt";
import { CoverViewer } from "../CoverViewer/CoverViewer";
import "./TrackDetailPanel.css";

interface TrackDetailPanelProps {
    /** The track to show (currently the playing track). */
    track: Track | null;
}

/** A labelled "label: value" row, hidden when there is no value. */
const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
        <div className="detail-row">
            <span className="detail-label">{label}</span>
            <span className="detail-value">{value}</span>
        </div>
    );
};

/**
 * Right-hand panel that shows the details of a track. In this first iteration
 * it is a read-only view of the currently playing track; later it will host
 * tabs (current / selected) and the metadata editor. On narrow layouts the
 * whole panel is hidden by CSS.
 */
export const TrackDetailPanel = ({ track }: TrackDetailPanelProps) => {
    const [showCover, setShowCover] = useState(false);

    if (!track) {
        return (
            <aside className="track-detail-panel">
                <div className="detail-empty">Nothing playing</div>
            </aside>
        );
    }

    const artists = track.artists.length ? track.artists.join(", ") : null;
    const technical = [
        track.format?.toUpperCase() ?? null,
        track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : null,
        track.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz` : null,
    ].filter(Boolean).join(" · ");

    const trackDisc = [
        track.trackNumber != null ? `Track ${track.trackNumber}` : null,
        track.discNumber != null ? `Disc ${track.discNumber}` : null,
    ].filter(Boolean).join(" · ");

    return (
        <aside className="track-detail-panel">
            <div className="detail-cover-wrap">
                <CoverArt
                    path={track.coverPath}
                    size={200}
                    className="detail-cover"
                    onClick={track.coverPath ? () => setShowCover(true) : undefined}
                />
            </div>

            <div className="detail-heading">
                <h2 className="detail-title">{displayTitle(track)}</h2>
                {artists && <span className="detail-artist">{artists}</span>}
            </div>

            <div className="detail-rows">
                <DetailRow label="Album" value={track.album} />
                <DetailRow label="Album artist" value={track.albumArtist} />
                <DetailRow label="Year" value={track.year != null ? String(track.year) : null} />
                <DetailRow label="Track / Disc" value={trackDisc || null} />
                <DetailRow label="Genre" value={track.genre.length ? track.genre.join(", ") : null} />
                <DetailRow label="Duration" value={formatDuration(track.duration)} />
                <DetailRow label="Format" value={technical || null} />
            </div>

            {showCover && (
                <CoverViewer
                    path={track.coverPath}
                    onClose={() => setShowCover(false)}
                />
            )}
        </aside>
    );
};

