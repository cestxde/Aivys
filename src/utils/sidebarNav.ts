import type { MessageKey } from "../i18n";
import type { View } from "../types";

/** Stable ids of customizable sidebar tabs (Settings stays pinned at the bottom). */
export const SIDEBAR_ITEM_IDS = [
	"library",
	"favorites",
	"playlists",
	"artists",
	"albums",
	"tags",
	"folders",
	"stats",
	"incomplete",
	"mostPlayed",
	"recentlyPlayed",
	"hidden",
] as const;

export type SidebarItemId = (typeof SIDEBAR_ITEM_IDS)[number];

/** Always on, only when the tab has content, or never. */
export type SidebarVisibility = "always" | "auto" | "hidden";

export type SidebarTabEntry = {
	kind: "tab";
	id: SidebarItemId;
	visibility: SidebarVisibility;
};

export type SidebarSeparatorEntry = {
	kind: "separator";
	id: string;
};

export type SidebarNavEntry = SidebarTabEntry | SidebarSeparatorEntry;

/** Tabs that can hide themselves when empty. */
export const SIDEBAR_AUTO_IDS: ReadonlySet<SidebarItemId> = new Set([
	"favorites",
	"playlists",
	"tags",
	"folders",
	"incomplete",
	"mostPlayed",
	"recentlyPlayed",
	"hidden",
]);

export const sidebarSupportsAuto = (id: SidebarItemId): boolean => SIDEBAR_AUTO_IDS.has(id);

/** Default order, visibility and section breaks. */
export const DEFAULT_SIDEBAR_NAV: SidebarNavEntry[] = [
	{ kind: "tab", id: "library", visibility: "always" },
	{ kind: "tab", id: "favorites", visibility: "always" },
	{ kind: "separator", id: "sep-1" },
	{ kind: "tab", id: "playlists", visibility: "always" },
	{ kind: "tab", id: "artists", visibility: "always" },
	{ kind: "tab", id: "albums", visibility: "always" },
	{ kind: "tab", id: "tags", visibility: "always" },
	{ kind: "tab", id: "folders", visibility: "auto" },
	{ kind: "separator", id: "sep-2" },
	{ kind: "tab", id: "stats", visibility: "always" },
	{ kind: "tab", id: "incomplete", visibility: "always" },
	{ kind: "tab", id: "mostPlayed", visibility: "always" },
	{ kind: "tab", id: "recentlyPlayed", visibility: "always" },
	{ kind: "tab", id: "hidden", visibility: "always" },
];

export const sidebarItemLabel = (id: SidebarItemId): MessageKey => {
	switch (id) {
		case "library": return "nav.library";
		case "favorites": return "nav.favorites";
		case "playlists": return "nav.playlists";
		case "artists": return "nav.artists";
		case "albums": return "nav.albums";
		case "tags": return "nav.tags";
		case "folders": return "nav.folders";
		case "stats": return "nav.stats";
		case "incomplete": return "nav.incomplete";
		case "mostPlayed": return "nav.mostPlayed";
		case "recentlyPlayed": return "nav.recentlyPlayed";
		case "hidden": return "nav.hidden";
	}
};

export const sidebarItemView = (id: SidebarItemId): View => {
	switch (id) {
		case "library": return { kind: "system", id: "library" };
		case "favorites": return { kind: "system", id: "favorites" };
		case "playlists": return { kind: "playlists" };
		case "artists": return { kind: "artists" };
		case "albums": return { kind: "albums" };
		case "tags": return { kind: "tags" };
		case "folders": return { kind: "folder", id: "" };
		case "stats": return { kind: "stats" };
		case "incomplete": return { kind: "incomplete" };
		case "mostPlayed": return { kind: "system", id: "mostPlayed" };
		case "recentlyPlayed": return { kind: "system", id: "recentlyPlayed" };
		case "hidden": return { kind: "system", id: "hidden" };
	}
};

const isSidebarItemId = (value: unknown): value is SidebarItemId =>
	typeof value === "string" && (SIDEBAR_ITEM_IDS as readonly string[]).includes(value);

const isVisibility = (value: unknown): value is SidebarVisibility =>
	value === "always" || value === "auto" || value === "hidden";

const clampVisibility = (id: SidebarItemId, visibility: SidebarVisibility): SidebarVisibility => {
	if (visibility === "auto" && !sidebarSupportsAuto(id)) return "always";
	return visibility;
};

/** Stable key used for drag-and-drop. */
export const sidebarEntryKey = (entry: SidebarNavEntry): string =>
	entry.kind === "tab" ? `tab:${entry.id}` : `sep:${entry.id}`;

export const cloneSidebarNav = (nav: SidebarNavEntry[]): SidebarNavEntry[] =>
	nav.map(entry => (entry.kind === "tab"
		? { kind: "tab", id: entry.id, visibility: entry.visibility }
		: { kind: "separator", id: entry.id }));

