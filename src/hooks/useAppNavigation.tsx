import { useEffect, useState, type MutableRefObject } from "react";
import { artistKey, albumKeyOf } from "../utils/groups";
import { androidStorage } from "../utils/androidStorage";
import { UNTAGGED_KEY } from "../utils/views";
import { useBackLayer } from "./useBackLayer";
import type { Track, View } from "../types";
import type { Screen } from "../app/types";
import {
	ALBUMS_VIEW, ARTISTS_VIEW, LIBRARY_VIEW, PLAYLISTS_VIEW, ROOT_FOLDER_VIEW, TAGS_VIEW, viewKeyOf,
} from "../app/views";

export interface UseAppNavigationOptions {
	playlists: { playlists: { id: string }[] };
	tagsById: Map<string, unknown>;
	artistsByKey: Map<string, unknown>;
	albumsByKey: Map<string, unknown>;
	files: Track[];
	clearSearchRef: MutableRefObject<() => void>;
	setRenamingId: (id: string | null) => void;
	isPhone: boolean;
	nowPlayingOpen: boolean;
	setNowPlayingOpen: (open: boolean) => void;
	setPhonePanel: (panel: "track" | "queue" | null) => void;
	view: Screen;
	selectedRowsLengthRef: MutableRefObject<number>;
}

export function useAppNavigation({
	playlists,
	tagsById,
	artistsByKey,
	albumsByKey,
	files,
	clearSearchRef,
	setRenamingId,
	isPhone,
	nowPlayingOpen,
	setNowPlayingOpen,
	setPhonePanel,
	view,
	selectedRowsLengthRef,
}: UseAppNavigationOptions) {
	const [requestedView, setListView] = useState<View>(LIBRARY_VIEW);
	const listView: View =
		requestedView.kind === "playlist" && !playlists.playlists.some(p => p.id === requestedView.id) ? PLAYLISTS_VIEW
			: requestedView.kind === "tag" && !tagsById.has(requestedView.id) && requestedView.id !== UNTAGGED_KEY ? TAGS_VIEW
				: requestedView.kind === "artist" && !artistsByKey.has(requestedView.id) ? ARTISTS_VIEW
					: requestedView.kind === "album" && !albumsByKey.has(requestedView.id) ? ALBUMS_VIEW
						: requestedView.kind === "folder" && requestedView.id
							&& !files.some(f => f.relPath.startsWith(`${requestedView.id}/`)) ? ROOT_FOLDER_VIEW
							: requestedView;
	const viewKey = viewKeyOf(listView);
	const [backTo, setBackTo] = useState<View | null>(null);
	const [forwardViews, setForwardViews] = useState<{ view: View; backTo: View | null }[]>([]);

	/** Open `next`; `from` is where going back should return to, if not the usual place. */
	const showView = (next: View, from?: View) => {
		setForwardViews([]);
		openView(next, from);
	};

	const openView = (next: View, from?: View) => {
		if (next.kind === "settings") {
			if (listView.kind !== "settings") setBackTo(listView);
		} else {
			setBackTo(from ?? null);
		}
		setRenamingId(null);
		clearSearchRef.current();
		setListView(next);
	};

	/**
	 * Where "back" (Esc, the header's back button) leads from the current view:
	 * an item opened by a link back where it was opened, otherwise to its list;
	 * a top-level view to the library; nowhere from the library.
	 */
	const parentView = (): View | null => {
		switch (listView.kind) {
			case "playlist": return backTo ?? PLAYLISTS_VIEW;
			case "tag": return backTo ?? TAGS_VIEW;
			case "artist": return backTo ?? ARTISTS_VIEW;
			case "album": return backTo ?? ALBUMS_VIEW;
			case "folder":
				return backTo ?? (listView.id ? { kind: "folder", id: listView.id.split("/").slice(0, -1).join("/") } : LIBRARY_VIEW);
			case "settings": return backTo ?? LIBRARY_VIEW;
			case "stats": return backTo ?? LIBRARY_VIEW;
			case "incomplete": return backTo ?? LIBRARY_VIEW;
			case "gap": return backTo ?? { kind: "incomplete" };
			case "system": return listView.id === "library" ? null : backTo ?? LIBRARY_VIEW;
			default: return LIBRARY_VIEW;
		}
	};

	const goBack = () => {
		const parent = parentView();
		if (!parent) return;
		setForwardViews(views => [...views, { view: listView, backTo }]);
		openView(parent);
	};

	const goForward = () => {
		const entry = forwardViews[forwardViews.length - 1];
		if (!entry) return;
		setForwardViews(views => views.slice(0, -1));
		setRenamingId(null);
		clearSearchRef.current();
		setListView(entry.view);
		setBackTo(entry.backTo);
	};

	const [playerReturn, setPlayerReturn] = useState<{ from: string; to: string | null } | null>(null);
	if (playerReturn && playerReturn.to === null && viewKey !== playerReturn.from) {
		setPlayerReturn({ ...playerReturn, to: viewKey });
	} else if (playerReturn?.to && playerReturn.to !== viewKey) {
		setPlayerReturn(null);
	}
	const fromPlayer = isPhone && !nowPlayingOpen && playerReturn?.to === viewKey;
	/** Back from a view: up a level, and to the player again if it was opened from there. */
	const backFromView = () => {
		goBack();
		if (fromPlayer) {
			setPlayerReturn(null);
			setNowPlayingOpen(true);
		}
	};

	useBackLayer(fromPlayer && androidStorage === null, backFromView);

	const inLibrary = view === "library";
	const awayFromLibrary = inLibrary && !(listView.kind === "system" && listView.id === "library");
	useBackLayer(androidStorage !== null && awayFromLibrary, backFromView);

	// Esc goes back, unless something else uses it: an open menu, dialog or
	// cover viewer closes itself, and a text field keeps its own Esc (except
	// the empty track search, see the toolbar).
	const parent = parentView();
	useEffect(() => {
		if (!parent) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented || selectedRowsLengthRef.current > 0) return;
			if (document.querySelector(".dialog-backdrop, .context-menu, .cover-viewer-backdrop")) return;
			const target = e.target as HTMLElement | null;
			if (target?.matches("input, textarea, select, [contenteditable]") && !target.matches(".track-search input")) return;
			goBack();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	/** Phones close their player screens when one of these opens another view. */
	const leavePlayer = () => {
		if (nowPlayingOpen) setPlayerReturn({ from: viewKey, to: null });
		setPhonePanel(null);
		setNowPlayingOpen(false);
	};

	/** Open an artist's page from a link; back returns here. */
	const canOpenArtist = (name: string) => artistsByKey.has(artistKey(name));
	const openArtist = (name: string) => {
		if (canOpenArtist(name)) showView({ kind: "artist", id: artistKey(name) }, listView);
	};
	const openAlbum = (track: import("../types").Track) => {
		const key = albumKeyOf(track);
		if (key && albumsByKey.has(key)) showView({ kind: "album", id: key }, listView);
	};

	return {
		listView,
		backTo,
		showView,
		openView,
		goBack,
		goForward,
		backFromView,
		leavePlayer,
		setPlayerReturn,
		canOpenArtist,
		openArtist,
		openAlbum,
		inLibrary,
	};
}
