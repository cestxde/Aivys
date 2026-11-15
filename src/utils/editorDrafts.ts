/**
 * Persistent drafts for long-lived editors (album / metadata / smart playlist).
 * Survives dialog close and app restart; cleared only after a successful save.
 */

export type DraftKind = "album" | "metadata" | "smart";

const PREFIX = "aivys.draft.";

export type DraftCover =
	| { kind: "keep" }
	| { kind: "remove" }
	| { kind: "set"; data: string };

export interface AlbumDraftPayload {
	paths: string[];
	album: string;
	albumArtist: string;
	year: string;
	genre: string;
	writeNumbers: boolean;
	autoOrder: boolean;
	trackTotal: string;
	numbers: Record<string, string>;
	cover: DraftCover;
	adding: boolean;
}

export interface MetadataDraftPayload {
	values: Record<string, string>;
	changed: string[];
	cover: DraftCover;
}

export interface SmartDraftPayload {
	name: string;
	match: "all" | "any";
	conditions: unknown[];
	sort: { field: string; dir: "asc" | "desc" };
	limit: number | null;
}

interface DraftEnvelope<T> {
	kind: DraftKind;
	id: string;
	savedAt: number;
	payload: T;
}

export const albumDraftId = (mode: "create" | "edit", seedAlbum?: string | null): string =>
	mode === "edit" && seedAlbum?.trim()
		? `edit:${seedAlbum.trim().toLowerCase()}`
		: "create";

export const metadataDraftId = (paths: string[]): string =>
	[...paths].sort().join("\n");

export const smartDraftId = (playlistId: string | null): string =>
	playlistId ?? "new";

const storageKey = (kind: DraftKind, id: string): string =>
	`${PREFIX}${kind}.${encodeURIComponent(id)}`;

export const writeDraft = <T,>(kind: DraftKind, id: string, payload: T): void => {
	try {
		const envelope: DraftEnvelope<T> = { kind, id, savedAt: Date.now(), payload };
		localStorage.setItem(storageKey(kind, id), JSON.stringify(envelope));
	} catch {
		// Quota / private mode — draft is best-effort.
	}
};

export const readDraft = <T,>(kind: DraftKind, id: string): T | null => {
	try {
		const raw = localStorage.getItem(storageKey(kind, id));
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const envelope = parsed as DraftEnvelope<T>;
		if (envelope.kind !== kind || envelope.id !== id || envelope.payload == null) return null;
		return envelope.payload;
	} catch {
		return null;
	}
};

export const clearDraft = (kind: DraftKind, id: string): void => {
	try {
		localStorage.removeItem(storageKey(kind, id));
	} catch {
		// Fine.
	}
};

/** Resolve draft paths against the library; drop missing files. */
export const tracksFromDraftPaths = <T extends { path: string }>(
	paths: string[],
	library: T[],
): T[] => {
	const byPath = new Map(library.map(track => [track.path, track]));
	return paths.flatMap(path => {
		const track = byPath.get(path);
		return track ? [track] : [];
	});
};

/** data URL (or raw base64) → blob URL for cover preview. */
export const coverUrlFromData = (data: string): string => {
	const bytes = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
	try {
		const binary = atob(bytes);
		const array = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
		return URL.createObjectURL(new Blob([array], { type: "image/jpeg" }));
	} catch {
		return "";
	}
};
