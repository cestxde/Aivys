import {
	ArrowDown, ArrowUp, Check, FolderOpen, FolderPlus, GitMerge, ListPlus, Pencil, Play, Tag, Trash2, X,
} from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { TagCategory, Track, UserTag } from "../../types";
import { tagTracks } from "../../utils/views";
import { t } from "../../i18n";
import { TAGS_VIEW } from "../../app/views";
import type { AppMenuDeps } from "./appMenuDeps";

export function createTagMenus(
	deps: AppMenuDeps,
	pinEntry: (kind: import("../usePins").PinKind, key: string) => MenuEntry,
	exportMenuEntries: (tracks: Track[], name: string) => MenuEntry[],
) {
	const {
		listView, files, trackStats, tags, showView, playTracks, setAddTo, setTagDialog, setCategoryDialog,
		setMergeTag, deleteTag, deleteCategory, moveCategory, toggleTagCategory, tracksOfCategory, setTagPicker,
	} = deps;

	const tracksOfTag = (target: UserTag): Track[] => tagTracks(files, target.id, trackStats.stats);

	const tagCategoryEntries = (target: UserTag): MenuEntry[] => [
		{ kind: "separator" },
		{ kind: "label", label: t("tags.categoriesOf") },
		...tags.categories.map((category): MenuEntry => ({
			kind: "item",
			label: category.name,
			icon: target.categoryIds?.includes(category.id) ? <Check size={16} /> : undefined,
			onSelect: () => toggleTagCategory(target, category),
		})),
		{ kind: "item", label: t("tags.newCategoryFor"), icon: <FolderPlus size={16} />, onSelect: () => setCategoryDialog({ category: null, addTag: target }) },
	];

	const tagChipMenu = (track: Track, target: UserTag): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView({ kind: "tag", id: target.id }, listView) },
		{ kind: "item", label: t("tagChip.removeFromTrack"), icon: <X size={16} />, onSelect: () => trackStats.setTrackTag([track], target.id, false) },
		{ kind: "item", label: t("detail.editTags"), icon: <Tag size={16} />, onSelect: () => setTagPicker([track]) },
		{ kind: "separator" },
		{ kind: "item", label: t("tags.editTag"), icon: <Pencil size={16} />, onSelect: () => setTagDialog({ tag: target }) },
	];

	const categoryMenu = (target: TagCategory): MenuEntry[] => {
		const index = tags.categories.findIndex(category => category.id === target.id);
		const tracks = tracksOfCategory(target);
		return [
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, disabled: tracks.length === 0, onSelect: () => playTracks(tracks, TAGS_VIEW) },
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, disabled: tracks.length === 0, onSelect: () => setAddTo(tracks) },
			{ kind: "separator" },
			{ kind: "item", label: t("tags.newTagIn"), icon: <Tag size={16} />, onSelect: () => setTagDialog({ tag: null, categoryIds: [target.id] }) },
			{ kind: "item", label: t("tags.renameCategory"), icon: <Pencil size={16} />, onSelect: () => setCategoryDialog({ category: target }) },
			{ kind: "separator" },
			{ kind: "item", label: t("tags.moveUp"), icon: <ArrowUp size={16} />, disabled: index <= 0, onSelect: () => moveCategory(target, -1) },
			{ kind: "item", label: t("tags.moveDown"), icon: <ArrowDown size={16} />, disabled: index >= tags.categories.length - 1, onSelect: () => moveCategory(target, 1) },
			{ kind: "separator" },
			{ kind: "item", label: t("common.delete"), icon: <Trash2 size={16} />, danger: true, onSelect: () => deleteCategory(target) },
		];
	};

	const tagMenu = (target: UserTag): MenuEntry[] => {
		const tracks = tracksOfTag(target);
		return [
			{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView({ kind: "tag", id: target.id }) },
			{
				kind: "item",
				label: t("common.play"),
				icon: <Play size={16} />,
				onSelect: () => playTracks(tracks, { kind: "tag", id: target.id }),
			},
			{
				kind: "item",
				label: t("common.addTo"),
				icon: <ListPlus size={16} />,
				onSelect: () => {
					if (tracks.length > 0) setAddTo(tracks);
				},
			},
			pinEntry("tag", target.id),
			...(deps.m3uDesktop ? [{ kind: "separator" as const }, ...exportMenuEntries(tracks, target.name)] : []),
			{ kind: "separator" },
			{ kind: "item", label: t("common.edit"), icon: <Pencil size={16} />, onSelect: () => setTagDialog({ tag: target }) },
			{ kind: "item", label: t("mergeTag.menu"), icon: <GitMerge size={16} />, disabled: tags.tags.length < 2, onSelect: () => setMergeTag(target) },
			...tagCategoryEntries(target),
			{ kind: "separator" },
			{ kind: "item", label: t("common.delete"), icon: <Trash2 size={16} />, danger: true, onSelect: () => deleteTag(target) },
		];
	};

	return { categoryMenu, tagChipMenu, tagMenu };
}
