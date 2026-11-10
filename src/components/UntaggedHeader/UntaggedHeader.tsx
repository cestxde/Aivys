import type { CSSProperties } from "react";
import { ArrowLeft, Tag } from "lucide-react";
import type { ListRow } from "../../types";
import { formatTotalDuration } from "../../utils/format";
import { t } from "../../i18n";
import "../PlaylistHeader/PlaylistHeader.css";
import "../TagHeader/TagHeader.css";
import "./UntaggedHeader.css";

interface UntaggedHeaderProps {
    rows: ListRow[];
    onBack: () => void;
}

/** Heading of the "no tags" track list: a gray badge, without edit/delete. */
export const UntaggedHeader = ({ rows, onBack }: UntaggedHeaderProps) => {
    const totalSeconds = rows.reduce((sum, row) => sum + row.track.duration, 0);
    const summary = [
        t("common.tracks", { count: rows.length }),
        rows.length > 0 ? formatTotalDuration(totalSeconds) : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="playlist-header">
            <button className="playlist-back" title={t("tag.all")} onClick={onBack}>
                <ArrowLeft size={18} />
            </button>
            <div className="playlist-header-cover-wrap">
                <div
                    className="tag-header-badge untagged-header-badge"
                    style={{ "--tag-color": "#94a3b8" } as CSSProperties}
                >
                    <Tag size={40} />
                </div>
            </div>

            <div className="playlist-info">
                <span className="playlist-kind">
                    <Tag size={14} /> {t("tag.kind")}
                </span>
                <h1 className="playlist-name">{t("tags.untagged")}</h1>
                <span className="playlist-summary">{summary}</span>
            </div>
        </div>
    );
};
