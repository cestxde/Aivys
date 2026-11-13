import type { Track } from "../../types";
import type { MessageKey } from "../../i18n";

export const TEXT_FIELDS = ["title", "artist", "album", "albumArtist", "genre"] as const;
export const NUMBER_FIELDS = ["year", "trackNumber", "trackTotal", "discNumber"] as const;
export type TextField = typeof TEXT_FIELDS[number];
export type NumberField = typeof NUMBER_FIELDS[number];
export type MetadataField = TextField | NumberField;

export type MetadataEdit = Partial<Record<TextField, string | null> & Record<NumberField, number | null>> & {
	cover?: string | null;
};

export const METADATA_LABELS: Record<MetadataField, MessageKey> = {
	title: "edit.title",
	artist: "edit.artist",
	album: "edit.album",
	albumArtist: "edit.albumArtist",
	genre: "edit.genre",
	year: "edit.year",
	trackNumber: "edit.trackNumber",
	trackTotal: "edit.trackTotal",
	discNumber: "edit.discNumber",
};

export const valueOf = (track: Track, field: MetadataField): string => {
	switch (field) {
		case "title": return track.title ?? "";
		case "artist": return track.artistLine;
		case "album": return track.album ?? "";
		case "albumArtist": return track.albumArtist ?? "";
		case "genre": return track.genre.join("; ");
		default: return track[field]?.toString() ?? "";
	}
};

export type Cover = { kind: "keep" } | { kind: "set"; data: string; url: string } | { kind: "remove" };

export type FilePanel = "rename" | "fill" | "warn-rename" | "warn-fill" | null;
