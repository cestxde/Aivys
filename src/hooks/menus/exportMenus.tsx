import { Download } from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { Track } from "../../types";
import type { M3uPathMode } from "../../utils/m3u";
import { t } from "../../i18n";

export function createExportMenus(m3uDesktop: boolean, exportTracksAsM3u: (tracks: Track[], name: string, mode: M3uPathMode) => Promise<void>) {
	const exportMenuEntries = (tracks: Track[], name: string): MenuEntry[] => m3uDesktop ? [
		{
			kind: "item",
			label: t("export.m3uRelative"),
			icon: <Download size={16} />,
			disabled: tracks.length === 0,
			onSelect: () => void exportTracksAsM3u(tracks, name, "relative"),
		},
		{
			kind: "item",
			label: t("export.m3uAbsolute"),
			icon: <Download size={16} />,
			disabled: tracks.length === 0,
			onSelect: () => void exportTracksAsM3u(tracks, name, "absolute"),
		},
	] : [];

	const exportHeaderAction = (tracks: Track[], name: string): MenuEntry[] => m3uDesktop ? [{
		kind: "item",
		label: t("export.m3u"),
		icon: <Download size={14} />,
		disabled: tracks.length === 0,
		onSelect: () => void exportTracksAsM3u(tracks, name, "relative"),
	}] : [];

	return { exportMenuEntries, exportHeaderAction };
}
