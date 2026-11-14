import { MicVocal, Disc3, Folder, PencilLine } from "lucide-react";
import { TagHeader } from "../components/TagHeader/TagHeader";
import { UntaggedHeader } from "../components/UntaggedHeader/UntaggedHeader";
import { GapHeader } from "../components/GapHeader/GapHeader";
import { GroupHeader, FolderGrid } from "../components/GroupHeader/GroupHeader";
import { PlaylistHeader } from "../components/PlaylistHeader/PlaylistHeader";
import { SelectionBar } from "../components/SelectionBar/SelectionBar";
import { Toolbar } from "../components/ToolBar/ToolBar";
import { AlbumStrip } from "../components/AlbumStrip/AlbumStrip";
import { TrackList } from "../components/TrackList/TrackList";
import { UNTAGGED_KEY } from "../utils/views";
import { albumEditorSeedFromGroup } from "../utils/albumEditor";
import { groupCovers, folderTracks } from "../utils/groups";
import { androidStorage } from "../utils/androidStorage";
import { t } from "../i18n";
import { SYSTEM_TITLES, lastSegment, folderCrumbs } from "../app/views";
import type { LibraryAppShellProps } from "./libraryShellProps";

export function LibraryTrackPane(props: LibraryAppShellProps) {
	const {
		listView, currentTag, viewRows, goBack, setTagDialog, deleteTag, m3uDesktop, exportTracksAsM3u,
		displayFiles, currentGroup, settingCover, exportHeaderAction, coverEntries, backTo, settings, showView,
		playlist, missingCount, renamingId, setRenamingId, playlists, openEditor, pasteCover, applyCoverToTracks,
		selectedRows, selectedTracks, trackStats, manualPlaylist, clearSelection, playFrom, viewKey, toggleFavorites,
		removeRowsFromPlaylist, deleteSelected, selectAll, searchQuery, setSearchQuery, scriptMask, availableScripts,
		toggleScript, setScriptMask, viewSort, defaultLabel, handleSortChange, listDisplay, viewSorts, sortScope,
		rowSection, isSearching, sortLocked, handleShuffleView, handlePlayAll, listRef, onListScroll, isFiltering,
		artistAlbums, playingIn, playTracks, groupMenu, files, currentSubfolders, activePath, looseFromIndex,
		rowHint, albumNumber, emptyText, selectedKeys, selectRow, selectSpan, selectionMenu, trackMenu, setMenu, setAddTo,
		setTagPicker, setEditing, setAlbumEditor,
	} = props;

	return (
		<>
			{currentTag && (
				<TagHeader
					tag={currentTag}
					rows={viewRows}
					onBack={goBack}
					onEdit={() => setTagDialog({ tag: currentTag })}
					onDelete={() => deleteTag(currentTag)}
					onExport={m3uDesktop
						? () => void exportTracksAsM3u(displayFiles, currentTag.name, "relative")
						: undefined}
				/>
			)}

			{listView.kind === "tag" && listView.id === UNTAGGED_KEY && (
				<UntaggedHeader
					rows={viewRows}
					onBack={goBack}
					onExport={m3uDesktop
						? () => void exportTracksAsM3u(displayFiles, t("tags.untagged"), "relative")
						: undefined}
				/>
			)}

			{listView.kind === "gap" && (
				<GapHeader gap={listView.id} rows={viewRows} onBack={goBack} />
			)}

			{currentGroup && listView.kind === "artist" && (
				<GroupHeader
					kind={t("group.artist")}
					icon={MicVocal}
					round
					title={currentGroup.name}
					details={[currentGroup.subtitle]}
					covers={groupCovers(currentGroup, 1)}
					rows={viewRows}
					backTitle={t("group.allArtists")}
					onBack={goBack}
					actions={exportHeaderAction(displayFiles, currentGroup.name)}
					coverActions={coverEntries("artist", currentGroup)}
					loading={settingCover?.kind === "artist" && settingCover.key === currentGroup.key}
				/>
			)}
			{currentGroup && listView.kind === "album" && (
				<GroupHeader
					kind={t("group.album")}
					icon={Disc3}
					title={currentGroup.name}
					details={[currentGroup.subtitle, currentGroup.year != null ? String(currentGroup.year) : null]}
					trackTotal={currentGroup.total}
					covers={groupCovers(currentGroup, 1)}
					rows={viewRows}
					backTitle={t("group.allAlbums")}
					onBack={goBack}
					actions={[
						{
							kind: "item",
							label: t("album.edit"),
							icon: <PencilLine size={16} />,
							onSelect: () => setAlbumEditor({
								tracks: currentGroup.tracks,
								mode: "edit",
								seed: albumEditorSeedFromGroup(currentGroup),
							}),
						},
						...exportHeaderAction(displayFiles, currentGroup.name),
					]}
					coverActions={coverEntries("album", currentGroup)}
					loading={settingCover?.kind === "album" && settingCover.key === currentGroup.key}
				/>
			)}
			{currentGroup && listView.kind === "folder" && (
				<GroupHeader
					kind={t("group.folder")}
					icon={Folder}
					title={currentGroup.name}
					covers={groupCovers(currentGroup)}
					rows={viewRows}
					crumbs={listView.id ? folderCrumbs(listView.id, lastSegment(settings.lastPath), showView).slice(0, -1) : undefined}
					backTitle={t("group.parentFolder")}
					onBack={listView.id || backTo ? goBack : undefined}
					actions={exportHeaderAction(displayFiles, currentGroup.name)}
				/>
			)}

			{playlist && (
				<PlaylistHeader
					key={playlist.id}
					playlist={playlist}
					rows={viewRows}
					missingCount={missingCount}
					startRenaming={renamingId === playlist.id}
					onBack={goBack}
					onRename={(name) => {
						setRenamingId(null);
						playlists.rename(playlist.id, name);
					}}
					onDelete={() => props.deletePlaylist(playlist)}
					onEditRules={() => openEditor(playlist)}
					onSetCover={(data) => playlists.setCover(playlist.id, data)}
					onClearCover={() => playlists.clearCover(playlist.id)}
					onPasteCover={androidStorage ? undefined : () => pasteCover(data => playlists.setCover(playlist.id, data))}
					onApplyCoverToTracks={playlist.coverPath && viewRows.length > 0
						? (onBusy) => applyCoverToTracks(
							viewRows.map(row => row.track),
							playlist.coverPath!,
							onBusy,
						)
						: undefined}
					onExport={m3uDesktop
						? () => void exportTracksAsM3u(displayFiles, playlist.name, "relative")
						: undefined}
				/>
			)}

			{listView.kind === "system" && (
				<div className="view-heading">
					<h1 className="view-heading-title">{t(SYSTEM_TITLES[listView.id])}</h1>
					<span className="view-heading-summary">{props.viewSummary}</span>
				</div>
			)}

			{selectedRows.length > 0 ? (
				<SelectionBar
					count={selectedRows.length}
					allFavorite={selectedTracks.every(track => trackStats.stats[track.relPath]?.favorite)}
					canSelectMore={selectedRows.length < props.displayRows.length}
					onPlay={() => playFrom(viewKey, selectedTracks[0], selectedTracks)}
					onAddTo={() => setAddTo(selectedTracks)}
					onTags={() => setTagPicker(selectedTracks)}
					onEdit={() => setEditing(selectedTracks)}
					onToggleFavorite={() => toggleFavorites(selectedTracks)}
					onRemoveFromPlaylist={manualPlaylist ? () => {
						removeRowsFromPlaylist(selectedRows);
						clearSelection();
					} : undefined}
					onDelete={deleteSelected}
					onSelectAll={selectAll}
					onClear={clearSelection}
				/>
			) : (
				<Toolbar
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					scriptMask={scriptMask}
					availableScripts={availableScripts}
					onToggleScript={toggleScript}
					onClearScripts={() => setScriptMask(0)}
					sort={viewSort}
					defaultLabel={defaultLabel}
					onSortChange={handleSortChange}
					display={listDisplay}
					onDisplayChange={(display) => viewSorts.setDisplay(sortScope ?? "playlist", display)}
					canGroup={rowSection !== null}
					sortDisabled={isSearching || sortLocked}
					onShuffleAll={handleShuffleView}
					onPlayAll={handlePlayAll}
				/>
			)}

			<div className="track-list-wrapper" ref={listRef} onScroll={onListScroll}>
				{!isFiltering && artistAlbums.length > 0 && (
					<AlbumStrip
						albums={artistAlbums}
						playingKey={playingIn("album")}
						onOpen={(album) => showView({ kind: "album", id: album.key }, listView)}
						onPlay={(album) => playTracks(album.tracks, { kind: "album", id: album.key })}
						onOpenMenu={(album, x, y) =>
							setMenu({ x, y, entries: groupMenu(album, { kind: "album", id: album.key }) })}
					/>
				)}
				{!isFiltering && currentSubfolders.length > 0 && (
					<FolderGrid
						folders={currentSubfolders}
						onOpen={(folder) => showView({ kind: "folder", id: folder.key })}
						onPlay={(folder) => playTracks(folderTracks(files, folder.key), { kind: "folder", id: folder.key })}
						playingKey={playingIn("folder")}
						onOpenMenu={(folder, x, y) => setMenu({
							x,
							y,
							entries: groupMenu(
								{ ...folder, tracks: folderTracks(files, folder.key) },
								{ kind: "folder", id: folder.key },
							),
						})}
					/>
				)}
				<TrackList
					key={`${viewKey}:${viewSort.field}:${viewSort.dir}:${listDisplay}`}
					rows={props.displayRows}
					activePath={activePath}
					looseFromIndex={looseFromIndex}
					sectionOf={!isSearching && listDisplay === "sections" ? rowSection : null}
					hintOf={!isSearching && listDisplay === "inline" ? rowHint : null}
					numberOf={!isSearching && viewSort.field === "default" ? albumNumber : null}
					emptyText={emptyText}
					onPlay={(track) => {
						clearSelection();
						playFrom(viewKey, track, displayFiles);
					}}
					selected={selectedKeys}
					onSelect={selectRow}
					onSelectSpan={selectSpan}
					onOpenMenu={(row, x, y) => {
						if (selectedKeys.has(row.key) && selectedRows.length > 1) {
							setMenu({ x, y, entries: selectionMenu() });
							return;
						}
						clearSelection();
						setMenu({ x, y, entries: trackMenu(row) });
					}}
					onReorder={manualPlaylist && viewSort.field === "default" && !isFiltering
						? (itemIds) => playlists.reorder(
							manualPlaylist.id,
							viewSort.dir === "desc" ? [...itemIds].reverse() : itemIds,
						)
						: undefined}
				/>
			</div>
		</>
	);
}
