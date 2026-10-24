import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { t, type Language } from "../i18n";

type TaskbarButton = "previous" | "toggle" | "next";

/**
 * The previous / play-pause / next buttons in the Windows taskbar's preview
 * of the window: they show whether a track plays, and control playback.
 * Elsewhere the backend ignores this.
 */
export const useTaskbar = (
    playing: boolean,
    hasTrack: boolean,
    language: Language,
    actions: Record<TaskbarButton, () => void>
) => {
    // The listener reads the latest handlers without re-subscribing.
    const latest = useRef(actions);
    useEffect(() => {
        latest.current = actions;
    });

    useEffect(() => {
        const unlisten = listen<TaskbarButton>("taskbar-button", (event) => latest.current[event.payload]?.());
        return () => {
            unlisten.then((stop) => stop()).catch(() => {});
        };
    }, []);

    useEffect(() => {
        const tips = {
            previous: t("player.previous"),
            play: t("player.play"),
            pause: t("player.pause"),
            next: t("player.next"),
        };
        invoke("set_taskbar_state", { playing, hasTrack, tips }).catch(console.error);
    }, [playing, hasTrack, language]);
};
