import { UpdateDialog } from "../components/UpdateDialog/UpdateDialog";
import { ChangelogDialog } from "../components/UpdateDialog/ChangelogDialog";
import { MetadataEditor } from "../components/MetadataEditor/MetadataEditor";
import { M3uMissingDialog } from "../components/M3uImportDialog/M3uMissingDialog";
import { AddToDialog } from "../components/AddToDialog/AddToDialog";
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
		updateDialogOpen, changelogOpen, editing, saveMetadata, renameTrack, renameManyFromTags, fillManyFromNames,
		setEditing, m3uMissing, setM3uMissing, addTo, playlists, tracksByPath, artists, linkedByPath, trackStats,
		activePath, playNext, setPlayingFrom, addToQueue, addToPlaylist, createPlaylistWith, editor, saveSmartPlaylist,
		setEditor, tagPicker, tagDialog, setTagPicker, tags, tagCounts, pins, mergeTag, setMergeTag, mergeTags, saveTag,
		saveCategory, categoryDialog, setTagDialog, setCategoryDialog, element, copyTrackTags, pasteTrackTags,
		addTrackTags, liveClipboardTags, setAddTo,
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

			{m3uMissing && (
				<M3uMissingDialog groups={m3uMissing} onClose={() => setM3uMissing(null)} />
			)}

			{addTo && (
				<AddToDialog
					tracks={addTo}
					playlists={playlists.playlists.filter(p => p.type === "manual" && !p.readOnly)}
					tracksByPath={tracksByPath}
					artists={artists}
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
