import { QueuePanel } from "../components/QueuePanel/QueuePanel";
import { TrackDetailPanel } from "../components/TrackDetailPanel/TrackDetailPanel";
import type { ListRow, Track, UserTag, View } from "../types";
import type { useTags } from "./useTags";
import type { useTrackStats } from "./useTrackStats";
import type { MenuEntry } from "../components/ContextMenu/ContextMenu";
import { albumKeyOf, type TrackGroup } from "../utils/groups";

export function useLibraryShellPanels({
	queue,
	playAt,
	queueMenu,
	setUpcoming,
	setMenu,
	currentTrack,
	trackStats,
	tagsById,
	copyTrackTags,
	pasteTrackTags,
	addTrackTags,
	liveClipboardTags,
	setEditing,
	setAddTo,
	setTagPicker,
	leavePlayer,
	showView,
	listView,
	tagChipMenu,
	canOpenArtist,
	openArtist,
	albumsByKey,
	openAlbum,
}: {
	queue: { order: Track[]; index: number };
	playAt: (index: number) => void;
	queueMenu: (row: ListRow) => MenuEntry[];
	setUpcoming: (tracks: Track[]) => void;
	setMenu: (menu: { x: number; y: number; entries: MenuEntry[] } | null) => void;
	currentTrack: Track | undefined;
	trackStats: ReturnType<typeof useTrackStats>;
	tagsById: ReturnType<typeof useTags>["byId"];
	copyTrackTags: (track: Track) => void;
	pasteTrackTags: (tracks: Track[]) => void;
	addTrackTags: (tracks: Track[]) => void;
	liveClipboardTags: () => string[];
	setEditing: (tracks: Track[] | null) => void;
	setAddTo: (tracks: Track[] | null) => void;
	setTagPicker: (tracks: Track[] | null) => void;
	leavePlayer: () => void;
	showView: (next: View, from?: View) => void;
	listView: View;
	tagChipMenu: (track: Track, target: UserTag) => MenuEntry[];
	canOpenArtist: (name: string) => boolean;
	openArtist: (name: string) => void;
	albumsByKey: Map<string, TrackGroup>;
	openAlbum: (track: Track) => void;
}) {
	const queuePanel = (
		<QueuePanel
			order={queue.order}
			index={queue.index}
			onPlayAt={playAt}
			onOpenMenu={(row, x, y) => setMenu({ x, y, entries: queueMenu(row) })}
			onSetUpcoming={setUpcoming}
		/>
	);
	const detailPanel = (
		<TrackDetailPanel
			track={currentTrack ?? null}
			stats={currentTrack ? trackStats.stats[currentTrack.relPath] ?? null : null}
			onToggleFavorite={trackStats.toggleFavorite}
			onAddTo={(track) => setAddTo([track])}
			onSetRating={trackStats.setRating}
			tagsById={tagsById}
			onEditTags={(track) => setTagPicker([track])}
			onCopyTags={copyTrackTags}
			onPasteTags={(track) => pasteTrackTags([track])}
			onAddTags={(track) => addTrackTags([track])}
			hasTagClipboard={liveClipboardTags().length > 0}
			onEditDetails={(track) => setEditing([track])}
			onOpenTag={(target) => {
				leavePlayer();
				showView({ kind: "tag", id: target.id }, listView);
			}}
			onRemoveTag={(track, target) => trackStats.setTrackTag([track], target.id, false)}
			onOpenTagMenu={(track, target, x, y) => setMenu({ x, y, entries: tagChipMenu(track, target) })}
			onUnlinkArtist={(track, name) => trackStats.setTrackArtistLink([track], name, false)}
			canOpenArtist={canOpenArtist}
			onOpenArtist={(name) => {
				leavePlayer();
				openArtist(name);
			}}
			canOpenAlbum={(track) => { const key = albumKeyOf(track); return !!key && albumsByKey.has(key); }}
			onOpenAlbum={(track) => {
				leavePlayer();
				openAlbum(track);
			}}
		/>
	);
	return { queuePanel, detailPanel };
}
