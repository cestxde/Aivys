import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import type { M3uMissingGroup } from "../components/M3uImportDialog/M3uMissingDialog";
import type { Playlist, SmartRules, Track, View } from "../types";
import {
	buildM3u8, fileStem, joinDirFile, m3uFileName, matchM3uTracks, parseM3u, type M3uPathMode,
} from "../utils/m3u";
import { sanitizeFileName } from "../utils/fileName";
import { clearDraft, smartDraftId } from "../utils/editorDrafts";
import { notifyError, notifyInfo } from "../utils/notify";
import { t } from "../i18n";
import { PLAYLISTS_VIEW, viewKeyOf } from "../app/views";
import type { EditorState } from "../app/types";

export interface UsePlaylistActionsOptions {
	files: Track[];
	settingsLastPath: string;
	tracksByPath: Map<string, Track>;
	playlists: {
		createManual: (name: string) => Promise<Playlist | null>;
		createSmart: (name: string, rules: SmartRules) => Promise<Playlist | null>;
		addTracks: (id: string, paths: string[]) => Promise<Playlist | null>;
		setRules: (id: string, rules: SmartRules) => Promise<Playlist | null>;
		rename: (id: string, name: string) => Promise<Playlist | null>;
		remove: (id: string) => Promise<boolean>;
	};
	showView: (next: View, from?: View) => void;
	setRenamingId: (id: string | null) => void;
	setM3uMissing: (groups: M3uMissingGroup[] | null) => void;
	setEditor: (state: EditorState | null) => void;
	editor: EditorState | null;
	setPlayingFrom: (source: string | null) => void;
	playTrack: (track: Track, tracks: Track[], options?: { shuffle?: boolean }) => void;
}