/** Drop empty / consecutive separators and ensure every tab appears once. */
export const normalizeSidebarNav = (raw: unknown): SidebarNavEntry[] => {
	const seenTabs = new Set<SidebarItemId>();
	const seenSeps = new Set<string>();
	const out: SidebarNavEntry[] = [];
	let sepCounter = 0;

	const pushSep = (id?: string) => {
		let next = id && !seenSeps.has(id) ? id : "";
		if (!next) {
			do {
				sepCounter += 1;
				next = `sep-${sepCounter}`;
			} while (seenSeps.has(next));
		}
		seenSeps.add(next);
		out.push({ kind: "separator", id: next });
	};

	if (Array.isArray(raw)) {
		for (const entry of raw) {
			if (!entry || typeof entry !== "object") continue;
			const kind = (entry as { kind?: unknown }).kind;
			const id = (entry as { id?: unknown }).id;

			// New shape
			if (kind === "separator") {
				if (out.length === 0 || out[out.length - 1].kind === "separator") continue;
				pushSep(typeof id === "string" ? id : undefined);
				continue;
			}
			if (kind === "tab" && isSidebarItemId(id)) {
				if (seenTabs.has(id)) continue;
				seenTabs.add(id);
				const visibilityRaw = (entry as { visibility?: unknown }).visibility;
				const visibility = clampVisibility(
					id,
					isVisibility(visibilityRaw) ? visibilityRaw : "always",
				);
				out.push({ kind: "tab", id, visibility });
				continue;
			}

			// Legacy `{ id, enabled }` (and optional dividers via DEFAULT_SIDEBAR_DIVIDERS_AFTER)
			if (kind == null && isSidebarItemId(id)) {
				if (seenTabs.has(id)) continue;
				seenTabs.add(id);
				const enabled = (entry as { enabled?: unknown }).enabled !== false;
				const visibility: SidebarVisibility = !enabled
					? "hidden"
					: id === "folders"
						? "auto"
						: "always";
				out.push({ kind: "tab", id, visibility });
			}
		}
	}

	// Legacy layout had fixed dividers after favorites / folders when migrating
	// a plain tab list with no separators yet.
	const hadSeparators = Array.isArray(raw) && raw.some(
		entry => entry && typeof entry === "object" && (entry as { kind?: unknown }).kind === "separator",
	);
	if (!hadSeparators && out.every(e => e.kind === "tab")) {
		const withSeps: SidebarNavEntry[] = [];
		for (const entry of out) {
			withSeps.push(entry);
			if (entry.kind === "tab" && (entry.id === "favorites" || entry.id === "folders")) {
				withSeps.push({ kind: "separator", id: entry.id === "favorites" ? "sep-1" : "sep-2" });
			}
		}
		out.length = 0;
		out.push(...withSeps);
		for (const entry of out) {
			if (entry.kind === "separator") seenSeps.add(entry.id);
		}
	}

	for (const entry of DEFAULT_SIDEBAR_NAV) {
		if (entry.kind === "tab" && !seenTabs.has(entry.id)) {
			out.push({ ...entry });
			seenTabs.add(entry.id);
		}
	}

	// Collapse consecutive separators; keep leading/trailing so the editor can place them.
	for (let i = out.length - 1; i > 0; i--) {
		if (out[i].kind === "separator" && out[i - 1].kind === "separator") out.splice(i, 1);
	}

	return out;
};

/** Whether a tab should appear in the rail right now. */
export const sidebarTabVisible = (
	entry: SidebarTabEntry,
	hasContent: Partial<Record<SidebarItemId, boolean>>,
): boolean => {
	if (entry.visibility === "hidden") return false;
	if (entry.visibility === "always") return true;
	return hasContent[entry.id] === true;
};

/** Insert a new separator after `afterKey`, or at the end. */
export const insertSidebarSeparator = (
	nav: SidebarNavEntry[],
	afterKey: string | null,
): SidebarNavEntry[] => {
	const copy = cloneSidebarNav(nav);
	const used = new Set(copy.filter(e => e.kind === "separator").map(e => e.id));
	let n = 1;
	while (used.has(`sep-${n}`)) n += 1;
	const sep: SidebarSeparatorEntry = { kind: "separator", id: `sep-${n}` };
	if (!afterKey) {
		copy.push(sep);
		return normalizeSidebarNav(copy);
	}
	const index = copy.findIndex(e => sidebarEntryKey(e) === afterKey);
	if (index < 0) {
		copy.push(sep);
	} else {
		copy.splice(index + 1, 0, sep);
	}
	return normalizeSidebarNav(copy);
};

export const removeSidebarSeparator = (nav: SidebarNavEntry[], sepId: string): SidebarNavEntry[] =>
	normalizeSidebarNav(nav.filter(e => !(e.kind === "separator" && e.id === sepId)));

/** Reorder by drag keys (same as TrackList moveItem). */
export const reorderSidebarNav = (
	nav: SidebarNavEntry[],
	movedKey: string,
	targetKey: string,
	after: boolean,
): SidebarNavEntry[] => {
	const keys = nav.map(sidebarEntryKey);
	const rest = keys.filter(k => k !== movedKey);
	const index = rest.indexOf(targetKey);
	if (index < 0) return nav;
	rest.splice(after ? index + 1 : index, 0, movedKey);
	const byKey = new Map(nav.map(e => [sidebarEntryKey(e), e]));
	return normalizeSidebarNav(rest.flatMap(k => {
		const entry = byKey.get(k);
		return entry ? [entry] : [];
	}));
};

const STORAGE_KEY = "aivys.sidebar.nav";

export const loadSidebarNav = (): SidebarNavEntry[] => {
	try {
		return normalizeSidebarNav(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
	} catch {
		return cloneSidebarNav(DEFAULT_SIDEBAR_NAV);
	}
};

export const saveSidebarNav = (nav: SidebarNavEntry[]): void => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSidebarNav(nav)));
	} catch {
		// Not remembered; fine.
	}
};
