import { ask } from "@tauri-apps/plugin-dialog";
import {
	ClipboardPaste, FolderOpen, ImageOff, ImagePlus, Images, ListPlus, Play,
} from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { Track, View } from "../../types";
import { androidStorage } from "../../utils/androidStorage";
import { clipboardImage, cropImage, pickFile, readCoverBase64 } from "../../utils/image";
import { cropToSquare } from "../../utils/coverCrop";
import { groupCovers, type TrackGroup } from "../../utils/groups";
import type { CoverKind } from "../useGroupCovers";
import { displayTitle } from "../../utils/track";
import { notifyError, notifyInfo } from "../../utils/notify";
import { t } from "../../i18n";
import type { AppMenuDeps } from "./appMenuDeps";

export function createGroupMenus(
	deps: AppMenuDeps,
	tagEntries: (tracks: Track[]) => MenuEntry[],
	exportMenuEntries: (tracks: Track[], name: string) => MenuEntry[],
	pinEntry: (kind: import("../usePins").PinKind, key: string) => MenuEntry,
) {
	const { groupCoverStore, setSettingCover, saveMetadata, showView, playTracks, setAddTo } = deps;

	const pasteCover = (use: (data: string) => void) => {
		clipboardImage().then(
			image => (image ? use(image.data) : notifyInfo(t("cover.noImageInClipboard"))),
			e => notifyError(t("cover.pasteFailed"), e),
		);
	};

	const chooseGroupCover = (kind: CoverKind, group: TrackGroup) => {
		pickFile().then(async file => {
			const frame = await cropToSquare(file);
			if (!frame) return;
			setSettingCover({ kind, key: group.key });
			try {
				const { data } = await cropImage(file, frame);
				await groupCoverStore.setCover(kind, group.key, data);
			} catch (e) {
				notifyError(t("error.setCover"), e);
			} finally {
				setSettingCover(null);
			}
		});
	};

	const applyCoverToTracks = async (
		tracks: Track[],
		coverPath: string,
		onBusy?: (busy: boolean) => void,
	) => {
		if (tracks.length === 0) return;
		const confirmed = await ask(
			t("confirm.applyCoverToTracks.body", { count: tracks.length, title: displayTitle(tracks[0]) }),
			{
				title: t("confirm.applyCoverToTracks.title"),
				kind: "warning",
				okLabel: t("confirm.applyCoverToTracks.ok"),
				cancelLabel: t("common.cancel"),
			},
		);
		if (!confirmed) return;
		onBusy?.(true);
		try {
			const data = await readCoverBase64(coverPath);
			await saveMetadata(tracks, { cover: data });
		} catch (e) {
			notifyError(t("error.setCover"), e);
		} finally {
			onBusy?.(false);
		}
	};

	const coverEntries = (kind: CoverKind, group: TrackGroup): MenuEntry[] => {
		const applyPath = kind === "album"
			? (group.cover ?? groupCovers(group, 1)[0] ?? null)
			: null;
		return [
			{
				kind: "item",
				label: group.cover ? t("group.changeCover") : t("group.setCover"),
				icon: <ImagePlus size={16} />,
				onSelect: () => chooseGroupCover(kind, group),
			},
			...(androidStorage ? [] : [{
				kind: "item" as const,
				label: t("cover.pasteCover"),
				icon: <ClipboardPaste size={16} />,
				onSelect: () => pasteCover(data => {
					setSettingCover({ kind, key: group.key });
					groupCoverStore.setCover(kind, group.key, data).finally(() => setSettingCover(null));
				}),
			}]),
			...(group.cover ? [{
				kind: "item" as const,
				label: t("group.resetCover"),
				icon: <ImageOff size={16} />,
				onSelect: () => groupCoverStore.setCover(kind, group.key, null),
			}] : []),
			...(applyPath && group.tracks.length > 0 ? [{
				kind: "item" as const,
				label: t("group.applyCoverToTracks"),
				icon: <Images size={16} />,
				onSelect: () => applyCoverToTracks(group.tracks, applyPath, busy => {
					setSettingCover(busy ? { kind, key: group.key } : null);
				}),
			}] : []),
		];
	};

	const groupMenu = (group: TrackGroup, open: View): MenuEntry[] => [
		{ kind: "item", label: t("common.open"), icon: <FolderOpen size={16} />, onSelect: () => showView(open) },
		{ kind: "item", label: t("common.play"), icon: <Play size={16} />, onSelect: () => playTracks(group.tracks, open) },
		{ kind: "separator" },
		{ kind: "item", label: t("common.addTo"), icon: <ListPlus size={16} />, onSelect: () => setAddTo(group.tracks) },
		...tagEntries(group.tracks),
		...(deps.m3uDesktop ? [{ kind: "separator" as const }, ...exportMenuEntries(group.tracks, group.name)] : []),
		...(open.kind === "artist" || open.kind === "album"
			? [{ kind: "separator" as const }, pinEntry(open.kind, group.key), { kind: "separator" as const }, ...coverEntries(open.kind, group)]
			: []),
	];

	return { groupMenu, coverEntries, pasteCover, applyCoverToTracks };
}
