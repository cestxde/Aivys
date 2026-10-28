import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronRight, MoreVertical, Pin, Plus, Tag } from "lucide-react";
import type { TagCategory, UserTag } from "../../types";
import { groupTags, sortTags } from "../../utils/tags";
import { useTagSort } from "../../hooks/useTags";
import { TagDot } from "../TagChip/TagChip";
import { TagSortButton } from "../TagSortButton/TagSortButton";
import { CategorySidebar, PINNED, type CategoryFilter } from "../CategorySidebar/CategorySidebar";
import { LayoutToggle, type PlaylistsLayout } from "../PlaylistsPage/PlaylistsPage";
import { CardPlayButton, PinnedMark, PlayingMark } from "../CardPlayButton/CardPlayButton";
import { pinnedFirst } from "../../hooks/usePins";
import { t } from "../../i18n";
import { useRememberedScroll, useRememberedState, useStoredState } from "../../hooks/useRemembered";
import { SearchInput } from "../SearchInput/SearchInput";
import "./TagsPage.css";

interface TagsPageProps {
    tags: UserTag[];
    /** In the user's order. */
    categories: TagCategory[];
    /** Tagged library tracks per tag id. */
    counts: Map<string, number>;
    layout: PlaylistsLayout;
    onLayoutChange: (layout: PlaylistsLayout) => void;
    onOpen: (tag: UserTag) => void;
    onPlay: (tag: UserTag) => void;
    /** Id of the tag playback was started from, to highlight it. */
    playingId: string | null;
    onOpenMenu: (tag: UserTag, x: number, y: number) => void;
    /** Pinned to the top of the list (of each category). */
    isPinned: (tag: UserTag) => boolean;
    /** A new tag, in `category` if given. */
    onCreate: (category: TagCategory | null) => void;
    onCreateCategory: () => void;
    onRenameCategory: (category: TagCategory) => void;
    onOpenCategoryMenu: (category: TagCategory, x: number, y: number) => void;
    /** The categories in a new order (all their ids). */
    onReorderCategories: (ids: string[]) => void;
    /**
     * A tag dragged from the section of `from` to that of `to` (null: no
     * category): moved, or with `copy` (Ctrl) added there as well.
     */
    onMoveTag: (tag: UserTag, from: TagCategory | null, to: TagCategory | null, copy: boolean) => void;
}

const describe = (count: number) => t("common.tracks", { count });

const isIdList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === "string");

/** How far the pointer moves on a tag before it is a drag, not a click. */
const DRAG_THRESHOLD = 5;

/** A tag being pressed or dragged, from the section of `from`. */
interface TagDrag {
    tag: UserTag;
    from: TagCategory | null;
    x: number;
    y: number;
    started: boolean;
}

/** The section or sidebar item under the pointer: a category id, "" for "no category", or null. */
const sectionAt = (x: number, y: number): string | null =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-section]")?.dataset.section ?? null;

/**
 * All user tags of the library with their track counts, by category: the
 * sidebar picks all of them or one category (and reorders the categories), a
 * tag is dragged to another category (in the list or the sidebar) to move it.
 */
