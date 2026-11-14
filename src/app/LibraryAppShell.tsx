import { MobileHeader, Sidebar } from "../components/Sidebar/Sidebar";
import { CARD_PAGES } from "./types";
import { SECTION_TITLES } from "./views";
import { LibraryCardViews } from "./LibraryCardViews";
import { LibraryTrackPane } from "./LibraryTrackPane";
import { LibraryDesktopPanel, LibraryPlayerChrome } from "./LibraryPlayerChrome";
import { LibraryDialogs } from "./LibraryDialogs";
import type { LibraryAppShellProps } from "./libraryShellProps";

const CARD_VIEW_KINDS = new Set<string>(CARD_PAGES);

export function LibraryAppShell(props: LibraryAppShellProps) {
	const {
		listView, settings, setDrawerOpen, viewSummary, isPhone, hasTrackList, searchQuery, setSearchQuery,
		scriptMask, availableScripts, toggleScript, setScriptMask, cardFilter, cardLayout, phoneSelecting,
		selectedRows, clearSelection, displayRows, selectAll, goToPicker, showView, tabHasContent, playingKey,
		drawerOpen, t,
	} = props;

	const cardView = CARD_VIEW_KINDS.has(listView.kind) ? <LibraryCardViews {...props} /> : null;

	return (
		<>
			<MobileHeader
				onOpenDrawer={() => setDrawerOpen(true)}
				title={t(SECTION_TITLES[listView.kind === "system" ? listView.id : listView.kind])}
				summary={listView.kind === "system" ? viewSummary : null}
				search={isPhone ? (hasTrackList ? {
					query: searchQuery,
					placeholder: t("toolbar.search"),
					onChange: setSearchQuery,
					scripts: {
						mask: scriptMask,
						available: availableScripts,
						onToggle: toggleScript,
						onClear: () => setScriptMask(0),
					},
				} : cardFilter) : null}
				layout={cardLayout}
				selection={phoneSelecting ? {
					count: selectedRows.length,
					onClear: clearSelection,
					onSelectAll: selectedRows.length < displayRows.length ? selectAll : null,
				} : null}
			/>
			<div className="app-layout">
				<Sidebar
					libraryPath={settings.lastPath}
					onChangeLibrary={goToPicker}
					view={listView}
					onViewChange={showView}
					tabHasContent={tabHasContent}
					playingKey={playingKey}
					drawerOpen={drawerOpen}
					onOpenDrawer={() => setDrawerOpen(true)}
					onCloseDrawer={() => setDrawerOpen(false)}
					swipeDrawer={isPhone}
				/>

				<main className="container">
					{cardView ?? <LibraryTrackPane {...props} />}
				</main>

				<LibraryDesktopPanel {...props} />
			</div>

			<LibraryPlayerChrome {...props} />
			<LibraryDialogs {...props} />
		</>
	);
}
