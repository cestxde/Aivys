import { useState } from "react";
import { Heart, Star, Tag } from "lucide-react";
import type { Track, TrackStats, UserTag } from "../../types";
import { displayTitle } from "../../utils/track";
import { formatDateTime, formatDuration } from "../../utils/format";
import { tagsOf } from "../../utils/tags";
import { CoverArt } from "../CoverArt";
import { CoverViewer } from "../CoverViewer/CoverViewer";
import { TagChip } from "../TagChip/TagChip";
import "./TrackDetailPanel.css";

interface TrackDetailPanelProps {
    /** The track to show (currently the playing track). */
    track: Track | null;
    stats: TrackStats | null;
    onToggleFavorite: (track: Track) => void;
    /** 1-5, or 0 to clear. */
    onSetRating: (track: Track, rating: number) => void;
    tagsById: Map<string, UserTag>;
    /** Open the tag picker for the track. */
    onEditTags: (track: Track) => void;
    onOpenTag: (tag: UserTag) => void;
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

/** Five stars; clicking the current rating clears it. */
const RatingStars = ({ rating, onChange }: { rating: number; onChange: (rating: number) => void }) => {
    const [hover, setHover] = useState(0);
    const shown = hover || rating;
    return (
        <div className="detail-rating" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
                <button
                    key={value}
                    className={`rating-star ${value <= shown ? "is-on" : ""}`}
                    title={value === rating ? "Clear rating" : `Rate ${value}`}
                    onMouseEnter={() => setHover(value)}
                    onClick={() => onChange(value === rating ? 0 : value)}
                >
                    <Star size={18} fill={value <= shown ? "currentColor" : "none"} />
                </button>
            ))}
        </div>
    );
};

/**
 * Right-hand panel that shows the details of a track. In this first iteration
 * it is a read-only view of the currently playing track; later it will host
 * tabs (current / selected) and the metadata editor. On narrow layouts the
 * whole panel is hidden by CSS.
 */
export const TrackDetailPanel = ({
    track,
    stats,
    onToggleFavorite,
    onSetRating,
    tagsById,
    onEditTags,
    onOpenTag,
}: TrackDetailPanelProps) => {
    const [showCover, setShowCover] = useState(false);

    if (!track) {
        return (
            <aside className="track-detail-panel">
                <div className="detail-empty">Nothing playing</div>
            </aside>
        );
    }

    const tags = tagsOf(stats?.tags, tagsById);
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

            <div className="detail-actions">
                <button
                    className={`detail-favorite ${stats?.favorite ? "is-favorite" : ""}`}
                    title={stats?.favorite ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={stats?.favorite ?? false}
                    onClick={() => onToggleFavorite(track)}
                >
                    <Heart size={20} fill={stats?.favorite ? "currentColor" : "none"} />
                </button>
                <RatingStars
                    rating={stats?.rating ?? 0}
                    onChange={(rating) => onSetRating(track, rating)}
                />
            </div>

            <div className="detail-tags">
                {tags.map(tag => (
                    <TagChip key={tag.id} tag={tag} onClick={() => onOpenTag(tag)} />
                ))}
                <button className="detail-tags-edit" onClick={() => onEditTags(track)}>
                    <Tag size={13} /> {tags.length > 0 ? "Edit tags" : "Add tags"}
                </button>
            </div>

            <div className="detail-rows">
                <DetailRow label="Album" value={track.album} />
                <DetailRow label="Album artist" value={track.albumArtist} />
                <DetailRow label="Year" value={track.year != null ? String(track.year) : null} />
                <DetailRow label="Track / Disc" value={trackDisc || null} />
                <DetailRow label="Genre" value={track.genre.length ? track.genre.join(", ") : null} />
                <DetailRow label="Duration" value={formatDuration(track.duration)} />
                <DetailRow label="Format" value={technical || null} />
                <DetailRow label="Plays" value={String(stats?.playCount ?? 0)} />
                <DetailRow
                    label="Last played"
                    value={stats?.lastPlayedAt ? formatDateTime(stats.lastPlayedAt) : null}
                />
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

