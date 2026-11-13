import { useCallback } from "react";
import type { AppMenuDeps } from "./menus/appMenuDeps";
import { createGoToEntries } from "./menus/goToEntries";
import { createTagEntries } from "./menus/tagEntries";
import { createExportMenus } from "./menus/exportMenus";
import { createPinEntry } from "./menus/pinEntry";
import { createTrackMenus } from "./menus/trackMenus";
import { createPlaylistMenu } from "./menus/playlistMenus";
import { createGroupMenus } from "./menus/groupMenus";
import { createTagMenus } from "./menus/tagMenus";

export type { AppMenuDeps } from "./menus/appMenuDeps";

export function useAppMenus(deps: AppMenuDeps) {
	const { setMenu } = deps;
	const closeMenu = useCallback(() => setMenu(null), [setMenu]);

	const goToEntries = createGoToEntries(deps);
	const tagEntries = createTagEntries(deps);
	const { exportMenuEntries, exportHeaderAction } = createExportMenus(deps.m3uDesktop, deps.exportTracksAsM3u);
	const pinEntry = createPinEntry(deps);
	const { trackMenu, selectionMenu, queueMenu } = createTrackMenus(deps, goToEntries, tagEntries);
	const playlistMenu = createPlaylistMenu(deps, pinEntry);
	const { groupMenu, coverEntries, pasteCover, applyCoverToTracks } = createGroupMenus(deps, tagEntries, exportMenuEntries, pinEntry);
	const { categoryMenu, tagChipMenu, tagMenu } = createTagMenus(deps, pinEntry, exportMenuEntries);

	return {
		closeMenu,
		goToEntries,
		trackMenu,
		selectionMenu,
		queueMenu,
		playlistMenu,
		groupMenu,
		categoryMenu,
		tagChipMenu,
		tagMenu,
		exportHeaderAction,
		coverEntries,
		pasteCover,
		applyCoverToTracks,
	};
}
