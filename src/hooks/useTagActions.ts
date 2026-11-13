import { ask } from "@tauri-apps/plugin-dialog";
import type { TagChange } from "./useTags";
import type { TagCategory, Track, TrackStats, UserTag } from "../types";
import { tagTracks } from "../utils/views";
import { notifyInfo } from "../utils/notify";
import { copyTagIds } from "../utils/tagClipboard";
import { t } from "../i18n";
import type { CategoryDialogState, TagDialogState } from "../app/types";

export interface UseTagActionsOptions {
	files: Track[];
	trackStats: {
		stats: Record<string, TrackStats>;
		setTrackTag: (tracks: Track[], tagId: string, on: boolean) => void;
		replaceTags: (tracks: Track[], ids: string[]) => void;
		addTags: (tracks: Track[], ids: string[]) => void;
		reload: () => void;
	};
	tags: {
		create: (name: string, color: string, categoryIds?: string[], implies?: string[]) => Promise<UserTag | null>;
		update: (id: string, change: TagChange) => Promise<UserTag | null>;
		createCategory: (name: string) => Promise<TagCategory | null>;
		renameCategory: (id: string, name: string) => Promise<void>;
		removeCategory: (id: string) => Promise<void>;
		reorderCategories: (ids: string[]) => void;
		remove: (id: string) => Promise<boolean>;
		merge: (from: string, into: string) => Promise<boolean>;
		categories: TagCategory[];
		tags: UserTag[];
		byId: Map<string, UserTag>;
	};
	tagCounts: Map<string, number>;
	tagClipboard: readonly string[];
	tagDialog: TagDialogState | null;
	categoryDialog: CategoryDialogState | null;
	setTagDialog: (state: TagDialogState | null) => void;
	setCategoryDialog: (state: CategoryDialogState | null) => void;
	setMergeTag: (tag: UserTag | null) => void;
	pins: { reload: () => void };
	playlists: { reload: () => void };
}

