import { MicVocal, Disc3, Folder, FolderSearch } from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { Track, View } from "../../types";
import { androidStorage } from "../../utils/androidStorage";
import { artistsOf, albumKeyOf, artistKey, folderOf } from "../../utils/groups";
import { revealFile, revealLabel } from "../../utils/reveal";
import { t } from "../../i18n";
import { lastSegment } from "../../app/views";
import type { AppMenuDeps } from "./appMenuDeps";

export function createGoToEntries(deps: AppMenuDeps) {
	const { listView, settingsLastPath, showFolders, artistsByKey, albumsByKey, trackStats, openArtist, openAlbum, showView } = deps;

	return (track: Track, everywhere = false): MenuEntry[] => {
		const here = (kind: View["kind"], id: string) =>
			!everywhere && listView.kind === kind && "id" in listView && listView.id === id;
		const entries: MenuEntry[] = [];
		for (const name of artistsOf(track, trackStats.stats[track.relPath]?.linkedArtists)) {
			const key = artistKey(name);
			const artist = artistsByKey.get(key);
			if (artist && !here("artist", key)) {
				entries.push({
					kind: "item",
					label: name,
					suffix: `(${artist.tracks.length})`,
					icon: <MicVocal size={16} />,
					onSelect: () => openArtist(name),
				});
			}
		}
		const album = albumKeyOf(track);
		if (album && albumsByKey.has(album) && !here("album", album)) {
			entries.push({ kind: "item", label: track.album ?? "", icon: <Disc3 size={16} />, onSelect: () => openAlbum(track) });
		}
		const folder = folderOf(track.relPath);
		if (showFolders && !here("folder", folder)) {
			entries.push({
				kind: "item",
				label: folder ? lastSegment(folder) : lastSegment(settingsLastPath),
				icon: <Folder size={16} />,
				onSelect: () => showView({ kind: "folder", id: folder }, listView),
			});
		}
		if (!androidStorage) {
			entries.push({ kind: "item", label: revealLabel(), icon: <FolderSearch size={16} />, onSelect: () => revealFile(track.path) });
		}
		if (entries.length === 0) return [];
		return [{ kind: "label", label: t("menu.goTo") }, ...entries, { kind: "separator" }];
	};
}
