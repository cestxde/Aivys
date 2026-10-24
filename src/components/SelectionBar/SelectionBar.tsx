import { CheckCheck, Heart, ListPlus, ListX, PencilLine, Play, Tag, Trash2, X } from "lucide-react";
import { t } from "../../i18n";
import "../ToolBar/ToolBar.css";
import "./SelectionBar.css";

interface SelectionBarProps {
    count: number;
    /** Every selected track is a favorite (the heart then removes them). */
    allFavorite: boolean;
    canSelectMore: boolean;
    onPlay: () => void;
    onAddTo: () => void;
    onTags: () => void;
    onEdit: () => void;
    onToggleFavorite: () => void;
    /** Only in a manual playlist. */
    onRemoveFromPlaylist?: () => void;
    onDelete: () => void;
    onSelectAll: () => void;
    onClear: () => void;
}

/** Stands in for the toolbar while tracks are selected: what to do with them. */
export const SelectionBar = ({
    count,
    allFavorite,
    canSelectMore,
    onPlay,
    onAddTo,
    onTags,
    onEdit,
    onToggleFavorite,
    onRemoveFromPlaylist,
    onDelete,
    onSelectAll,
    onClear,
}: SelectionBarProps) => (
    <div className="toolbar selection-bar" role="toolbar" aria-label={t("selection.count", { count })}>
        <button className="selection-clear" title={t("selection.clear")} aria-label={t("selection.clear")} onClick={onClear}>
            <X size={18} />
        </button>
        <span className="selection-count">{t("selection.count", { count })}</span>

        <div className="selection-actions">
            <button className="selection-action" onClick={onPlay}>
                <Play size={15} fill="currentColor" /> <span>{t("common.play")}</span>
            </button>
            <button className="selection-action" onClick={onAddTo}>
                <ListPlus size={15} /> <span>{t("common.addTo")}</span>
            </button>
            <button className="selection-action" onClick={onTags}>
                <Tag size={15} /> <span>{t("common.tags")}</span>
            </button>
            <button className="selection-action icon" title={t("edit.menu")} onClick={onEdit}>
                <PencilLine size={15} />
            </button>
            <button
                className="selection-action icon"
                title={allFavorite ? t("common.removeFromFavorites") : t("common.addToFavorites")}
                aria-pressed={allFavorite}
                onClick={onToggleFavorite}
            >
                <Heart size={15} fill={allFavorite ? "currentColor" : "none"} />
            </button>
            {onRemoveFromPlaylist && (
                <button className="selection-action icon" title={t("menu.removeFromPlaylist")} onClick={onRemoveFromPlaylist}>
                    <ListX size={15} />
                </button>
            )}
            <button className="selection-action icon danger" title={t("menu.deleteFromDisk")} onClick={onDelete}>
                <Trash2 size={15} />
            </button>
            {canSelectMore && (
                <button className="selection-action icon" title={t("selection.selectAll")} onClick={onSelectAll}>
                    <CheckCheck size={15} />
                </button>
            )}
        </div>
    </div>
);
