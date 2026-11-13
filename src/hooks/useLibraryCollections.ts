import { useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Heart, History, TrendingUp } from "lucide-react";
import type { PinnedPlaylist } from "../components/PlaylistsPage/PlaylistsPage";
import { lastSegment } from "../app/views";
import { t, useI18n } from "../i18n";
import type { ConflictReport, PlayerSettings, SystemView, Track, View } from "../types";
import { systemViewTracks } from "../utils/views";
import {
	albumKeyOf, folderTracks, groupAlbums, groupArtists, hasFolders, subfolders, type TrackGroup,
} from "../utils/groups";
import { notifyError, notifyInfo } from "../utils/notify";
import { useGroupCovers } from "./useGroupCovers";
import type { useLibrary } from "./useLibrary";
import type { useTrackStats } from "./useTrackStats";
import type { usePlayerSettings } from "./usePlayerSettings";

export type LibraryGroupCatalog = {
	groupCoverStore: ReturnType<typeof useGroupCovers>;
	linkedByPath: Record<string, string[]>;
	artists: TrackGroup[];
	albums: TrackGroup[];
	artistsByKey: Map<string, TrackGroup>;
	listedArtists: TrackGroup[];
	albumsByKey: Map<string, TrackGroup>;
	showFolders: boolean;
	pinned: PinnedPlaylist[];
	tagCounts: Map<string, number>;
	untaggedCount: number;
	rescan: () => void;
	clearRecent: () => void;
	checkConflicts: () => Promise<void>;
};

export type LibraryViewGroup = {
	currentGroup: TrackGroup | null;
	artistAlbums: TrackGroup[];
	currentSubfolders: TrackGroup[];
};

export function useLibraryGroupCatalog({
	files,
	trackStats,
	settings,
	library,
	updateSettings,
}: {
	files: Track[];
	trackStats: ReturnType<typeof useTrackStats>;
	settings: PlayerSettings;
	library: ReturnType<typeof useLibrary>;
	updateSettings: ReturnType<typeof usePlayerSettings>["updateSettings"];
}): LibraryGroupCatalog {
	const language = useI18n();
	const groupCoverStore = useGroupCovers(files);
	const { withCovers } = groupCoverStore;

	const linkedByPath = useMemo(() => {
		const linked: Record<string, string[]> = {};
		for (const [path, st] of Object.entries(trackStats.stats)) {
			if (st.linkedArtists?.length) linked[path] = st.linkedArtists;
		}
		return linked;
	}, [trackStats.stats]);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	const artists = useMemo(
		() => withCovers("artist", groupArtists(files, linkedByPath)),
		[files, language, withCovers, linkedByPath],
	);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	const albums = useMemo(() => withCovers("album", groupAlbums(files)), [files, language, withCovers]);
	const artistsByKey = useMemo(() => new Map(artists.map(g => [g.key, g])), [artists]);
	const listedArtists = useMemo(() => artists.filter(group => group.listed), [artists]);
	const albumsByKey = useMemo(() => new Map(albums.map(g => [g.key, g])), [albums]);
	const showFolders = useMemo(() => hasFolders(files), [files]);

	const pinned = useMemo((): PinnedPlaylist[] => {
		const count = (id: SystemView) => systemViewTracks(files, id, trackStats.stats).length;
		return [
			{ id: "favorites", name: t("nav.favorites"), icon: Heart, color: "#e11d48", count: count("favorites") },
			{ id: "mostPlayed", name: t("nav.mostPlayed"), icon: TrendingUp, color: "#f59e0b", count: count("mostPlayed") },
			{ id: "recentlyPlayed", name: t("nav.recentlyPlayed"), icon: History, color: "#3b82f6", count: count("recentlyPlayed") },
		];
		// eslint-disable-next-line react-hooks/exhaustive-deps -- names are translated
	}, [files, trackStats.stats, language]);

	const tagCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const file of files) {
			for (const id of trackStats.stats[file.relPath]?.tags ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
		}
		return counts;
	}, [files, trackStats.stats]);

	const untaggedCount = useMemo(
		() => files.filter(file => (trackStats.stats[file.relPath]?.tags ?? []).length === 0).length,
		[files, trackStats.stats],
	);

	const rescan = () => library.scan(settings.lastPath);
	const clearRecent = () => updateSettings({ recentPaths: settings.recentPaths.filter(p => p === settings.lastPath) });

	const tellConflicts = (report: ConflictReport) => {
		if (report.skipped.length > 0) {
			notifyError(t("sync.skipped", { count: report.skipped.length, list: report.skipped.join("; ") }));
		}
		if (report.deviceIdRegenerated) notifyInfo(t("sync.deviceIdRegenerated"));
		if (report.merged.length > 0) notifyInfo(t("sync.merged", { count: report.merged.length }));
	};

	const checkConflicts = async () => {
		let report: ConflictReport;
		try {
			report = await invoke<ConflictReport>("resolve_conflicts");
		} catch (e) {
			notifyError(t("sync.checkFailed"), e);
			return;
		}
		tellConflicts(report);
		if (report.merged.length === 0 && report.skipped.length === 0) {
			notifyInfo(t("sync.none"));
			return;
		}
		if (report.merged.length > 0) await rescan();
	};

	useEffect(() => {
		if (files.length === 0) return;
		invoke<ConflictReport | null>("take_opening_conflicts")
			.then(report => report && tellConflicts(report))
			.catch(console.error);
	}, [files]);

	return {
		groupCoverStore,
		linkedByPath,
		artists,
		albums,
		artistsByKey,
		listedArtists,
		albumsByKey,
		showFolders,
		pinned,
		tagCounts,
		untaggedCount,
		rescan,
		clearRecent,
		checkConflicts,
	};
}

export function useLibraryViewGroup({
	listView,
	files,
	settings,
	artistsByKey,
	albumsByKey,
}: {
	listView: View;
	files: Track[];
	settings: PlayerSettings;
	artistsByKey: Map<string, TrackGroup>;
	albumsByKey: Map<string, TrackGroup>;
}): LibraryViewGroup {
	const currentGroup = useMemo((): TrackGroup | null => {
		switch (listView.kind) {
			case "artist": return artistsByKey.get(listView.id) ?? null;
			case "album": return albumsByKey.get(listView.id) ?? null;
			case "folder": return {
				key: listView.id,
				name: listView.id ? lastSegment(listView.id) : lastSegment(settings.lastPath),
				subtitle: null,
				year: null,
				tracks: folderTracks(files, listView.id),
				listed: true,
			};
			default: return null;
		}
	}, [listView, artistsByKey, albumsByKey, files, settings.lastPath]);

	const artistAlbums = useMemo(() => {
		if (listView.kind !== "artist" || !currentGroup) return [];
		const keys = new Set(currentGroup.tracks.flatMap(track => albumKeyOf(track) ?? []));
		return [...keys]
			.flatMap(key => albumsByKey.get(key) ?? [])
			.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
	}, [listView.kind, currentGroup, albumsByKey]);

	const currentSubfolders = useMemo(
		() => (listView.kind === "folder" ? subfolders(files, listView.id) : []),
		[listView, files],
	);

	return { currentGroup, artistAlbums, currentSubfolders };
}
