import { EyeOff, Heart, ListPlus, ListX, PencilLine, Play, SquareCheck, Trash2, X } from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { ListRow } from "../../types";
import { t } from "../../i18n";
import type { AppMenuDeps } from "./appMenuDeps";

export function createTrackMenus(
	deps: AppMenuDeps,
	goToEntries: (track: import("../../types").Track, everywhere?: boolean) => MenuEntry[],
	tagEntries: (tracks: import("../../types").Track[], copyFrom?: import("../../types").Track) => MenuEntry[],
) {
	const {
		viewKey, trackStats, displayFiles, displayRows, selectedTracks, selectedRows,
		currentTag, manualPlaylist, playlists, playFrom, setAddTo, setEditing,
		selectRow, toggleFavorites, removeRowsFromPlaylist, deleteSelected, deleteTracks,
	} = deps;

	const hideEntries = (tracks: import("../../types").Track[]): MenuEntry[] => {
		const levels = tracks.map(track => trackStats.stats[track.relPath]?.hidden ?? null);
		const allHidden = levels.every(level => level != null);
		const allEverywhere = levels.every(level => level === "everywhere");
		const allLibraryOnly = levels.every(level => level === "library");
		const items: MenuEntry[] = [];
		if (allHidden) {
			items.push({
				kind: "item",
				label: t("menu.unhide"),
				icon: <EyeOff size={16} />,
				onSelect: () => trackStats.setHidden(tracks, 0),
			});
		}
		if (!allLibraryOnly && !allEverywhere) {
			items.push({
				kind: "item",
				label: t("menu.hideFromLibrary"),
				icon: <EyeOff size={16} />,
				onSelect: () => trackStats.setHidden(tracks, 1),
			});
		}
		if (!allEverywhere) {
			items.push({
				kind: "item",
				label: t("menu.hideEverywhere"),
				icon: <EyeOff size={16} />,
				onSelect: () => trackStats.setHidden(tracks, 2),
			});
		}
		return items;
	};

	const trackMenu = (row: ListRow): MenuEntry[] => {
		const favorite = trackStats.stats[row.track.relPath]?.favorite ?? false;
		const entries: MenuEntry[] = [
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playFrom(viewKey, row.track, displayFiles) },
			{
				kind: "item",
				label: t("selection.select"),
				icon: <SquareCheck size={16} />,
				onSelect: () => selectRow(row, displayRows.findIndex(r => r.key === row.key), { range: false, additive: true }),
			},
			{ kind: "separator" },
			{
				kind: "item",
				label: favorite ? t("common.removeFromFavorites") : t("common.addToFavorites"),
				icon: <Heart size={16} fill={favorite ? "currentColor" : "none"} />,
				onSelect: () => trackStats.toggleFavorite(row.track),
			},
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo([row.track]) },
			{ kind: "item", label: t("edit.menu"), icon: <PencilLine size={16} />, onSelect: () => setEditing([row.track]) },
			{ kind: "separator" },
			...hideEntries([row.track]),
			{ kind: "separator" },
			...tagEntries([row.track], row.track),
			...goToEntries(row.track),
		];
		if (currentTag) {
			const tag = currentTag;
			entries.push({
				kind: "item",
				label: t("menu.removeTag", { name: tag.name }),
				icon: <X size={16} />,
				danger: true,
				onSelect: () => trackStats.setTrackTag([row.track], tag.id, false),
			});
		}
		if (manualPlaylist && row.itemId) {
			const itemId = row.itemId;
			entries.push({
				kind: "item",
				label: t("menu.removeFromPlaylist"),
				icon: <ListX size={16} />,
				danger: true,
				onSelect: () => playlists.removeItems(manualPlaylist.id, [itemId]),
			});
		}
		entries.push({
			kind: "item",
			label: t("menu.deleteFromDisk"),
			icon: <Trash2 size={16} />,
			danger: true,
			onSelect: () => deleteTracks([row.track]),
		});
		return entries;
	};

	const selectionMenu = (): MenuEntry[] => {
		const tracks = selectedTracks;
		const allFavorite = tracks.every(track => trackStats.stats[track.relPath]?.favorite);
		const entries: MenuEntry[] = [
			{ kind: "label", label: t("selection.count", { count: tracks.length }) },
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playFrom(viewKey, tracks[0], tracks) },
			{ kind: "separator" },
			{
				kind: "item",
				label: allFavorite ? t("common.removeFromFavorites") : t("common.addToFavorites"),
				icon: <Heart size={16} fill={allFavorite ? "currentColor" : "none"} />,
				onSelect: () => toggleFavorites(tracks),
			},
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo(tracks) },
			{ kind: "item", label: t("edit.menu"), icon: <PencilLine size={16} />, onSelect: () => setEditing(tracks) },
			{ kind: "separator" },
			...hideEntries(tracks),
			{ kind: "separator" },
			...tagEntries(tracks),
		];
		if (currentTag) {
			const tag = currentTag;
			entries.push({
				kind: "item",
				label: t("menu.removeTag", { name: tag.name }),
				icon: <X size={16} />,
				danger: true,
				onSelect: () => trackStats.setTrackTag(tracks, tag.id, false),
			});
		}
		if (manualPlaylist) {
			const rows = selectedRows;
			entries.push({
				kind: "item",
				label: t("menu.removeFromPlaylist"),
				icon: <ListX size={16} />,
				danger: true,
				onSelect: () => {
					removeRowsFromPlaylist(rows);
					deps.clearSelection();
				},
			});
		}
		entries.push({ kind: "item", label: t("menu.deleteFromDisk"), icon: <Trash2 size={16} />, danger: true, onSelect: deleteSelected });
		return entries;
	};

	const queueMenu = (row: ListRow): MenuEntry[] => {
		const position = Number(row.itemId);
		return [
			{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => deps.playAt(position) },
			{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo([row.track]) },
			{ kind: "separator" },
			...goToEntries(row.track),
			{ kind: "item", label: t("queue.remove"), icon: <X size={16} />, danger: true, onSelect: () => deps.removeFromQueue(position) },
		];
	};

	return { trackMenu, selectionMenu, queueMenu };
}
