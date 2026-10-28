import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, Plus, X } from "lucide-react";
import type { TagCategory, Track, TrackStats, UserTag } from "../../types";
import { displayTitle } from "../../utils/track";
import { groupTags, sortTags } from "../../utils/tags";
import { useTagSort } from "../../hooks/useTags";
import { pinnedFirst } from "../../hooks/usePins";
import { useRememberedState, useStoredState } from "../../hooks/useRemembered";
import { TagDot } from "../TagChip/TagChip";
import { TagSortButton } from "../TagSortButton/TagSortButton";
import { CategorySidebar, PINNED, type CategoryFilter } from "../CategorySidebar/CategorySidebar";
import { t } from "../../i18n";
import "./TagPicker.css";
import { useBackLayer } from "../../hooks/useBackLayer";
import { SearchInput } from "../SearchInput/SearchInput";

interface TagPickerProps {
    tracks: Track[];
    tags: UserTag[];
    /** In the user's order. */
    categories: TagCategory[];
    /** Tagged library tracks per tag id. */
    counts: Map<string, number>;
    /** Pinned to the top (of each category). */
    isPinned: (tag: UserTag) => boolean;
    stats: Record<string, TrackStats>;
    /** Assign the tag to all `tracks`, or remove it from all of them. */
    onToggle: (tag: UserTag, assigned: boolean) => void;
    /** Create a tag named `name` (in `categoryIds`) and assign it. */
    onCreate: (name: string, categoryIds: string[]) => void;
    onClose: () => void;
}

const isIdList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === "string");

/** How well `name` matches the typed `query` (lower case): lower is closer. */
const closeness = (name: string, query: string) => {
    const lower = name.toLowerCase();
    if (lower === query) return 0;
    if (lower.startsWith(query)) return 1;
    if (lower.split(/\s+/).some(word => word.startsWith(query))) return 2;
    return 3;
};

/** A row of the list: a category's heading, or a tag (once per category it is in). */
type Entry =
    | { kind: "heading"; key: string; id: string; name: string; count: number; collapsed: boolean }
    | { kind: "tag"; key: string; tag: UserTag };

/**
 * "Tags…" for one or more tracks: a checklist by category, where every click
 * is saved at once; the sidebar shows all categories or one. Typing searches
 * all tags into one list, closest first, and highlights the closest one; with
 * no tag found, "Create" (always first) is highlighted instead. Enter applies
 * the highlighted row and clears the field for the next name; the arrow keys
 * move the highlight.
 */
