import { ArrowLeft, Disc3, ImageOff, MicVocal, Tag, Type, type LucideIcon } from "lucide-react";
import type { IncompleteGap, ListRow } from "../../types";
import { formatTotalDuration } from "../../utils/format";
import { t, type MessageKey } from "../../i18n";
import "../PlaylistHeader/PlaylistHeader.css";
import "./GapHeader.css";

const GAP_LABEL: Record<IncompleteGap, MessageKey> = {
    noArtist: "incomplete.noArtist",
    noTitle: "incomplete.noTitle",
    noAlbum: "incomplete.noAlbum",
    noCover: "incomplete.noCover",
    noTags: "incomplete.noTags",
};

const GAP_ICON: Record<IncompleteGap, LucideIcon> = {
    noArtist: MicVocal,
    noTitle: Type,
    noAlbum: Disc3,
    noCover: ImageOff,
    noTags: Tag,
};

interface GapHeaderProps {
    gap: IncompleteGap;
    rows: ListRow[];
    onBack: () => void;
}

/** Heading of an Incomplete gap's track list. */
export const GapHeader = ({ gap, rows, onBack }: GapHeaderProps) => {
    const Icon = GAP_ICON[gap];
    const totalSeconds = rows.reduce((sum, row) => sum + row.track.duration, 0);
    const summary = [
        t("common.tracks", { count: rows.length }),
        rows.length > 0 ? formatTotalDuration(totalSeconds) : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="playlist-header">
            <button className="playlist-back" title={t("incomplete.all")} onClick={onBack}>
                <ArrowLeft size={18} />
            </button>
            <div className="playlist-header-cover-wrap">
                <div className="gap-header-badge">
                    <Icon size={40} />
                </div>
            </div>

            <div className="playlist-info">
                <span className="playlist-kind">
                    <Icon size={14} /> {t("incomplete.kind")}
                </span>
                <h1 className="playlist-name">{t(GAP_LABEL[gap])}</h1>
                <span className="playlist-summary">{summary}</span>
            </div>
        </div>
    );
};
