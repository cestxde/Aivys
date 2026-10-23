import { useState, type CSSProperties } from "react";
import { MoreVertical, Plus, Tag } from "lucide-react";
import type { UserTag } from "../../types";
import { TagDot } from "../TagChip/TagChip";
import { CardPlayButton } from "../CardPlayButton/CardPlayButton";
import "./TagsPage.css";

interface TagsPageProps {
    /** Sorted by name. */
    tags: UserTag[];
    /** Tagged library tracks per tag id. */
    counts: Map<string, number>;
    onOpen: (tag: UserTag) => void;
    onPlay: (tag: UserTag) => void;
    onOpenMenu: (tag: UserTag, x: number, y: number) => void;
    onCreate: () => void;
}

const describe = (count: number) => `${count} ${count === 1 ? "track" : "tracks"}`;

/** All user tags of the library with their track counts. */
export const TagsPage = ({ tags, counts, onOpen, onPlay, onOpenMenu, onCreate }: TagsPageProps) => {
    const [filter, setFilter] = useState("");
    const query = filter.trim().toLowerCase();
    const shown = tags.filter(tag => !query || tag.name.toLowerCase().includes(query));

    return (
        <div className="tags-page">
            <div className="tags-toolbar">
                <h1 className="tags-title">Tags</h1>
                <input
                    className="search-input tags-filter"
                    placeholder="Filter tags..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <button className="toolbar-button play-button tags-create" onClick={onCreate}>
                    <Plus size={14} /> New tag
                </button>
            </div>

            {shown.length === 0 ? (
                <div className="tags-empty">
                    {tags.length === 0 ? (
                        <>
                            <Tag size={28} />
                            <span>
                                No tags yet. Create one here, or choose “Tags…” in a track's menu
                                (right click or ⋮).
                            </span>
                        </>
                    ) : "No tags match the filter."}
                </div>
            ) : (
                <div className="tags-grid">
                    {shown.map(tag => (
                        <div
                            key={tag.id}
                            className="tag-card card-hover"
                            role="button"
                            tabIndex={0}
                            style={{ "--tag-color": tag.color } as CSSProperties}
                            onClick={() => onOpen(tag)}
                            onKeyDown={(e) => e.key === "Enter" && onOpen(tag)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                onOpenMenu(tag, e.clientX, e.clientY);
                            }}
                        >
                            <TagDot color={tag.color} size={14} />
                            <div className="tag-card-text">
                                <span className="tag-card-name">{tag.name}</span>
                                <span className="tag-card-meta">{describe(counts.get(tag.id) ?? 0)}</span>
                            </div>
                            {(counts.get(tag.id) ?? 0) > 0 && <CardPlayButton onPlay={() => onPlay(tag)} />}
                            <button
                                className="tag-card-menu"
                                title="More"
                                aria-haspopup="menu"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const box = e.currentTarget.getBoundingClientRect();
                                    onOpenMenu(tag, box.right - 200, box.bottom + 2);
                                }}
                            >
                                <MoreVertical size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
