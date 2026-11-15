import { libraryShellPropsFromModel, type LibraryShellPropsFromModelArgs } from "../app/libraryShellPropsFromModel";
import type { LibraryAppShellProps } from "../app/libraryShellProps";

export type LibraryModelShellBundles = {
	core: Pick<LibraryShellPropsFromModelArgs,
		| "listView" | "settings" | "theme" | "setTheme" | "setDrawerOpen" | "catalog" | "viewGroup" | "list"
		| "cardFilter" | "cardLayout" | "hasTrackList" | "goToPicker" | "showView" | "playingKey" | "drawerOpen"
		| "files" | "trackStats" | "playlists" | "tracksByPath" | "layouts" | "setLayout"
		| "playlistsFilter" | "setPlaylistsFilter" | "tagsFilter" | "setTagsFilter"
		| "artistsFilter" | "setArtistsFilter" | "albumsFilter" | "setAlbumsFilter"
		| "currentTag" | "renamingId" | "setRenamingId" | "settingCover" | "isPhone" | "activePath"
	>;
	playlists: Pick<LibraryShellPropsFromModelArgs,
		| "playTracks" | "playPlaylist" | "playingIn" | "playlistMenu" | "pins" | "createPlaylist" | "openEditor"
		| "m3uDesktop" | "importM3uPlaylist" | "tags" | "tracksOfTag" | "moveTag" | "categoryMenu"
		| "setTagDialog" | "setCategoryDialog" | "deleteTag" | "exportTracksAsM3u" | "goBack" | "backTo"
		| "exportHeaderAction" | "coverEntries" | "pasteCover" | "applyCoverToTracks" | "deletePlaylist"
		| "playFrom" | "addToPlaylist" | "createPlaylistWith" | "saveSmartPlaylist"
	>;
	listUi: Pick<LibraryShellPropsFromModelArgs,
		| "toggleFavorites" | "removeRowsFromPlaylist" | "deleteSelected" | "groupMenu"
		| "selectionMenu" | "trackMenu" | "tagMenu" | "panelTab" | "setPanelTab"
	>;
	player: Pick<LibraryShellPropsFromModelArgs,
		| "queuePanel" | "detailPanel" | "currentTrack" | "isPlaying" | "togglePlay" | "onPrev" | "onNext"
		| "previousTrack" | "nowPlayingOpen" | "setNowPlayingOpen" | "phonePanel" | "setPhonePanel"
		| "leavePlayer" | "queue" | "element" | "isShuffle" | "repeatMode" | "seek" | "toggleShuffle"
		| "toggleRepeatMode" | "sleep" | "eq" | "goToEntries" | "liveClipboardTags" | "copyTrackTags"
		| "pasteTrackTags" | "addTrackTags" | "canOpenArtist" | "openArtist" | "openAlbum" | "volume"
		| "setVolume" | "playAt" | "removeFromQueue" | "setUpcoming" | "playNext" | "addToQueue"
		| "setPlayingFrom"
	>;
	chrome: Pick<LibraryShellPropsFromModelArgs,
		| "setMenu" | "menu" | "closeMenu" | "updateDialogOpen" | "changelogOpen"
		| "editing" | "saveMetadata" | "saveAlbumPackage" | "renameTrack" | "renameManyFromTags" | "fillManyFromNames"
		| "setEditing" | "albumEditor" | "setAlbumEditor" | "showView"
		| "m3uMissing" | "setM3uMissing" | "addTo" | "setAddTo" | "editor" | "setEditor"
		| "tagPicker" | "tagDialog" | "setTagPicker" | "mergeTag" | "setMergeTag" | "mergeTags"
		| "saveTag" | "saveCategory" | "categoryDialog"
	>;
};

export function composeLibraryShellProps(b: LibraryModelShellBundles): LibraryAppShellProps {
	return libraryShellPropsFromModel({
		...b.core,
		...b.playlists,
		...b.listUi,
		...b.player,
		...b.chrome,
	});
}