export function useTagActions({
	files,
	trackStats,
	tags,
	tagCounts,
	tagClipboard,
	tagDialog,
	categoryDialog,
	setTagDialog,
	setCategoryDialog,
	setMergeTag,
	pins,
	playlists,
}: UseTagActionsOptions) {
	/** Known tag ids from the clipboard (deleted tags are dropped). */
	const liveClipboardTags = () => tagClipboard.filter(id => tags.byId.has(id));

	const copyTrackTags = (track: Track) => {
		copyTagIds(trackStats.stats[track.relPath]?.tags ?? []);
		notifyInfo(t("tags.copied"));
	};

	const pasteTrackTags = (tracks: Track[]) => {
		const ids = liveClipboardTags();
		if (ids.length === 0) return;
		trackStats.replaceTags(tracks, ids);
		notifyInfo(t("tags.pasted"));
	};

	const addTrackTags = (tracks: Track[]) => {
		const ids = liveClipboardTags();
		if (ids.length === 0) return;
		trackStats.addTags(tracks, ids);
		notifyInfo(t("tags.added"));
	};

	const saveTag = async (name: string, color: string, categoryIds: string[], implies: string[]) => {
		const edited = tagDialog?.tag;
		const assignTo = tagDialog?.assignTo;
		setTagDialog(null);
		if (!edited) {
			const created = await tags.create(name, color, categoryIds, implies);
			if (created && assignTo) trackStats.setTrackTag(assignTo, created.id, true);
			return;
		}
		const change: TagChange = {};
		if (name !== edited.name) change.name = name;
		if (color !== edited.color) change.color = color;
		const before = edited.categoryIds ?? [];
		if (categoryIds.length !== before.length || categoryIds.some(id => !before.includes(id))) change.categoryIds = categoryIds;
		const beforeImplies = edited.implies ?? [];
		if (implies.length !== beforeImplies.length || implies.some(id => !beforeImplies.includes(id))) change.implies = implies;
		if (Object.keys(change).length > 0) await tags.update(edited.id, change);
	};

	const saveCategory = async (name: string) => {
		const edited = categoryDialog?.category;
		const addTag = categoryDialog?.addTag;
		setCategoryDialog(null);
		if (edited) {
			if (name !== edited.name) await tags.renameCategory(edited.id, name);
			return;
		}
		const created = await tags.createCategory(name);
		if (created && addTag) await tags.update(addTag.id, { categoryIds: [...(addTag.categoryIds ?? []), created.id] });
	};

	/** Put a tag in `category`, or take it out. */
	const toggleTagCategory = (target: UserTag, category: TagCategory) => {
		const ids = target.categoryIds ?? [];
		tags.update(target.id, {
			categoryIds: ids.includes(category.id) ? ids.filter(id => id !== category.id) : [...ids, category.id],
		});
	};

	/** A tag dragged from one category's section to another's: moved there, or with `copy` added. */
	const moveTag = (target: UserTag, from: TagCategory | null, to: TagCategory | null, copy: boolean) => {
		const ids = target.categoryIds ?? [];
		const kept = copy || !from ? ids : ids.filter(id => id !== from.id);
		const next = to && !kept.includes(to.id) ? [...kept, to.id] : kept;
		if (next.length !== ids.length || next.some(id => !ids.includes(id))) tags.update(target.id, { categoryIds: next });
	};

	/** The tracks with any tag of `category`, newest first like a tag's. */
	const tracksOfCategory = (category: TagCategory): Track[] => {
		const ids = new Set(tags.tags.filter(tag => tag.categoryIds?.includes(category.id)).map(tag => tag.id));
		return files
			.filter(f => trackStats.stats[f.relPath]?.tags?.some(id => ids.has(id)))
			.sort((a, b) => b.dateCreated - a.dateCreated);
	};

	/** Delete a category (after confirming); its tags stay. */
	const deleteCategory = async (target: TagCategory) => {
		const confirmed = await ask(t("confirm.deleteCategory.body", { name: target.name }), {
			title: t("confirm.deleteCategory.title"),
			kind: "warning",
			okLabel: t("common.delete"),
			cancelLabel: t("common.cancel"),
		});
		if (confirmed) await tags.removeCategory(target.id);
	};

	/** Move a category one place up (-1) or down (1). */
	const moveCategory = (target: TagCategory, step: number) => {
		const ids = tags.categories.map(category => category.id);
		const from = ids.indexOf(target.id);
		const to = from + step;
		if (from < 0 || to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to], ids[from]];
		tags.reorderCategories(ids);
	};

	const deleteTag = async (target: UserTag) => {
		const count = tagCounts.get(target.id) ?? 0;
		const body = count > 0
			? t("confirm.deleteTag.bodyUsed", { name: target.name, count })
			: t("confirm.deleteTag.body", { name: target.name });
		const confirmed = await ask(body, {
			title: t("confirm.deleteTag.title"),
			kind: "warning",
			okLabel: t("common.delete"),
			cancelLabel: t("common.cancel"),
		});
		if (confirmed && await tags.remove(target.id)) trackStats.reload();
	};

	/** Merge `from` into `into` after a warning that `from` is deleted. */
	const mergeTags = async (from: UserTag, into: UserTag) => {
		const count = tagCounts.get(from.id) ?? 0;
		const confirmed = await ask(t("confirm.mergeTag.body", { from: from.name, into: into.name, count }), {
			title: t("confirm.mergeTag.title"),
			kind: "warning",
			okLabel: t("confirm.mergeTag.ok"),
			cancelLabel: t("common.cancel"),
		});
		if (!confirmed) return;
		setMergeTag(null);
		if (await tags.merge(from.id, into.id)) {
			trackStats.reload();
			pins.reload();
			playlists.reload();
		}
	};

	const tracksOfTag = (target: UserTag): Track[] => tagTracks(files, target.id, trackStats.stats);

	return {
		liveClipboardTags,
		copyTrackTags,
		pasteTrackTags,
		addTrackTags,
		saveTag,
		saveCategory,
		toggleTagCategory,
		moveTag,
		tracksOfCategory,
		deleteCategory,
		moveCategory,
		deleteTag,
		mergeTags,
		tracksOfTag,
	};
}
