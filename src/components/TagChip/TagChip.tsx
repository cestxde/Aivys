import type { CSSProperties } from "react";
import type { UserTag } from "../../types";
import "./TagChip.css";

interface TagChipProps {
    tag: UserTag;
    onClick?: () => void;
}

/** A tag as a small tinted pill with its color dot. */
export const TagChip = ({ tag, onClick }: TagChipProps) => {
    const style = { "--tag-color": tag.color } as CSSProperties;
    return onClick ? (
        <button className="tag-chip" style={style} title={tag.name} onClick={onClick}>
            <span className="tag-dot" />
            <span className="tag-chip-name">{tag.name}</span>
        </button>
    ) : (
        <span className="tag-chip" style={style} title={tag.name}>
            <span className="tag-dot" />
            <span className="tag-chip-name">{tag.name}</span>
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
