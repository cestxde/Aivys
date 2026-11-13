import { Download, FolderOpen, ListPlus, Play, Trash2 } from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { Playlist } from "../../types";
import { t } from "../../i18n";
import type { AppMenuDeps } from "./appMenuDeps";

export function createPlaylistMenu(
	deps: AppMenuDeps,
	pinEntry: (kind: import("../usePins").PinKind, key: string) => MenuEntry,
) {
	const { showView, playPlaylist, tracksOf, setAddTo, deletePlaylist, m3uDesktop } = deps;

	return (target: Playlist): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView({ kind: "playlist", id: target.id }) },
		{
			kind: "item",
			label: t("common.play"),
			icon: <Play size={16} />,
			onSelect: () => playPlaylist(target),
		},
		{
			kind: "item",
			label: t("common.addTo"),
			icon: <ListPlus size={16} />,
			onSelect: async () => {
				const tracks = await tracksOf(target);
				if (tracks.length > 0) setAddTo(tracks);
			},
		},
		pinEntry("playlist", target.id),
		...(m3uDesktop ? [
			{ kind: "separator" } as const,
			{
				kind: "item" as const,
				label: t("export.m3uRelative"),
				icon: <Download size={16} />,
				onSelect: () => void tracksOf(target).then(tracks => deps.exportTracksAsM3u(tracks, target.name, "relative")),
			},
			{
				kind: "item" as const,
				label: t("export.m3uAbsolute"),
				icon: <Download size={16} />,
				onSelect: () => void tracksOf(target).then(tracks => deps.exportTracksAsM3u(tracks, target.name, "absolute")),
			},
		] : []),
		...(target.readOnly ? [] : [
			{ kind: "separator" } as const,
			{
				kind: "item" as const,
				label: t("common.delete"),
				icon: <Trash2 size={16} />,
				danger: true,
				onSelect: () => deletePlaylist(target),
			},
		]),
	];
}
