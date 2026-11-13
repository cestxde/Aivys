import { ClipboardCopy, ClipboardPaste, ListPlus, Tag } from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { Track } from "../../types";
import { t } from "../../i18n";
import type { AppMenuDeps } from "./appMenuDeps";

export function createTagEntries(deps: AppMenuDeps) {
	const {
		trackStats, setTagPicker, copyTrackTags, pasteTrackTags, addTrackTags, liveClipboardTags,
	} = deps;

	return (tracks: Track[], copyFrom?: Track): MenuEntry[] => {
		const items: MenuEntry[] = [
			{ kind: "item", label: t("menu.editTags"), icon: <Tag size={16} />, onSelect: () => setTagPicker(tracks) },
		];
		const copyTags = copyFrom ? trackStats.stats[copyFrom.relPath]?.tags ?? [] : [];
		if (copyFrom && copyTags.length > 0) {
			items.push({
				kind: "item",
				label: t("menu.copyTags"),
				icon: <ClipboardCopy size={16} />,
				onSelect: () => copyTrackTags(copyFrom),
			});
		}
		if (liveClipboardTags().length > 0) {
			items.push(
				{ kind: "item", label: t("menu.pasteTags"), icon: <ClipboardPaste size={16} />, onSelect: () => pasteTrackTags(tracks) },
				{ kind: "item", label: t("menu.addTags"), icon: <ListPlus size={16} />, onSelect: () => addTrackTags(tracks) },
			);
		}
		return [{ kind: "label", label: t("menu.tags") }, ...items, { kind: "separator" }];
	};
}