export function usePlaylistActions({
	files,
	settingsLastPath,
	tracksByPath,
	playlists,
	showView,
	setRenamingId,
	setM3uMissing,
	setEditor,
	editor,
	setPlayingFrom,
	playTrack,
}: UsePlaylistActionsOptions) {
	/** Create an empty playlist and open it with its name ready to edit. */
	const createPlaylist = async () => {
		const created = await playlists.createManual(t("playlists.defaultName"));
		if (!created) return;
		showView({ kind: "playlist", id: created.id });
		setRenamingId(created.id);
	};

	/** Import one or more M3U/M3U8 files as new manual playlists. */
	const importM3uPlaylist = async () => {
		try {
			const selected = await open({
				title: t("import.m3u"),
				multiple: true,
				filters: [{ name: "M3U", extensions: ["m3u", "m3u8"] }],
				defaultPath: settingsLastPath || undefined,
			});
			const paths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
			if (paths.length === 0) return;

			let playlistsOk = 0;
			let tracksOk = 0;
			let lastId: string | null = null;
			const missingGroups: M3uMissingGroup[] = [];

			for (const path of paths) {
				const text = await invoke<string>("read_text_file", { path });
				const entries = parseM3u(text);
				const { tracks, missingEntries } = matchM3uTracks(entries, files, path, settingsLastPath);
				const name = sanitizeFileName(fileStem(path)) || t("playlists.defaultName");
				if (missingEntries.length > 0) {
					console.warn(`[m3u] ${name}: ${missingEntries.length} not in library`, missingEntries);
					missingGroups.push({ name, entries: missingEntries });
				}
				if (tracks.length === 0) continue;
				const created = await playlists.createManual(name);
				if (!created) continue;
				const added = await playlists.addTracks(created.id, tracks.map(track => track.relPath));
				if (!added) continue;
				playlistsOk += 1;
				tracksOk += tracks.length;
				lastId = created.id;
			}

			if (playlistsOk === 0) {
				notifyInfo(t("import.m3uNone"));
				if (missingGroups.length > 0) setM3uMissing(missingGroups);
				return;
			}
			if (paths.length === 1) {
				notifyInfo(t("import.m3uAdded", { count: tracksOk }));
			} else {
				notifyInfo(t("import.m3uBatch", { count: playlistsOk, playlists: playlistsOk, tracks: tracksOk }));
			}
			if (missingGroups.length > 0) setM3uMissing(missingGroups);
			if (lastId) showView({ kind: "playlist", id: lastId });
		} catch (e) {
			notifyError(t("error.importM3u"), e);
		}
	};

	const addToPlaylist = async (target: Playlist, tracks: Track[]) => {
		if (await playlists.addTracks(target.id, tracks.map(tr => tr.relPath))) {
			notifyInfo(t("notice.addedToPlaylist", { name: target.name }));
		}
	};

	const createPlaylistWith = async (name: string, tracks: Track[]) => {
		const created = await playlists.createManual(name);
		if (created) await addToPlaylist(created, tracks);
	};

	const openEditor = (edited: Playlist | null) => setEditor({ playlist: edited });

	const saveSmartPlaylist = async (name: string, rules: SmartRules) => {
		const edited = editor?.playlist;
		clearDraft("smart", smartDraftId(edited?.id ?? null));
		setEditor(null);
		if (!edited) {
			const created = await playlists.createSmart(name, rules);
			if (created) showView({ kind: "playlist", id: created.id });
			return;
		}
		await playlists.setRules(edited.id, rules);
		if (name !== edited.name) await playlists.rename(edited.id, name);
	};

	const deletePlaylist = async (target: Playlist) => {
		const confirmed = await ask(t("confirm.deletePlaylist.body", { name: target.name }), {
			title: t("confirm.deletePlaylist.title"),
			kind: "warning",
			okLabel: t("common.delete"),
			cancelLabel: t("common.cancel"),
		});
		if (confirmed && await playlists.remove(target.id)) showView(PLAYLISTS_VIEW);
	};

	/** The tracks a playlist currently contains, in its order. */
	const tracksOf = async (target: Playlist): Promise<Track[]> => {
		if (target.type === "manual") {
			return (target.items ?? []).flatMap(item => tracksByPath.get(item.path) ?? []);
		}
		try {
			const paths = await invoke<string[]>("get_smart_playlist_tracks", { id: target.id });
			return paths.flatMap(path => tracksByPath.get(path) ?? []);
		} catch {
			return [];
		}
	};

	/** Play `track` within `tracks`, started from the view `source` (a view key). */
	const playFrom = (source: string, track: Track, tracks: Track[]) => {
		setPlayingFrom(source);
		playTrack(track, tracks);
	};

	/** Play `tracks` from the first one (cards' play buttons and menus). */
	const playTracks = (tracks: Track[], source: View) => {
		if (tracks.length > 0) playFrom(viewKeyOf(source), tracks[0], tracks);
	};

	const playPlaylist = async (target: Playlist) =>
		playTracks(await tracksOf(target), { kind: "playlist", id: target.id });

	/** Save `tracks` as an M3U8 under `name` (relative or absolute paths). */
	const exportTracksAsM3u = async (tracks: Track[], name: string, mode: M3uPathMode) => {
		if (tracks.length === 0) {
			notifyInfo(t("export.empty"));
			return;
		}
		try {
			const defaultPath = settingsLastPath
				? joinDirFile(settingsLastPath, m3uFileName(name))
				: m3uFileName(name);
			const path = await save({
				title: t("export.m3u"),
				defaultPath,
				filters: [{ name: "M3U8", extensions: ["m3u8"] }],
			});
			if (!path) return;
			await invoke("write_text_file", { path, contents: buildM3u8(tracks, mode) });
			notifyInfo(t("export.saved"));
		} catch (e) {
			notifyError(t("error.exportM3u"), e);
		}
	};

	return {
		createPlaylist,
		importM3uPlaylist,
		addToPlaylist,
		createPlaylistWith,
		openEditor,
		saveSmartPlaylist,
		deletePlaylist,
		tracksOf,
		playFrom,
		playTracks,
		playPlaylist,
		exportTracksAsM3u,
	};
}
