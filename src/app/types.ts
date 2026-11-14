import type { Playlist, TagCategory, Track, UserTag, View } from "../types";

export type Screen = "loading" | "picker" | "library";

/** Selected rows (by key) of the list they were made in (`scope`: view and search). */
export interface Selection {
	scope: string;
	keys: Set<string>;
	/** Where a Shift+click range starts. */
	anchor: string | null;
}

export const NO_SELECTION: Selection = { scope: "", keys: new Set(), anchor: null };

/** The library after a tag edit or its undo, and the files left unchanged. */
export interface EditResult {
	tracks: Track[];
	failed: string[];
}

/** How much the volume shortcuts change the volume (of 1). */
export const VOLUME_STEP = 0.05;
/** How far the seek shortcuts jump, in seconds. */
export const SEEK_STEP = 5;

/** Pages that show cards rather than a track list. */
export const CARD_PAGES: View["kind"][] = [
	"playlists", "tags", "settings", "stats", "incomplete", "artists", "albums",
];

/** The smart-playlist editor: creating a new one, or editing `playlist`. */
export interface EditorState {
	playlist: Playlist | null;
}

/** Album package dialog: create from tracks, or edit an existing album's tags. */
export interface AlbumEditorState {
	tracks: Track[];
	mode: "create" | "edit";
	/** When set (add-to / edit existing), fields and cover come from the album, not mixed newcomers. */
	seed?: import("../utils/albumEditor").AlbumEditorSeed;
}

/**
 * The tag dialog: creating a new tag (named `name`, in `categoryIds`, then
 * assigned to `assignTo`), or editing `tag`.
 */
export interface TagDialogState {
	tag: UserTag | null;
	categoryIds?: string[];
	name?: string;
	assignTo?: Track[];
}

/** The category dialog: creating a new category (with `addTag` in it), or renaming `category`. */
export interface CategoryDialogState {
	category: TagCategory | null;
	addTag?: UserTag;
}
