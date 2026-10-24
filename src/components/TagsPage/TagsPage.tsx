import type { CSSProperties } from "react";
import { MoreVertical, Plus, Tag } from "lucide-react";
import type { UserTag } from "../../types";
import { TagDot } from "../TagChip/TagChip";
import { CardPlayButton, PlayingMark } from "../CardPlayButton/CardPlayButton";
import { t } from "../../i18n";
import { useRememberedScroll, useRememberedState } from "../../hooks/useRemembered";
import "./TagsPage.css";

interface TagsPageProps {
    /** Sorted by name. */
    tags: UserTag[];
    /** Tagged library tracks per tag id. */
    counts: Map<string, number>;
    onOpen: (tag: UserTag) => void;
    onPlay: (tag: UserTag) => void;
    /** Id of the tag playback was started from, to highlight it. */
    playingId: string | null;
    onOpenMenu: (tag: UserTag, x: number, y: number) => void;
    onCreate: () => void;
}

const describe = (count: number) => t("common.tracks", { count });

/** All user tags of the library with their track counts. */
export const TagsPage = ({ tags, counts, onOpen, onPlay, playingId, onOpenMenu, onCreate }: TagsPageProps) => {
    const [filter, setFilter] = useRememberedState("tags.filter", "");
    const { ref: scrollRef, onScroll: onPageScroll } = useRememberedScroll("tags");
    const query = filter.trim().toLowerCase();
    const shown = tags.filter(tag => !query || tag.name.toLowerCase().includes(query));

    return (
        <div className="tags-page" ref={scrollRef} onScroll={onPageScroll}>
            <div className="tags-toolbar">
                <h1 className="tags-title">{t("nav.tags")}</h1>
                <input
                    className="search-input tags-filter"
                    placeholder={t("tags.filter")}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <button className="toolbar-button play-button tags-create" onClick={onCreate}>
                    <Plus size={14} /> {t("tags.new")}
                </button>
            </div>

            {shown.length === 0 ? (
                <div className="tags-empty">
                    {tags.length === 0 ? (
                        <>
                            <Tag size={28} />
                            <span>{t("tags.empty")}</span>
                        </>
                    ) : t("tags.noMatch")}
                </div>
            ) : (
                <div className="tags-grid">
                    {shown.map(tag => (
                        <div
                            key={tag.id}
                            className={`tag-card card-hover ${tag.id === playingId ? "is-playing" : ""}`}
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
                                <span className="tag-card-name">
                                    {tag.id === playingId && <PlayingMark />}
                                    {tag.name}
                                </span>
                                <span className="tag-card-meta">{describe(counts.get(tag.id) ?? 0)}</span>
                            </div>
                            {(counts.get(tag.id) ?? 0) > 0 && <CardPlayButton onPlay={() => onPlay(tag)} />}
                            <button
                                className="tag-card-menu"
                                title={t("common.more")}
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
