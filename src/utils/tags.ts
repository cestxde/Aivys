import type { UserTag } from "../types";

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
