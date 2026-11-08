import { useSyncExternalStore } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "../i18n";
import { notifyError } from "./notify";

/**
 * App updates from the GitHub releases (the updater plugin checks the latest
 * release's `latest.json`). One state for the whole app: the dialog shown on
 * startup and the settings section read and drive the same check.
 *
 * Android has no updater plugin: there the latest release is read from the
 * GitHub API, and the update is a link to its APK (`LinkUpdate`) that the
 * browser downloads and the system installs.
 *
 * Release notes come from the GitHub releases list so skipped versions still
 * show up in the update dialog; settings can open the full history.
 */
export interface LinkUpdate {
    version: string;
    currentVersion: string;
    body?: string;
    downloadUrl: string;
}

export type AvailableUpdate = Update | LinkUpdate;

export const isLinkUpdate = (update: AvailableUpdate): update is LinkUpdate => "downloadUrl" in update;

export const isAndroid = /Android/i.test(navigator.userAgent);

const REPOSITORY = "cestxde/Aivys";
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`;
const CACHE_MS = 5 * 60 * 1000;

/** One published GitHub release, newest first in lists. */
export interface ReleaseInfo {
    version: string;
    body: string;
    publishedAt: string | null;
    htmlUrl: string;
    /** APK asset URL when present (Android). */
    apkUrl: string | null;
}

export type UpdateStatus =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "current" }
    | { kind: "available"; update: AvailableUpdate; notes: string }
    | { kind: "downloading"; update: Update; notes: string; done: number; total: number | null }
    | { kind: "error"; message: string; update?: Update; notes?: string };

const PROMPT_KEY = "aivys.updates.prompt";

let status: UpdateStatus = { kind: "idle" };
// The update dialog is open (for the available update).
let dialogOpen = false;
// The full changelog (settings).
let changelogOpen = false;
let prompt = readPrompt();
let releasesCache: { at: number; items: ReleaseInfo[] } | null = null;
const listeners = new Set<() => void>();

function readPrompt(): boolean {
    try {
        return localStorage.getItem(PROMPT_KEY) !== "false";
    } catch {
        return true;
    }
}

const emit = () => listeners.forEach(listener => listener());
const set = (next: UpdateStatus) => {
    status = next;
    emit();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useUpdateStatus = () => useSyncExternalStore(subscribe, () => status);
export const useUpdateDialogOpen = () => useSyncExternalStore(subscribe, () => dialogOpen);
export const useChangelogOpen = () => useSyncExternalStore(subscribe, () => changelogOpen);
export const useUpdatePrompt = () => useSyncExternalStore(subscribe, () => prompt);

/** Whether a new version is offered on startup (this device only). */
export const setUpdatePrompt = (value: boolean) => {
    prompt = value;
    try {
        localStorage.setItem(PROMPT_KEY, String(value));
    } catch {
        // Not remembered; it still applies until the app closes.
    }
    emit();
};

export const openUpdateDialog = () => {
    dialogOpen = true;
    emit();
};

export const closeUpdateDialog = () => {
    dialogOpen = false;
    emit();
};

export const openChangelog = () => {
    changelogOpen = true;
    emit();
};

export const closeChangelog = () => {
    changelogOpen = false;
    emit();
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Whether version `a` is newer than `b` (dotted numbers; what follows a `-` is ignored). */
export const isNewer = (a: string, b: string) => {
    const parts = (version: string) => version.split("-")[0].split(".").map(part => parseInt(part, 10) || 0);
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const difference = (x[i] ?? 0) - (y[i] ?? 0);
        if (difference !== 0) return difference > 0;
    }
    return false;
};

const sameVersion = (a: string, b: string) => !isNewer(a, b) && !isNewer(b, a);

/** Published releases from GitHub, newest first (cached briefly). */
export const fetchReleases = async ({ force = false }: { force?: boolean } = {}): Promise<ReleaseInfo[]> => {
    if (!force && releasesCache && Date.now() - releasesCache.at < CACHE_MS) {
        return releasesCache.items;
    }
    const response = await fetch(RELEASES_URL);
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const raw = await response.json() as {
        tag_name?: string;
        body?: string | null;
        draft?: boolean;
        prerelease?: boolean;
        published_at?: string | null;
        html_url?: string;
        assets?: { name: string; browser_download_url: string }[];
    }[];
    const items = raw
        .filter(release => !release.draft && !release.prerelease)
        .map((release): ReleaseInfo | null => {
            const version = (release.tag_name ?? "").replace(/^v/, "");
            if (!version) return null;
            const apk = release.assets?.find(asset => asset.name.endsWith(".apk"));
            return {
                version,
                body: (release.body ?? "").trim(),
                publishedAt: release.published_at ?? null,
                htmlUrl: release.html_url ?? `https://github.com/${REPOSITORY}/releases/tag/v${version}`,
                apkUrl: apk?.browser_download_url ?? null,
            };
        })
        .filter((release): release is ReleaseInfo => release !== null);
    releasesCache = { at: Date.now(), items };
    return items;
};