export const TagsPage = ({
    tags, categories, counts, layout, onLayoutChange, onOpen, onPlay, playingId, onOpenMenu, isPinned, onCreate,
    onCreateCategory, onRenameCategory, onOpenCategoryMenu, onReorderCategories, onMoveTag,
}: TagsPageProps) => {
    const [filter, setFilter] = useRememberedState("tags.filter", "");
    const [picked, setPicked] = useRememberedState<CategoryFilter>("tags.category", null);
    const [sort, setSort] = useTagSort();
    const [collapsed, setCollapsed] = useStoredState<string[]>("tags.collapsed", [], isIdList);
    const { ref: scrollRef, onScroll: onPageScroll } = useRememberedScroll("tags");
    const query = filter.trim().toLowerCase();
    const shown = tags.filter(tag => !query || tag.name.toLowerCase().includes(query));
    const pinned = tags.filter(isPinned);
    // A picked category that was deleted meanwhile (or "Pinned" with nothing
    // pinned) shows all again.
    const selected = picked === null || categories.some(c => c.id === picked) || (picked === "" && categories.length > 0)
        || (picked === PINNED && pinned.length > 0)
        ? picked
        : null;
    const selectedCategory = categories.find(c => c.id === selected) ?? null;

    // Dragging a tag to another section: a press becomes a drag once the
    // pointer moves a few pixels; the click that ends a drag opens nothing.
    const tagDrag = useRef<TagDrag | null>(null);
    const [draggedTag, setDraggedTag] = useState<string | null>(null);
    const [tagDropSection, setTagDropSection] = useState<string | null>(null);
    const suppressClick = useRef(false);

    const autoscroll = (y: number) => {
        const page = scrollRef.current;
        if (!page) return;
        const box = page.getBoundingClientRect();
        if (y < box.top + 48) page.scrollBy(0, -12);
        else if (y > box.bottom - 48) page.scrollBy(0, 12);
    };

    const pressTag = (e: ReactPointerEvent<HTMLElement>, tag: UserTag, from: TagCategory | null) => {
        suppressClick.current = false;
        if (e.button !== 0 || categories.length === 0 || e.pointerType === "touch") return;
        if ((e.target as HTMLElement).closest("button")) return;
        tagDrag.current = { tag, from, x: e.clientX, y: e.clientY, started: false };
    };

    const moveTag = (e: ReactPointerEvent<HTMLElement>) => {
        const drag = tagDrag.current;
        if (!drag) return;
        if (!drag.started) {
            if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
            drag.started = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDraggedTag(`${drag.from?.id ?? ""}:${drag.tag.id}`);
        }
        autoscroll(e.clientY);
        const section = sectionAt(e.clientX, e.clientY);
        setTagDropSection(section === (drag.from?.id ?? "") ? null : section);
    };

    const releaseTag = (e: ReactPointerEvent<HTMLElement>, commit: boolean) => {
        const drag = tagDrag.current;
        tagDrag.current = null;
        if (!drag?.started) return;
        suppressClick.current = true;
        setDraggedTag(null);
        setTagDropSection(null);
        const section = commit ? sectionAt(e.clientX, e.clientY) : null;
        if (section === null || section === (drag.from?.id ?? "")) return;
        const to = categories.find(c => c.id === section) ?? null;
        onMoveTag(drag.tag, drag.from, to, e.ctrlKey || e.metaKey);
    };

    const toggleCollapsed = (id: string) =>
        setCollapsed(collapsed.includes(id) ? collapsed.filter(other => other !== id) : [...collapsed, id]);

    /**
     * A tag as a card (grid) or a row (list), in the section `section` (of
     * `category`; the pinned and the uncategorized have none).
     */
    const item = (tag: UserTag, category: TagCategory | null, section = category?.id ?? "") => {
        const key = `${section}:${tag.id}`;
        const count = counts.get(tag.id) ?? 0;
        const grid = layout === "grid";
        return (
            <div
                key={key}
                className={`${grid ? "tag-card" : "tag-row"} card-hover ${tag.id === playingId ? "is-playing" : ""} ${draggedTag === key ? "dragging" : ""}`}
                role="button"
                tabIndex={0}
                style={{ "--tag-color": tag.color } as CSSProperties}
                onClick={() => {
                    if (suppressClick.current) suppressClick.current = false;
                    else onOpen(tag);
                }}
                onKeyDown={(e) => e.key === "Enter" && onOpen(tag)}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenMenu(tag, e.clientX, e.clientY);
                }}
                onPointerDown={(e) => pressTag(e, tag, category)}
                onPointerMove={moveTag}
                onPointerUp={(e) => releaseTag(e, true)}
                onPointerCancel={(e) => releaseTag(e, false)}
            >
                <TagDot color={tag.color} size={grid ? 14 : 12} />
                {grid ? (
                    <div className="tag-card-text">
                        <span className="tag-card-name">
                            {tag.id === playingId && <PlayingMark />}
                            {isPinned(tag) && <PinnedMark />}
                            {tag.name}
                        </span>
                        <span className="tag-card-meta">{describe(count)}</span>
                    </div>
                ) : (
                    <span className="tag-row-text">
                        <span className="tag-card-name">
                            {tag.id === playingId && <PlayingMark />}
                            {isPinned(tag) && <PinnedMark />}
                            {tag.name}
                        </span>
                        <span className="tag-row-count" title={describe(count)}>({count})</span>
                    </span>
                )}
                {count > 0 && <CardPlayButton onPlay={() => onPlay(tag)} />}
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
        );
    };

    const items = (inGroup: UserTag[], category: TagCategory | null, section?: string) => (
        <div className={layout === "grid" ? "tags-grid" : "tags-list"}>
            {pinnedFirst(sortTags(inGroup, sort, counts), isPinned).map(tag => item(tag, category, section))}
        </div>
    );

    // All tags: every category (a tag in several, in each), the tags in none
    // last. While dragging a tag every category shows, to be dropped on.
    const shownPinned = shown.filter(isPinned);
    const groups = groupTags(shown, categories)
        .filter(group => selected === null || (group.category?.id ?? "") === selected)
        .filter(group => selected !== null || group.tags.length > 0
            || (group.category !== null && (!query || draggedTag !== null))
            || (group.category === null && draggedTag !== null));

    return (
        <div className="tags-page">
            <aside className="tags-sidebar">
                <CategorySidebar
                    tags={tags}
                    categories={categories}
                    pinnedCount={pinned.length}
                    selected={selected}
                    onSelect={setPicked}
                    onReorder={onReorderCategories}
                    onOpenMenu={onOpenCategoryMenu}
                    onRename={onRenameCategory}
                    onCreate={onCreateCategory}
                    dropTarget={tagDropSection}
                />
            </aside>

            <div className="tags-main" ref={scrollRef} onScroll={onPageScroll}>
                <div className="tags-toolbar">
                    <h1 className="tags-title">{t("nav.tags")}</h1>
                    <SearchInput
                        className="tags-filter"
                        placeholder={t("tags.filter")}
                        value={filter}
                        onChange={setFilter}
                    />
                    <TagSortButton sort={sort} onChange={setSort} />
                    <LayoutToggle layout={layout} onChange={onLayoutChange} />
                    <button className="toolbar-button play-button tags-create" onClick={() => onCreate(selectedCategory)}>
                        <Plus size={14} /> {t("tags.new")}
                    </button>
                </div>

                {tags.length === 0 && categories.length === 0 ? (
                    <div className="tags-empty">
                        <Tag size={28} />
                        <span>{t("tags.empty")}</span>
                    </div>
                ) : selected === PINNED ? (
                    shownPinned.length > 0 ? items(shownPinned, null, PINNED) : <div className="tags-empty">{t("tags.noMatch")}</div>
                ) : categories.length === 0 && pinned.length === 0 ? (
                    shown.length > 0 ? items(shown, null) : <div className="tags-empty">{t("tags.noMatch")}</div>
                ) : groups.length === 0 && shownPinned.length === 0 ? (
                    <div className="tags-empty">{t("tags.noMatch")}</div>
                ) : (
                    <div className={`tag-sections ${draggedTag ? "is-reordering" : ""}`}>
                        {selected === null && shownPinned.length > 0 && (() => {
                            // Not a drop target: pinning is not a category.
                            const isCollapsed = collapsed.includes(PINNED) && !query;
                            return (
                                <section className="tag-section">
                                    <div className="tag-section-header">
                                        <button
                                            className="tag-section-toggle"
                                            title={isCollapsed ? t("tags.expand") : t("tags.collapse")}
                                            aria-expanded={!isCollapsed}
                                            onClick={() => toggleCollapsed(PINNED)}
                                        >
                                            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        <Pin size={14} className="tag-section-icon" />
                                        <h2 className="tag-section-name">{t("tags.pinned")}</h2>
                                        <span className="tag-section-count">{shownPinned.length}</span>
                                    </div>
                                    {!isCollapsed && items(shownPinned, null, PINNED)}
                                </section>
                            );
                        })()}
                        {groups.map(({ category, tags: inGroup }) => {
                            const id = category?.id ?? "";
                            // One category picked, or a filter: what it holds is shown.
                            const isCollapsed = selected === null && collapsed.includes(id) && !query;
                            return (
                                <section
                                    key={id || "none"}
                                    className={`tag-section ${tagDropSection === id ? "drop-into" : ""}`}
                                    data-section={id}
                                >
                                    <div className="tag-section-header">
                                        {selected === null && (
                                            <button
                                                className="tag-section-toggle"
                                                title={isCollapsed ? t("tags.expand") : t("tags.collapse")}
                                                aria-expanded={!isCollapsed}
                                                onClick={() => toggleCollapsed(id)}
                                            >
                                                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        )}
                                        <h2
                                            className="tag-section-name"
                                            title={category ? t("tags.renameHint") : undefined}
                                            onDoubleClick={() => category && onRenameCategory(category)}
                                        >
                                            {category?.name ?? t("tags.noCategory")}
                                        </h2>
                                        <span className="tag-section-count">{inGroup.length}</span>
                                        {category && (
                                            <>
                                                <button
                                                    className="tag-section-button"
                                                    title={t("tags.newTagIn")}
                                                    onClick={() => onCreate(category)}
                                                >
                                                    <Plus size={16} />
                                                </button>
                                                <button
                                                    className="tag-section-button"
                                                    title={t("common.more")}
                                                    aria-haspopup="menu"
                                                    onClick={(e) => {
                                                        const box = e.currentTarget.getBoundingClientRect();
                                                        onOpenCategoryMenu(category, box.right - 200, box.bottom + 2);
                                                    }}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {isCollapsed ? null : inGroup.length > 0 ? items(inGroup, category) : (
                                        <div className="tag-section-empty">
                                            {category ? t("tags.categoryEmpty") : t("tags.dropToUncategorize")}
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
