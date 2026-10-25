import type { TagCategory, UserTag } from "../types";

/** Preset tag colors; readable as dots and tints in light and dark themes. */
export const TAG_COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6",
    "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b",
];

/** A preset color no tag uses yet, cycling once all are taken. */
export const nextTagColor = (tags: UserTag[]): string =>
    TAG_COLORS.find(color => !tags.some(tag => tag.color === color))
    ?? TAG_COLORS[tags.length % TAG_COLORS.length];

/** The live tags among assigned tag ids, in the given order. */
export const tagsOf = (ids: string[] | undefined, byId: Map<string, UserTag>): UserTag[] =>
    (ids ?? []).flatMap(id => byId.get(id) ?? []);

/** How tags are ordered within a category: most tracks first, or by name. */
export type TagSort = "count" | "name";

export const isTagSort = (value: unknown): value is TagSort => value === "count" || value === "name";

/** `tags` in `sort` order; `counts` holds the tagged tracks per tag id. */
export const sortTags = (tags: UserTag[], sort: TagSort, counts: Map<string, number>): UserTag[] =>
    [...tags].sort((a, b) =>
        (sort === "count" ? (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) : 0)
        || a.name.localeCompare(b.name));

/** The tags of one category, or (`category` null) the tags in none. */
export interface TagGroup {
    category: TagCategory | null;
    tags: UserTag[];
}

/**
 * `tags` by category, in the categories' order, a tag in several of them in
 * each; the tags in none come last. Groups may be empty.
 */
export const groupTags = (tags: UserTag[], categories: TagCategory[]): TagGroup[] => {
    const known = new Set(categories.map(category => category.id));
    return [
        ...categories.map(category => ({ category, tags: tags.filter(tag => tag.categoryIds?.includes(category.id)) })),
        { category: null, tags: tags.filter(tag => !tag.categoryIds?.some(id => known.has(id))) },
    ];
};