/** Notes for every release newer than `currentVersion`, newest first. */
export const notesSince = (releases: ReleaseInfo[], currentVersion: string): string => {
    const missed = releases.filter(release => isNewer(release.version, currentVersion));
    return missed
        .map(release => {
            const body = release.body || t("updates.noNotes");
            return `## ${release.version}\n\n${body}`;
        })
        .join("\n\n");
};

/** Notes attached to the current available / downloading update, if any. */
export const notesOf = (state: UpdateStatus): string | undefined =>
    "notes" in state ? state.notes : undefined;

/** Android's check: the latest GitHub release, if it is newer than this app. */
const checkRelease = async (): Promise<{ update: LinkUpdate; notes: string } | null> => {
    const currentVersion = await getVersion();
    const releases = await fetchReleases({ force: true });
    const latest = releases[0];
    if (!latest || !isNewer(latest.version, currentVersion)) return null;
    return {
        update: {
            version: latest.version,
            currentVersion,
            body: latest.body || undefined,
            downloadUrl: latest.apkUrl ?? latest.htmlUrl,
        },
        notes: notesSince(releases, currentVersion) || latest.body || "",
    };
};

/** Open the APK's link (the browser takes it from there). */
export const openDownload = (update: LinkUpdate) => {
    openUrl(update.downloadUrl)
        .then(closeUpdateDialog)
        .catch(e => notifyError(t("updates.openFailed"), e));
};

/**
 * Look for a newer version. On startup (`manual` false) this is quiet: only
 * an available update is shown (as the dialog, if the prompt is on), errors
 * go to the console. Notes cover every release since the installed version.
 */
export const checkForUpdates = async ({ manual }: { manual: boolean }) => {
    if (status.kind === "checking" || status.kind === "downloading") return;
    set({ kind: "checking" });
    try {
        if (isAndroid) {
            const found = await checkRelease();
            if (found) {
                set({ kind: "available", update: found.update, notes: found.notes });
                if (manual || prompt) openUpdateDialog();
            } else {
                set({ kind: "current" });
            }
            return;
        }

        const update = await check();
        if (update) {
            let notes = update.body?.trim() ?? "";
            try {
                const releases = await fetchReleases({ force: true });
                notes = notesSince(releases, update.currentVersion) || notes;
            } catch (e) {
                // Still offer the update; the single-release body from latest.json remains.
                console.warn("could not load release history for notes", e);
            }
            set({ kind: "available", update, notes });
            if (manual || prompt) openUpdateDialog();
        } else {
            set({ kind: "current" });
        }
    } catch (e) {
        console.error("update check failed", e);
        set(manual ? { kind: "error", message: message(e) } : { kind: "idle" });
    }
};

/**
 * Download and install `update`, then start the new version. `beforeInstall`
 * runs once the download is done (Windows ends the app for the installer).
 */
export const installUpdate = async (update: Update, beforeInstall: () => void) => {
    const notes = notesOf(status) ?? update.body?.trim() ?? "";
    set({ kind: "downloading", update, notes, done: 0, total: null });
    let done = 0;
    let total: number | null = null;
    try {
        await update.downloadAndInstall((event) => {
            if (event.event === "Started") total = event.data.contentLength ?? null;
            if (event.event === "Progress") done += event.data.chunkLength;
            if (event.event === "Finished") beforeInstall();
            set({ kind: "downloading", update, notes, done, total });
        });
        await relaunch();
    } catch (e) {
        console.error("update install failed", e);
        set({ kind: "error", message: message(e), update, notes });
    }
};

export { sameVersion };
