import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FolderPlus, Layers, Pin, Tag } from "lucide-react";
import type { TagCategory, UserTag } from "../../types";
import { t } from "../../i18n";
import "./CategorySidebar.css";

/**
 * The shown tags: all (null), the pinned ones (`PINNED`), those in no
 * category (""), or a category's (its id).
 */
export type CategoryFilter = string | null;

/** The filter (and section id) of the pinned tags. */
export const PINNED = "\u0000pinned";

interface CategorySidebarProps {
    tags: UserTag[];
    /** In the user's order. */
    categories: TagCategory[];
    /** How many tags are pinned; with some, "Pinned" is offered. */
    pinnedCount: number;
    selected: CategoryFilter;
    onSelect: (selected: CategoryFilter) => void;
    /** Given, the categories are reordered by dragging them here. */
    onReorder?: (ids: string[]) => void;
    onOpenMenu?: (category: TagCategory, x: number, y: number) => void;
    onRename?: (category: TagCategory) => void;
    onCreate?: () => void;
    /** The item a tag is being dragged over ("" for no category), highlighted. */
    dropTarget?: string | null;
}

/** How far the pointer moves on a category before it is a drag, not a click. */
const DRAG_THRESHOLD = 5;

interface Drag {
    id: string;
    y: number;
    started: boolean;
}

/**
 * "All", the categories with how many tags each has, and "No category": picks
 * which tags a tag list shows. Items carry `data-section`, so a tag dragged
 * on the tags page can be dropped on them.
 */
export const CategorySidebar = ({
    tags, categories, pinnedCount, selected, onSelect, onReorder, onOpenMenu, onRename, onCreate, dropTarget = null,
}: CategorySidebarProps) => {
    const known = new Set(categories.map(category => category.id));
    const countOf = (id: string) => tags.filter(tag => tag.categoryIds?.includes(id)).length;
    const uncategorized = tags.filter(tag => !tag.categoryIds?.some(id => known.has(id))).length;

    // Reordering by dragging an item (mouse; touch uses the category menu).
    const drag = useRef<Drag | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);
    const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
    const suppressClick = useRef(false);

    const press = (e: ReactPointerEvent<HTMLElement>, id: string) => {
        suppressClick.current = false;
        if (!onReorder || e.button !== 0 || e.pointerType === "touch") return;
        drag.current = { id, y: e.clientY, started: false };
    };

    const move = (e: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current) return;
        if (!current.started) {
            if (Math.abs(e.clientY - current.y) < DRAG_THRESHOLD) return;
            current.started = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(current.id);
        }
        const item = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-category-item]");
        const id = item?.dataset.categoryItem;
        if (!item || !id) return;
        const box = item.getBoundingClientRect();
        const next = { id, after: e.clientY > box.top + box.height / 2 };
        if (drop?.id !== next.id || drop.after !== next.after) setDrop(next);
    };

    const release = (commit: boolean) => {
        const current = drag.current;
        drag.current = null;
        if (!current?.started) return;
        suppressClick.current = true;
        const target = drop;
        setDragging(null);
        setDrop(null);
        if (!commit || !target || target.id === current.id || !onReorder) return;
        const ids = categories.map(c => c.id).filter(id => id !== current.id);
        ids.splice(ids.indexOf(target.id) + (target.after ? 1 : 0), 0, current.id);
        if (ids.some((id, i) => id !== categories[i].id)) onReorder(ids);
    };

    const select = (value: CategoryFilter) => {
        if (suppressClick.current) suppressClick.current = false;
        else onSelect(value);
    };

    return (
        <nav className={`category-sidebar ${dragging ? "is-reordering" : ""}`} aria-label={t("tags.categoriesOf")}>
            <button
                className={`category-item ${selected === null ? "active" : ""}`}
                onClick={() => onSelect(null)}
            >
                <Layers size={15} />
                <span className="category-item-name">{t("tags.all")}</span>
                <span className="category-item-count">{tags.length}</span>
            </button>

            {pinnedCount > 0 && (
                <button
                    className={`category-item ${selected === PINNED ? "active" : ""}`}
                    onClick={() => onSelect(PINNED)}
                >
                    <Pin size={15} />
                    <span className="category-item-name">{t("tags.pinned")}</span>
                    <span className="category-item-count">{pinnedCount}</span>
                </button>
            )}

            {categories.map(category => {
                const line = drop?.id === category.id && dragging !== category.id
                    ? (drop.after ? "drop-after" : "drop-before")
                    : "";
                return (
                    <button
                        key={category.id}
                        className={`category-item ${selected === category.id ? "active" : ""} ${dragging === category.id ? "dragging" : ""} ${line} ${dropTarget === category.id ? "drop-into" : ""}`}
                        data-category-item={category.id}
                        data-section={category.id}
                        title={onRename ? t("tags.renameHint") : undefined}
                        onClick={() => select(category.id)}
                        onDoubleClick={() => onRename?.(category)}
                        onContextMenu={(e) => {
                            if (!onOpenMenu) return;
                            e.preventDefault();
                            onOpenMenu(category, e.clientX, e.clientY);
                        }}
                        onPointerDown={(e) => press(e, category.id)}
                        onPointerMove={move}
                        onPointerUp={() => release(true)}
                        onPointerCancel={() => release(false)}
                    >
                        <Tag size={15} />
                        <span className="category-item-name">{category.name}</span>
                        <span className="category-item-count">{countOf(category.id)}</span>
                    </button>
                );
            })}

            {categories.length > 0 && (
                <button
                    className={`category-item ${selected === "" ? "active" : ""} ${dropTarget === "" ? "drop-into" : ""}`}
                    data-section=""
                    onClick={() => onSelect("")}
                >
                    <Tag size={15} className="category-item-none" />
                    <span className="category-item-name">{t("tags.noCategory")}</span>
                    <span className="category-item-count">{uncategorized}</span>
                </button>
            )}

            {onCreate && (
                <button className="category-item category-create" onClick={onCreate}>
                    <FolderPlus size={15} />
                    <span className="category-item-name">{t("tags.newCategory")}</span>
                </button>
            )}
        </nav>
    );
};
