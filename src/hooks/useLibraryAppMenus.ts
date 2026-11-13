import type { AppMenuDeps } from "./menus/appMenuDeps";
import { useAppMenus } from "./useAppMenus";
import type { LibraryGroupCatalog } from "./useLibraryCollections";
import type { LibraryListState } from "./useLibraryListState";

export type LibraryAppMenusInput = Omit<AppMenuDeps,
	"viewKey" | "showFolders" | "artistsByKey" | "albumsByKey" | "manualPlaylist"
	| "groupCoverStore" | "displayFiles" | "displayRows" | "selectedTracks" | "selectedRows" | "selectRow"
	| "clearSelection"
> & {
	list: LibraryListState;
	catalog: LibraryGroupCatalog;
};

export function useLibraryAppMenus({ list, catalog, ...rest }: LibraryAppMenusInput) {
	return useAppMenus({
		...rest,
		viewKey: list.viewKey,
		showFolders: catalog.showFolders,
		artistsByKey: catalog.artistsByKey,
		albumsByKey: catalog.albumsByKey,
		manualPlaylist: list.manualPlaylist,
		groupCoverStore: catalog.groupCoverStore,
		displayFiles: list.displayFiles,
		displayRows: list.displayRows,
		selectedTracks: list.selectedTracks,
		selectedRows: list.selectedRows,
		selectRow: list.selectRow,
		clearSelection: list.clearSelection,
	});
}