export const TagPicker = ({ tracks, tags, categories, counts, isPinned, stats, onToggle, onCreate, onClose }: TagPickerProps) => {
    useBackLayer(true, onClose);
    const [filter, setFilter] = useState("");
    const [sort, setSort] = useTagSort();
    const [picked, setPicked] = useRememberedState<CategoryFilter>("tagPicker.category", null);
    const [collapsed, setCollapsed] = useStoredState<string[]>("tagPicker.collapsed", [], isIdList);
    // The highlighted row, for the query it was chosen at: a new query
    // highlights its closest row again.
    const [highlight, setHighlight] = useState<{ query: string; index: number } | null>(null);
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const pinned = tags.filter(isPinned);
    // A picked category that was deleted meanwhile (or "Pinned" with nothing
    // pinned) shows all again.
    const selected = picked === null || categories.some(c => c.id === picked) || (picked === "" && categories.length > 0)
        || (picked === PINNED && pinned.length > 0)
        ? picked
        : null;
    const query = filter.trim();
    const lower = query.toLowerCase();
    const canCreate = query !== "" && !tags.some(tag => tag.name.toLowerCase() === lower);

    const toEntry = (tag: UserTag, prefix = ""): Entry => ({ kind: "tag", key: `${prefix}:${tag.id}`, tag });
    const ordered = (list: UserTag[]) => pinnedFirst(sortTags(list, sort, counts), isPinned);
    const groups = groupTags(tags, categories);
    const entries: Entry[] = lower
        ? sortTags(tags.filter(tag => tag.name.toLowerCase().includes(lower)), sort, counts)
            .map(tag => ({ tag, rank: closeness(tag.name, lower) }))
            // Stable: within a rank the chosen order stays.
            .sort((a, b) => a.rank - b.rank)
            .map(({ tag }) => toEntry(tag))
        : selected === PINNED
            ? sortTags(pinned, sort, counts).map(tag => toEntry(tag, PINNED))
            : categories.length === 0 && pinned.length === 0
            ? ordered(tags).map(tag => toEntry(tag))
            : selected !== null
                ? ordered(groups.find(group => (group.category?.id ?? "") === selected)?.tags ?? [])
                    .map(tag => toEntry(tag, selected))
                // All: the pinned first, then the categories (or, without any, the rest).
                : [
                    ...(pinned.length > 0 ? [{ id: PINNED, name: t("tags.pinned"), tags: pinned }] : []),
                    ...(categories.length > 0
                        ? groups.map(({ category, tags: inGroup }) => ({ id: category?.id ?? "", name: category?.name ?? t("tags.noCategory"), tags: inGroup }))
                        : [{ id: "", name: t("tags.noCategory"), tags: tags.filter(tag => !isPinned(tag)) }]),
                ]
                    .filter(group => group.tags.length > 0)
                    .flatMap(({ id, name, tags: inGroup }): Entry[] => {
                        const isCollapsed = collapsed.includes(id);
                        return [
                            { kind: "heading", key: `heading:${id}`, id, name, count: inGroup.length, collapsed: isCollapsed },
                            ...(isCollapsed ? [] : ordered(inGroup).map(tag => toEntry(tag, id))),
                        ];
                    });
    const tagEntries = entries.flatMap(entry => (entry.kind === "tag" ? [entry] : []));

    /** How many of the tracks have the tag. */
    const countOf = (tag: UserTag) =>
        tracks.filter(track => stats[track.relPath]?.tags.includes(tag.id)).length;

    // The rows Enter and the arrows go through: "Create" first, then the tags.
    const rowCount = (canCreate ? 1 : 0) + tagEntries.length;
    const closest = query === "" ? -1 : canCreate && tagEntries.length > 0 ? 1 : 0;
    const highlighted = highlight?.query === query ? Math.min(highlight.index, rowCount - 1) : closest;
    const indexOf = (key: string) => tagEntries.findIndex(entry => entry.key === key) + (canCreate ? 1 : 0);

    const subject = tracks.length === 1 ? displayTitle(tracks[0]) : t("common.tracks", { count: tracks.length });

    // A new tag starts in the category shown.
    const create = () => {
        if (!canCreate) return;
        onCreate(query, selected ? [selected] : []);
        setFilter("");
    };

    const toggle = (tag: UserTag) => onToggle(tag, countOf(tag) < tracks.length);

    const apply = () => {
        if (highlighted < 0) return;
        if (canCreate && highlighted === 0) {
            create();
            return;
        }
        toggle(tagEntries[highlighted - (canCreate ? 1 : 0)].tag);
        setFilter("");
    };

    const move = (step: number) => {
        if (rowCount === 0) return;
        const from = highlighted < 0 ? (step > 0 ? -1 : rowCount) : highlighted;
        setHighlight({ query, index: (from + step + rowCount) % rowCount });
    };

    const toggleCollapsed = (id: string) =>
        setCollapsed(collapsed.includes(id) ? collapsed.filter(other => other !== id) : [...collapsed, id]);

    useLayoutEffect(() => {
        list.current?.querySelector(".highlighted")?.scrollIntoView({ block: "nearest" });
    }, [highlighted, query]);

    const rowProps = (index: number) => ({
        onPointerMove: () => {
            if (highlighted !== index) setHighlight({ query, index });
        },
    });

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div
                className={`add-to-dialog tag-picker ${categories.length > 0 || pinned.length > 0 ? "with-sidebar" : ""}`}
                role="dialog"
                aria-label={t("tagPicker.title")}
            >
                <div className="add-to-header">
                    <div className="add-to-heading">
                        <h2>{t("tagPicker.title")}</h2>
                        <span className="add-to-subject">{subject}</span>
                    </div>
                    <button className="add-to-close" title={t("common.close")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="tag-picker-body">
                    {(categories.length > 0 || pinned.length > 0) && (
                        <CategorySidebar
                            tags={tags}
                            categories={categories}
                            pinnedCount={pinned.length}
                            selected={selected}
                            onSelect={setPicked}
                        />
                    )}

                    <div className="tag-picker-main">
                        <div className="tag-picker-search">
                            <SearchInput
                                placeholder={tags.length > 0 ? t("tagPicker.find") : t("tagPicker.nameNew")}
                                value={filter}
                                autoFocus
                                onChange={setFilter}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") apply();
                                    else if (e.key === "ArrowDown") move(1);
                                    else if (e.key === "ArrowUp") move(-1);
                                    else return;
                                    e.preventDefault();
                                }}
                            />
                            {tags.length > 1 && <TagSortButton sort={sort} onChange={setSort} />}
                        </div>

                        <div className="add-to-list tag-picker-list" ref={list}>
                            {canCreate && (
                                <button
                                    className={`add-to-row tag-picker-row ${highlighted === 0 ? "highlighted" : ""}`}
                                    onClick={create}
                                    {...rowProps(0)}
                                >
                                    <span className="tag-picker-check"><Plus size={14} /></span>
                                    <span className="add-to-row-name">{t("tagPicker.create", { name: query })}</span>
                                </button>
                            )}

                            {entries.map(entry => {
                                if (entry.kind === "heading") {
                                    return (
                                        <button
                                            key={entry.key}
                                            className="tag-picker-heading"
                                            aria-expanded={!entry.collapsed}
                                            title={entry.collapsed ? t("tags.expand") : t("tags.collapse")}
                                            onClick={() => toggleCollapsed(entry.id)}
                                        >
                                            {entry.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                            {entry.name}
                                            <span className="tag-picker-heading-count">{entry.count}</span>
                                        </button>
                                    );
                                }
                                const { tag } = entry;
                                const index = indexOf(entry.key);
                                const count = countOf(tag);
                                const all = count > 0 && count === tracks.length;
                                const state = all ? "on" : count > 0 ? "mixed" : "off";
                                const tracksWith = counts.get(tag.id) ?? 0;
                                return (
                                    <button
                                        key={entry.key}
                                        className={`add-to-row tag-picker-row ${state} ${highlighted === index ? "highlighted" : ""}`}
                                        role="checkbox"
                                        aria-checked={all ? true : count > 0 ? "mixed" : false}
                                        onClick={() => toggle(tag)}
                                        {...rowProps(index)}
                                    >
                                        <span className="tag-picker-check">
                                            {all && <Check size={14} />}
                                            {state === "mixed" && <Minus size={14} />}
                                        </span>
                                        <TagDot color={tag.color} size={12} />
                                        <span className="add-to-row-name">{tag.name}</span>
                                        <span className="tag-picker-count" title={t("common.tracks", { count: tracksWith })}>
                                            ({tracksWith})
                                        </span>
                                        {state === "mixed" && (
                                            <span className="add-to-row-meta">{t("tagPicker.partial", { count, total: tracks.length })}</span>
                                        )}
                                    </button>
                                );
                            })}

                            {tags.length === 0 && !canCreate && (
                                <div className="add-to-empty">{t("tagPicker.empty")}</div>
                            )}
                            {tags.length > 0 && tagEntries.length === 0 && !canCreate && entries.length === 0 && (
                                <div className="add-to-empty">{query ? t("tagPicker.noMatch") : t("tagPicker.categoryEmpty")}</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
