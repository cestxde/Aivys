import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { UserTag } from "../../types";
import { sortTags } from "../../utils/tags";
import { TagDot } from "../TagChip/TagChip";
import { t } from "../../i18n";
import "./TagPicker.css";
import { useBackLayer } from "../../hooks/useBackLayer";
import { SearchInput } from "../SearchInput/SearchInput";

interface MergeTagDialogProps {
    /** The tag merged away (deleted afterwards). */
    tag: UserTag;
    tags: UserTag[];
    /** Tagged library tracks per tag id. */
    counts: Map<string, number>;
    /** The tag `tag` goes into. */
    onPick: (into: UserTag) => void;
    onClose: () => void;
}

/** "Merge into…": picks the tag that takes over another one's tracks. */
export const MergeTagDialog = ({ tag, tags, counts, onPick, onClose }: MergeTagDialogProps) => {
    useBackLayer(true, onClose);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const query = filter.trim().toLowerCase();
    const shown = sortTags(
        tags.filter(other => other.id !== tag.id && (!query || other.name.toLowerCase().includes(query))),
        "name",
        counts,
    );

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="add-to-dialog" role="dialog" aria-label={t("mergeTag.title")}>
                <div className="add-to-header">
                    <div className="add-to-heading">
                        <h2>{t("mergeTag.title")}</h2>
                        <span className="add-to-subject">{t("mergeTag.subject", { name: tag.name })}</span>
                    </div>
                    <button className="add-to-close" title={t("common.close")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <SearchInput
                    placeholder={t("tagPicker.find")}
                    value={filter}
                    autoFocus
                    onChange={setFilter}
                    onKeyDown={(e) => e.key === "Enter" && shown.length === 1 && onPick(shown[0])}
                />

                <div className="add-to-list tag-picker-list">
                    {shown.map(other => (
                        <button key={other.id} className="add-to-row tag-picker-row" onClick={() => onPick(other)}>
                            <TagDot color={other.color} size={12} />
                            <span className="add-to-row-name">{other.name}</span>
                            <span className="tag-picker-count">({counts.get(other.id) ?? 0})</span>
                        </button>
                    ))}
                    {shown.length === 0 && <div className="add-to-empty">{t("tagPicker.noMatch")}</div>}
                </div>
            </div>
        </div>
    );
};
