import { MicVocal, Disc3 } from "lucide-react";
import { PlaylistsPage } from "../components/PlaylistsPage/PlaylistsPage";
import { TagsPage } from "../components/TagsPage/TagsPage";
import { SettingsPage } from "../components/SettingsPage/SettingsPage";
import { StatsPage } from "../components/StatsPage/StatsPage";
import { IncompletePage } from "../components/IncompletePage/IncompletePage";
import { CollectionPage } from "../components/CollectionPage/CollectionPage";
import { systemViewTracks, untaggedTracks, UNTAGGED_KEY } from "../utils/views";
import { groupCovers } from "../utils/groups";
import { t } from "../i18n";
import {
	PLAYLISTS_VIEW, countTracks, artistSorts, albumSorts, trackCountSections, albumDetail,
} from "../app/views";
import type { LibraryAppShellProps } from "./libraryShellProps";

export function LibraryCardViews(props: LibraryAppShellProps) {
	const {
		listView, pinned, showView, playTracks, files, trackStats, playingIn, playlists, tracksByPath,
		smartPaths, layouts, setLayout, playlistsFilter, setPlaylistsFilter, playlistMenu, setMenu, pins,
		createPlaylist, openEditor, m3uDesktop, importM3uPlaylist, tags, tagCounts, tagsFilter, setTagsFilter,
		tracksOfTag, untaggedCount, moveTag, categoryMenu, setTagDialog, setCategoryDialog, rescan, clearRecent,
		checkConflicts, theme, setTheme, settings, goToPicker, artistsByKey, listedArtists, artistsFilter,
		setArtistsFilter, albums, albumsFilter, setAlbumsFilter, tagMenu,
	} = props;

	switch (listView.kind) {
		case "playlists":
			return (
				<PlaylistsPage
					pinned={pinned}
					onOpenPinned={(id) => showView({ kind: "system", id }, PLAYLISTS_VIEW)}
					onPlayPinned={(id) => playTracks(systemViewTracks(files, id, trackStats.stats), { kind: "system", id })}
					playingPinnedId={playingIn("system")}
					playingPlaylistId={playingIn("playlist")}
					playlists={playlists.playlists}
					tracksByPath={tracksByPath}
					smartPaths={smartPaths}
					layout={layouts.playlists}
					onLayoutChange={(layout) => setLayout("playlists", layout)}
					filter={playlistsFilter}
					onFilterChange={setPlaylistsFilter}
					onOpen={(target) => showView({ kind: "playlist", id: target.id })}
					onPlay={props.playPlaylist}
					onOpenMenu={(target, x, y) => setMenu({ x, y, entries: playlistMenu(target) })}
					isPinned={(target) => pins.isPinned("playlist", target.id)}
					onCreate={createPlaylist}
					onCreateSmart={() => openEditor(null)}
					onImport={m3uDesktop ? () => void importM3uPlaylist() : undefined}
				/>
			);
		case "tags":
			return (
				<TagsPage
					tags={tags.tags}
					categories={tags.categories}
					counts={tagCounts}
					layout={layouts.tags}
					onLayoutChange={(layout) => setLayout("tags", layout)}
					filter={tagsFilter}
					onFilterChange={setTagsFilter}
					onOpen={(target) => showView({ kind: "tag", id: target.id })}
					onPlay={(target) => playTracks(tracksOfTag(target), { kind: "tag", id: target.id })}
					untaggedCount={untaggedCount}
					onOpenUntagged={() => showView({ kind: "tag", id: UNTAGGED_KEY })}
					onPlayUntagged={() => playTracks(untaggedTracks(files, trackStats.stats), { kind: "tag", id: UNTAGGED_KEY })}
					playingId={playingIn("tag")}
					onOpenMenu={(target, x, y) => setMenu({ x, y, entries: tagMenu(target) })}
					isPinned={(target) => pins.isPinned("tag", target.id)}
					onCreate={(category) => setTagDialog({ tag: null, categoryIds: category ? [category.id] : [] })}
					onCreateCategory={() => setCategoryDialog({ category: null })}
					onRenameCategory={(category) => setCategoryDialog({ category })}
					onMoveTag={moveTag}
					onOpenCategoryMenu={(target, x, y) => setMenu({ x, y, entries: categoryMenu(target) })}
				/>
			);
		case "settings":
			return (
				<SettingsPage
					theme={theme}
					onThemeChange={setTheme}
					libraryPath={settings.lastPath}
					otherRecentCount={settings.recentPaths.filter(p => p !== settings.lastPath).length}
					onChangeFolder={goToPicker}
					onRescan={rescan}
					onClearRecent={clearRecent}
					onCheckConflicts={checkConflicts}
				/>
			);
		case "stats":
			return (
				<StatsPage
					files={files}
					stats={trackStats.stats}
					artistCover={(key) => {
						const group = artistsByKey.get(key);
						return group ? groupCovers(group, 1)[0] : null;
					}}
					onPlayTrack={(track, queue) => props.playFrom("stats", track, queue)}
					onOpenArtist={(key) => showView({ kind: "artist", id: key }, { kind: "stats" })}
					onOpenView={(view) => showView(view)}
				/>
			);
		case "incomplete":
			return (
				<IncompletePage
					files={files}
					stats={trackStats.stats}
					onOpenGap={(gap) => showView({ kind: "gap", id: gap }, { kind: "incomplete" })}
				/>
			);
		case "artists":
			return (
				<CollectionPage
					memoryKey="artists"
					sorts={artistSorts()}
					sections={trackCountSections()}
					title={t("nav.artists")}
					groups={listedArtists}
					icon={MicVocal}
					round
					describe={(group) => [countTracks(group.tracks.length), group.subtitle].filter(Boolean).join(" · ")}
					emptyText={t("collection.noArtists")}
					filterPlaceholder={t("collection.filterArtists")}
					noMatchText={t("collection.noMatchArtists")}
					layout={layouts.artists}
					onLayoutChange={(layout) => setLayout("artists", layout)}
					filter={artistsFilter}
					onFilterChange={setArtistsFilter}
					onOpen={(group) => showView({ kind: "artist", id: group.key })}
					onPlay={(group) => playTracks(group.tracks, { kind: "artist", id: group.key })}
					playingKey={playingIn("artist")}
					onOpenMenu={(group, x, y) =>
						setMenu({ x, y, entries: props.groupMenu(group, { kind: "artist", id: group.key }) })}
					isPinned={(group) => pins.isPinned("artist", group.key)}
				/>
			);
		case "albums":
			return (
				<CollectionPage
					memoryKey="albums"
					sorts={albumSorts()}
					sections={trackCountSections()}
					title={t("nav.albums")}
					groups={albums}
					icon={Disc3}
					describe={(group) => [group.subtitle ?? t("common.unknownArtist"), group.year].filter(Boolean).join(" · ")}
					detail={albumDetail}
					emptyText={t("collection.noAlbums")}
					filterPlaceholder={t("collection.filterAlbums")}
					noMatchText={t("collection.noMatchAlbums")}
					layout={layouts.albums}
					onLayoutChange={(layout) => setLayout("albums", layout)}
					filter={albumsFilter}
					onFilterChange={setAlbumsFilter}
					onOpen={(group) => showView({ kind: "album", id: group.key })}
					onPlay={(group) => playTracks(group.tracks, { kind: "album", id: group.key })}
					playingKey={playingIn("album")}
					onOpenMenu={(group, x, y) =>
						setMenu({ x, y, entries: props.groupMenu(group, { kind: "album", id: group.key }) })}
					isPinned={(group) => pins.isPinned("album", group.key)}
					onCreate={() => props.setAlbumEditor({ tracks: [], mode: "create" })}
					createLabel={t("album.new")}
				/>
			);
		default:
			return null;
	}
}
