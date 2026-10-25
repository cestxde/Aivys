import { useState, type ReactNode } from "react";
import { Heart, PencilLine, Star, Tag } from "lucide-react";
import type { Track, TrackStats, UserTag } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { formatDateTime, formatDuration, formatFileSize } from "../../utils/format";
import { tagsOf } from "../../utils/tags";
import { revealFile, revealLabel } from "../../utils/reveal";
import { CoverArt } from "../CoverArt";
import { ArtistLinks } from "../ArtistLinks/ArtistLinks";
import { CoverViewer } from "../CoverViewer/CoverViewer";
import { TagChip } from "../TagChip/TagChip";
import { t } from "../../i18n";
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
    /** Open the metadata editor for the track. */
    onEditDetails: (track: Track) => void;
    onOpenTag: (tag: UserTag) => void;
    /** Take the tag off the track (the chip's ×). */
    onRemoveTag: (track: Track, tag: UserTag) => void;
    /** The menu of a tag chip (right click). */
    onOpenTagMenu: (track: Track, tag: UserTag, x: number, y: number) => void;
    canOpenArtist: (name: string) => boolean;
    onOpenArtist: (name: string) => void;
    canOpenAlbum: (track: Track) => boolean;
    onOpenAlbum: (track: Track) => void;
}

/** A labelled "label: value" row, hidden when there is no value. */
const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => {
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
                    title={value === rating ? t("detail.clearRating") : t("detail.rate", { value })}
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
    onEditDetails,
    onOpenTag,
    onRemoveTag,
    onOpenTagMenu,
    canOpenArtist,
    onOpenArtist,
    canOpenAlbum,
    onOpenAlbum,
}: TrackDetailPanelProps) => {
    const [showCover, setShowCover] = useState(false);

    if (!track) {
        return (
            <div className="detail-body">
                <div className="detail-empty">{t("detail.nothingPlaying")}</div>
            </div>
        );
    }

    const tags = tagsOf(stats?.tags, tagsById);
    const artists = displayArtists(track);
    const technical = [
        track.format?.toUpperCase() ?? null,
        track.bitrate ? t("detail.kbps", { value: Math.round(track.bitrate / 1000) }) : null,
        track.sampleRate ? t("detail.khz", { value: (track.sampleRate / 1000).toFixed(1) }) : null,
    ].filter(Boolean).join(" · ");

    const trackDisc = [
        track.trackNumber != null ? t("detail.track", { number: track.trackNumber }) : null,
        track.discNumber != null ? t("detail.disc", { number: track.discNumber }) : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="detail-body">
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
                {artists && (
                    <span className="detail-artist">
                        <ArtistLinks line={artists} artists={track.artists} canOpen={canOpenArtist} onOpen={onOpenArtist} />
                    </span>
                )}
            </div>

            <div className="detail-actions">
                <button
                    className={`detail-favorite ${stats?.favorite ? "is-favorite" : ""}`}
                    title={stats?.favorite ? t("common.removeFromFavorites") : t("common.addToFavorites")}
                    aria-pressed={stats?.favorite ?? false}
                    onClick={() => onToggleFavorite(track)}
                >
                    <Heart size={20} fill={stats?.favorite ? "currentColor" : "none"} />
                </button>
                <RatingStars
                    rating={stats?.rating ?? 0}
                    onChange={(rating) => onSetRating(track, rating)}
                />
                <button className="detail-edit" title={t("edit.menu")} onClick={() => onEditDetails(track)}>
                    <PencilLine size={18} />
                </button>
            </div>

            <div className="detail-tags">
                {tags.map(tag => (
                    <TagChip
                        key={tag.id}
                        tag={tag}
                        onClick={() => onOpenTag(tag)}
                        onRemove={() => onRemoveTag(track, tag)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            onOpenTagMenu(track, tag, e.clientX, e.clientY);
                        }}
                    />
                ))}
                <button className="detail-tags-edit" onClick={() => onEditTags(track)}>
                    <Tag size={13} /> {tags.length > 0 ? t("detail.editTags") : t("detail.addTags")}
                </button>
            </div>

            <div className="detail-rows">
                <DetailRow
                    label={t("detail.album")}
                    value={track.album && canOpenAlbum(track)
                        ? <button className="artist-link" onClick={() => onOpenAlbum(track)}>{track.album}</button>
                        : track.album}
                />
                <DetailRow
                    label={t("detail.albumArtist")}
                    value={track.albumArtist && (
                        <ArtistLinks line={track.albumArtist} artists={[track.albumArtist]} canOpen={canOpenArtist} onOpen={onOpenArtist} />
                    )}
                />
                <DetailRow label={t("detail.year")} value={track.year != null ? String(track.year) : null} />
                <DetailRow label={t("detail.trackDisc")} value={trackDisc || null} />
                <DetailRow label={t("detail.genre")} value={track.genre.length ? track.genre.join(", ") : null} />
                <DetailRow label={t("detail.duration")} value={formatDuration(track.duration)} />
                <DetailRow label={t("detail.format")} value={technical || null} />
                <DetailRow label={t("detail.plays")} value={String(stats?.playCount ?? 0)} />
                <DetailRow
                    label={t("detail.lastPlayed")}
                    value={stats?.lastPlayedAt ? formatDateTime(stats.lastPlayedAt) : null}
                />
            </div>

            <div className="detail-rows detail-file">
                <DetailRow label={t("detail.size")} value={track.fileSize > 0 ? formatFileSize(track.fileSize) : null} />
                <div className="detail-row">
                    <span className="detail-label">{t("detail.path")}</span>
                    <button className="detail-value detail-path artist-link" title={revealLabel()} onClick={() => revealFile(track.path)}>
                        {track.path}
                    </button>
                </div>
            </div>

            {showCover && (
                <CoverViewer
                    path={track.coverPath}
                    onClose={() => setShowCover(false)}
                />
            )}
        </div>
    );
};

