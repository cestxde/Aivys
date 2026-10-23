import type { CSSProperties } from "react";
import { ArrowLeft, Pencil, Tag, Trash2 } from "lucide-react";
import type { ListRow, UserTag } from "../../types";
import { formatDuration } from "../../utils/format";
import { t } from "../../i18n";
import "../PlaylistHeader/PlaylistHeader.css";
import "./TagHeader.css";

interface TagHeaderProps {
    tag: UserTag;
    rows: ListRow[];
    onBack: () => void;
    onEdit: () => void;
    /** Asks for confirmation itself. */
    onDelete: () => void;
}

/** Heading of a tag's track list: its color, name, summary and actions. */
export const TagHeader = ({ tag, rows, onBack, onEdit, onDelete }: TagHeaderProps) => {
    const totalSeconds = rows.reduce((sum, row) => sum + row.track.duration, 0);
    const summary = [
        t("common.tracks", { count: rows.length }),
        rows.length > 0 ? formatDuration(totalSeconds) : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="playlist-header">
            <button className="playlist-back" title={t("tag.all")} onClick={onBack}>
                <ArrowLeft size={18} />
            </button>
            <div
                className="tag-header-badge"
                style={{ "--tag-color": tag.color } as CSSProperties}
                title={t("tag.edit")}
                onClick={onEdit}
            >
                <Tag size={40} />
            </div>

            <div className="playlist-info">
                <span className="playlist-kind">
                    <Tag size={14} /> {t("tag.kind")}
                </span>
                <h1 className="playlist-name editable" title={t("tag.clickToEdit")} onClick={onEdit}>
                    {tag.name}
                </h1>
                <span className="playlist-summary">{summary}</span>
                <div className="playlist-actions">
                    <button className="playlist-action" onClick={onEdit}>
                        <Pencil size={14} /> {t("common.edit")}
                    </button>
                    <button className="playlist-action danger" onClick={onDelete}>
                        <Trash2 size={14} /> {t("common.delete")}
                    </button>
                </div>
            </div>
        </div>
    );
};
