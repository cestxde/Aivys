import { UpdateDialog } from "../components/UpdateDialog/UpdateDialog";
import { ChangelogDialog } from "../components/UpdateDialog/ChangelogDialog";
import { AlbumEditorDialog } from "../components/AlbumEditorDialog/AlbumEditorDialog";
import { MetadataEditor } from "../components/MetadataEditor/MetadataEditor";
import { M3uMissingDialog } from "../components/M3uImportDialog/M3uMissingDialog";
import { AddToDialog } from "../components/AddToDialog/AddToDialog";
import { mergeIntoAlbumTracks } from "../utils/albumAddWarn";
import { albumEditorSeedFromGroup } from "../utils/albumEditor";
import { albumDraftId, clearDraft } from "../utils/editorDrafts";
import { SmartPlaylistEditor } from "../components/SmartPlaylistEditor/SmartPlaylistEditor";
import { TagPicker } from "../components/TagPicker/TagPicker";
import { TagDialog } from "../components/TagDialog/TagDialog";
import { MergeTagDialog } from "../components/TagPicker/MergeTagDialog";
import { CategoryDialog } from "../components/TagDialog/CategoryDialog";
import { Notices } from "../components/Notices/Notices";
import { savePosition } from "../utils/session";
import { notifyInfo } from "../utils/notify";
import { nextTagColor } from "../utils/tags";
import { t } from "../i18n";
import type { LibraryAppShellProps } from "./libraryShellProps";

