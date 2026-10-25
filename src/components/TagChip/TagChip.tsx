import type { CSSProperties, MouseEvent } from "react";
import { X } from "lucide-react";
import type { UserTag } from "../../types";
import { t } from "../../i18n";
import "./TagChip.css";

interface TagChipProps {
    tag: UserTag;
    onClick?: () => void;
    /** Shows a small × that calls this. */
    onRemove?: () => void;
    onContextMenu?: (e: MouseEvent) => void;
}

/** A tag as a small tinted pill with its color dot. */
export const TagChip = ({ tag, onClick, onRemove, onContextMenu }: TagChipProps) => {
    const style = { "--tag-color": tag.color } as CSSProperties;
    const content = (
        <>
            <span className="tag-dot" />
            <span className="tag-chip-name">{tag.name}</span>
        </>
    );
    if (onRemove) {
        return (
            <span className="tag-chip removable" style={style} title={tag.name} onContextMenu={onContextMenu}>
                {onClick
                    ? <button className="tag-chip-main" onClick={onClick}>{content}</button>
                    : <span className="tag-chip-main">{content}</span>}
                <button
                    className="tag-chip-remove"
                    title={t("tagChip.remove", { name: tag.name })}
                    onClick={onRemove}
                >
                    <X size={11} />
                </button>
            </span>
        );
    }
    return onClick ? (
        <button className="tag-chip" style={style} title={tag.name} onClick={onClick} onContextMenu={onContextMenu}>
            {content}
        </button>
    ) : (
        <span className="tag-chip" style={style} title={tag.name} onContextMenu={onContextMenu}>
            {content}
        </span>
    );
};

/** Just the color dot (track rows, lists). */
export const TagDot = ({ color, size = 10, title }: { color: string; size?: number; title?: string }) => (
    <span
        className="tag-dot"
        title={title}
        style={{ "--tag-color": color, width: size, height: size } as CSSProperties}
    />
);
