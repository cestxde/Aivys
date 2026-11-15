import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { AlbumEditorSave } from "../components/AlbumEditorDialog/AlbumEditorDialog";
import type { MetadataEdit } from "../components/MetadataEditor/MetadataEditor";
import type { Track } from "../types";
import { albumKeyOf } from "../utils/groups";
import { displayTitle } from "../utils/track";
import { fileNameFromTags, preferredFileNameVariant } from "../utils/fileName";
import { clearDraft, metadataDraftId } from "../utils/editorDrafts";
import { notifyError, notifyInfo, notifyUndoable } from "../utils/notify";
import { t } from "../i18n";
import type { EditResult } from "../app/types";

export interface UseMetadataActionsOptions {
	library: { setFiles: (files: Track[] | ((prev: Track[]) => Track[])) => void };
	forgetTracks: (tracks: Track[]) => void;
	releaseWhile: <T,>(
		paths: string[],
		work: () => Promise<T>,
		resumeAs?: (result: T) => string | undefined,
	) => Promise<T>;
	replacePath: (from: string, to: Track) => void;
	setEditing: (tracks: Track[] | null) => void;
	setUndoablePaths: (paths: string[] | null | ((current: string[] | null) => string[] | null)) => void;
}

export function useMetadataActions({
	library,
	forgetTracks,
	releaseWhile,
	replacePath,
	setEditing,
	setUndoablePaths,
}: UseMetadataActionsOptions) {
	/** Write `edit` into the tags of `tracks`; the library follows. */
	const saveMetadata = async (tracks: Track[], edit: MetadataEdit) => {
		const paths = tracks.map(track => track.path);
		let result: EditResult;
		try {
			result = await releaseWhile(paths, () => invoke<EditResult>("edit_tracks", { paths, edit }));
		} catch (e) {
			notifyError(t("edit.failed"), e);
			return;
		}
		library.setFiles(result.tracks);
		if (result.failed.length > 0) {
			notifyError(t("edit.someFailed", { count: result.failed.length, list: result.failed.join("; ") }));
		}
		const written = tracks.length - result.failed.length;
		if (written === 0) return;
		clearDraft("metadata", metadataDraftId(paths));
		setEditing(null);
		setUndoablePaths(paths);
		notifyUndoable(
			written === 1 ? t("edit.saved") : t("edit.savedMany", { count: written }),
			t("edit.undo"),
			() => undoEdit(paths),
		);
	};

	/** The renamed track in `tracks`, or null if the rename did not land. */
	const renamedTrack = (track: Track, name: string, tracks: Track[]): Track | null => {
		const parent = track.relPath.includes("/") ? track.relPath.slice(0, track.relPath.lastIndexOf("/") + 1) : "";
		const newRel = parent + name;
		return tracks.find(item => item.relPath === newRel)
			?? tracks.find(item => item.name === name)
			?? null;
	};

	/** Rename one track's file from the details dialog; keep the dialog on the new path. */
	const renameTrack = async (track: Track, name: string) => {
		let result: EditResult;
		try {
			result = await releaseWhile(
				[track.path],
				() => invoke<EditResult>("rename_tracks", { renames: [{ path: track.path, name }] }),
				(outcome) => outcome.failed.length > 0 ? undefined : renamedTrack(track, name, outcome.tracks)?.path,
			);
		} catch (e) {
			notifyError(t("edit.renameFailed"), e);
			return;
		}
		if (result.failed.length > 0) {
			library.setFiles(result.tracks);
			notifyError(t("edit.renameFailed"), result.failed.join("; "));
			return;
		}
		const next = renamedTrack(track, name, result.tracks);
		if (next) replacePath(track.path, next);
		library.setFiles(result.tracks);
		if (next) setEditing([next]);
		notifyInfo(t("edit.renamed", { name: next?.name ?? name }));
	};

	/** Rename every selected file from its tags (Artist - Title). */
	const renameManyFromTags = async (tracks: Track[]) => {
		const renames = tracks.flatMap(track => {
			const name = fileNameFromTags(track);
			return name && name !== track.name ? [{ path: track.path, name }] : [];
		});
		if (renames.length === 0) {
			notifyInfo(t("edit.renameNone"));
			return;
		}
		const paths = renames.map(item => item.path);
		let result: EditResult;
		try {
			result = await releaseWhile(paths, () => invoke<EditResult>("rename_tracks", { renames }));
		} catch (e) {
			notifyError(t("edit.renameFailed"), e);
			return;
		}
		library.setFiles(result.tracks);
		if (result.failed.length > 0) {
			notifyError(t("edit.someFailed", { count: result.failed.length, list: result.failed.join("; ") }));
		}
		const written = renames.length - result.failed.length;
		if (written === 0) return;
		const nextEditing = tracks
			.map(track => {
				const spec = renames.find(item => item.path === track.path);
				return spec ? renamedTrack(track, spec.name, result.tracks) : track;
			})
			.filter((track): track is Track => !!track);
		if (nextEditing.length > 0) setEditing(nextEditing);
		else setEditing(null);
		notifyInfo(t("edit.renamedMany", { count: written }));
	};

	/**
	 * Write shared album fields (and optional per-track numbers) onto `payload.tracks`.
	 * Cover goes in `shared` once so IPC stays small. Returns the album view key
	 * when at least one file succeeded.
	 */
	const saveAlbumPackage = async (payload: AlbumEditorSave): Promise<string | null> => {
		const ordered = payload.tracks;
		if (ordered.length === 0) return null;
		const shared: MetadataEdit = {
			album: payload.album,
			albumArtist: payload.albumArtist,
			year: payload.year,
			genre: payload.genre,
		};
		if (payload.cover !== undefined) shared.cover = payload.cover;
		if (payload.writeNumbers) shared.trackTotal = payload.trackTotal;
		const edits = ordered.map(track => {
			const edit: MetadataEdit = {};
			if (payload.writeNumbers) {
				edit.trackNumber = payload.trackNumbers[track.path] ?? null;
			}
			return { path: track.path, edit };
		});
		const paths = edits.map(item => item.path);
		let result: EditResult;
		try {
			result = await releaseWhile(paths, async () => {
				const busy = await invoke<string[]>("check_tracks_writable", { paths });
				if (busy.length > 0) {
					const shown = busy.slice(0, 6).join(", ");
					const more = busy.length > 6 ? t("album.filesBusyMore", { count: busy.length - 6 }) : "";
					notifyError(t("album.filesBusy", { list: shown + more }));
					return null;
				}
				return invoke<EditResult>("edit_tracks_each", { edits, shared });
			});
		} catch (e) {
			notifyError(t("edit.failed"), e);
			return null;
		}
		if (!result) return null;
		library.setFiles(result.tracks);
		if (result.failed.length > 0) {
			notifyError(t("edit.someFailed", { count: result.failed.length, list: result.failed.join("; ") }));
		}
		const written = edits.length - result.failed.length;
		if (written === 0) return null;
		setUndoablePaths(paths);
		notifyUndoable(
			t("album.saved", { count: written }),
			t("edit.undo"),
			() => undoEdit(paths),
		);
		for (const track of ordered) {
			const updated = result.tracks.find(item => item.path === track.path);
			const key = updated ? albumKeyOf(updated) : null;
			if (key) return key;
		}
		return null;
	};

	/** Fill artist/title/track number from each file name automatically. */
	const fillManyFromNames = async (tracks: Track[]) => {
		const edits = tracks.flatMap(track => {
			const variant = preferredFileNameVariant(track);
			if (!variant) return [];
			const edit: MetadataEdit = {
				artist: variant.artist,
				title: variant.title,
				...(variant.trackNumber !== undefined ? { trackNumber: variant.trackNumber } : {}),
			};
			return [{ path: track.path, edit }];
		});
		if (edits.length === 0) {
			notifyInfo(t("edit.fillNone"));
			return;
		}
		const paths = edits.map(item => item.path);
		let result: EditResult;
		try {
			result = await releaseWhile(
				paths,
				() => invoke<EditResult>("edit_tracks_each", { edits, shared: null }),
			);
		} catch (e) {
			notifyError(t("edit.failed"), e);
			return;
		}
		library.setFiles(result.tracks);
		if (result.failed.length > 0) {
			notifyError(t("edit.someFailed", { count: result.failed.length, list: result.failed.join("; ") }));
		}
		const written = edits.length - result.failed.length;
		if (written === 0) return;
		setEditing(null);
		setUndoablePaths(paths);
		notifyUndoable(
			t("edit.filledMany", { count: written }),
			t("edit.undo"),
			() => undoEdit(paths),
		);
	};

	/** Put back the tags the last edit (of the files at `paths`) replaced. */
	const undoEdit = async (paths: string[]) => {
		setUndoablePaths(current => (current === paths ? null : current));
		let result: EditResult;
		try {
			result = await releaseWhile(paths, () => invoke<EditResult>("undo_track_edit"));
		} catch (e) {
			notifyError(t("edit.undoFailed"), e);
			return;
		}
		library.setFiles(result.tracks);
		if (result.failed.length > 0) {
			notifyError(t("edit.undoSkipped", { count: result.failed.length, list: result.failed.join("; ") }));
		} else {
			notifyInfo(t("edit.undone"));
		}
	};

	/** Move track files to the trash (after confirming) and drop them from the library. */
	const deleteTracks = async (tracks: Track[]) => {
		const confirmed = await ask(
			t("confirm.deleteFiles.body", { count: tracks.length, title: displayTitle(tracks[0]) }),
			{
				title: t("confirm.deleteFiles.title"),
				kind: "warning",
				okLabel: t("confirm.deleteFiles.ok"),
				cancelLabel: t("common.cancel"),
			},
		);
		if (!confirmed) return;
		forgetTracks(tracks);
		try {
			await invoke("delete_tracks", { paths: tracks.map(tr => tr.relPath) });
		} catch (e) {
			notifyError(t("error.deleteFile"), e);
			return;
		}
		const gone = new Set(tracks.map(tr => tr.path));
		library.setFiles(prev => prev.filter(f => !gone.has(f.path)));
		notifyInfo(t("notice.movedToTrash", { count: tracks.length }));
	};

	return {
		saveMetadata,
		saveAlbumPackage,
		renameTrack,
		renameManyFromTags,
		fillManyFromNames,
		undoEdit,
		deleteTracks,
	};
}