export function LibraryDialogs(props: LibraryAppShellProps) {
	const {
		updateDialogOpen, changelogOpen, editing, saveMetadata, saveAlbumPackage, renameTrack, renameManyFromTags,
		fillManyFromNames, setEditing, albumEditor, setAlbumEditor, showView, files, m3uMissing, setM3uMissing, addTo,
		playlists, tracksByPath, artists, albums, linkedByPath, trackStats, activePath, playNext, setPlayingFrom,
		addToQueue, addToPlaylist, createPlaylistWith, editor, saveSmartPlaylist, setEditor, tagPicker, tagDialog,
		setTagPicker, tags, tagCounts, pins, mergeTag, setMergeTag, mergeTags, saveTag, saveCategory, categoryDialog,
		setTagDialog, setCategoryDialog, element, copyTrackTags, pasteTrackTags, addTrackTags, liveClipboardTags,
		setAddTo,
	} = props;

	return (
		<>
			{updateDialogOpen && (
				<UpdateDialog
					onBeforeInstall={() => {
						element.pause();
						if (activePath) savePosition(activePath, element.currentTime);
					}}
				/>
			)}
			{changelogOpen && <ChangelogDialog />}

			{editing && (
				<MetadataEditor
					tracks={editing}
					onSave={(edit) => saveMetadata(editing, edit)}
					onRename={editing.length === 1 ? (name) => renameTrack(editing[0], name) : undefined}
					onRenameMany={editing.length > 1 ? () => renameManyFromTags(editing) : undefined}
					onFillMany={editing.length > 1 ? () => fillManyFromNames(editing) : undefined}
					onClose={() => setEditing(null)}
				/>
			)}

			{albumEditor && (
				<AlbumEditorDialog
					mode={albumEditor.mode}
					initialTracks={albumEditor.tracks}
					seed={albumEditor.seed}
					libraryTracks={files}
					onSave={async (payload) => {
						const key = await saveAlbumPackage(payload);
						// Keep the editor open on failure so a long setup is not lost.
						if (!key) return;
						clearDraft("album", albumDraftId(albumEditor.mode, albumEditor.seed?.album));
						setAlbumEditor(null);
						showView({ kind: "album", id: key });
					}}
					onClose={() => setAlbumEditor(null)}
				/>
			)}

			{m3uMissing && (
				<M3uMissingDialog groups={m3uMissing} onClose={() => setM3uMissing(null)} />
			)}

			{addTo && (
				<AddToDialog
					tracks={addTo}
					playlists={playlists.playlists.filter(p => p.type === "manual" && !p.readOnly)}
					tracksByPath={tracksByPath}
					artists={artists}
					albums={albums}
					linkedByPath={linkedByPath}
					allFavorite={addTo.every(tr => trackStats.stats[tr.relPath]?.favorite)}
					onPlayNext={() => {
						if (!activePath) setPlayingFrom(null);
						playNext(addTo);
						setAddTo(null);
						notifyInfo(t("notice.playingNext"));
					}}
					onAddToQueue={() => {
						if (!activePath) setPlayingFrom(null);
						addToQueue(addTo);
						setAddTo(null);
						notifyInfo(t("notice.addedToQueue"));
					}}
					onAddToFavorites={() => {
						trackStats.setFavorite(addTo, true);
						setAddTo(null);
						notifyInfo(t("notice.addedToFavorites"));
					}}
					onAddToPlaylist={(target) => {
						setAddTo(null);
						addToPlaylist(target, addTo);
					}}
					onCreatePlaylist={(name) => {
						setAddTo(null);
						createPlaylistWith(name, addTo);
					}}
					onCreateAlbum={() => {
						const tracks = addTo;
						setAddTo(null);
						setAlbumEditor({ tracks, mode: "create" });
					}}
					onAddToAlbum={(album) => {
						const incoming = addTo;
						setAddTo(null);
						setAlbumEditor({
							tracks: mergeIntoAlbumTracks(album.tracks, incoming),
							mode: "edit",
							seed: albumEditorSeedFromGroup(album),
						});
					}}
					onLinkArtist={(name) => {
						trackStats.setTrackArtistLink(addTo, name, true);
						setAddTo(null);
						notifyInfo(t("notice.linkedToArtist", { name }));
					}}
					onClose={() => setAddTo(null)}
				/>
			)}

			{editor && (
				<SmartPlaylistEditor
					title={editor.playlist ? t("smart.editTitle") : t("smart.newTitle")}
					playlistId={editor.playlist?.id ?? null}
					initialName={editor.playlist?.name ?? t("smart.defaultName")}
					initialRules={editor.playlist?.rules}
					tags={tags.tags}
					categories={tags.categories}
					onSave={saveSmartPlaylist}
					onClose={() => setEditor(null)}
				/>
			)}

			{tagPicker && (
				<TagPicker
					tracks={tagPicker}
					tags={tags.tags}
					categories={tags.categories}
					counts={tagCounts}
					isPinned={(target) => pins.isPinned("tag", target.id)}
					stats={trackStats.stats}
					onToggle={(tag, assigned) => trackStats.setTrackTag(tagPicker, tag.id, assigned)}
					onCreate={(name, categoryIds) => setTagDialog({ tag: null, name, categoryIds, assignTo: tagPicker })}
					onCopyTags={copyTrackTags}
					onPasteTags={(track) => pasteTrackTags([track])}
					onAddTags={(track) => addTrackTags([track])}
					hasTagClipboard={liveClipboardTags().length > 0}
					onClose={() => {
						if (!tagDialog) setTagPicker(null);
					}}
				/>
			)}

			{tagDialog && (
				<TagDialog
					tag={tagDialog.tag}
					initialColor={nextTagColor(tags.tags)}
					initialCategoryIds={tagDialog.categoryIds}
					initialName={tagDialog.name}
					tags={tags.tags}
					categories={tags.categories}
					onSave={saveTag}
					onCreateCategory={tags.createCategory}
					onClose={() => setTagDialog(null)}
				/>
			)}

			{mergeTag && (
				<MergeTagDialog
					tag={mergeTag}
					tags={tags.tags}
					counts={tagCounts}
					onPick={(into) => mergeTags(mergeTag, into)}
					onClose={() => setMergeTag(null)}
				/>
			)}

			{categoryDialog && (
				<CategoryDialog
					category={categoryDialog.category}
					categories={tags.categories}
					onSave={saveCategory}
					onClose={() => setCategoryDialog(null)}
				/>
			)}

			<Notices />
		</>
	);
}
