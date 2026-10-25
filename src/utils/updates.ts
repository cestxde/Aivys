import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * App updates from the GitHub releases (the updater plugin checks the latest
 * release's `latest.json`). One state for the whole app: the dialog shown on
 * startup and the settings section read and drive the same check.
 */
export type UpdateStatus =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "current" }
    | { kind: "available"; update: Update }
    | { kind: "downloading"; update: Update; done: number; total: number | null }
    | { kind: "error"; message: string; update?: Update };

const PROMPT_KEY = "aivys.updates.prompt";

let status: UpdateStatus = { kind: "idle" };
// The dialog is open (for the available update).
let dialogOpen = false;
let prompt = readPrompt();
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

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Look for a newer version. On startup (`manual` false) this is quiet: only
 * an available update is shown (as the dialog, if the prompt is on), errors
 * go to the console.
 */
export const checkForUpdates = async ({ manual }: { manual: boolean }) => {
    if (status.kind === "checking" || status.kind === "downloading") return;
    set({ kind: "checking" });
    try {
        const update = await check();
        if (update) {
            set({ kind: "available", update });
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
    set({ kind: "downloading", update, done: 0, total: null });
    let done = 0;
    let total: number | null = null;
    try {
        await update.downloadAndInstall((event) => {
            if (event.event === "Started") total = event.data.contentLength ?? null;
            if (event.event === "Progress") done += event.data.chunkLength;
            if (event.event === "Finished") beforeInstall();
            set({ kind: "downloading", update, done, total });
        });
        await relaunch();
    } catch (e) {
        console.error("update install failed", e);
        set({ kind: "error", message: message(e), update });
    }
};
