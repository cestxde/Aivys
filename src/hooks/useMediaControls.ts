import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Track } from "../types";
import { displayArtists, displayTitle } from "../utils/track";

interface MediaControl {
    action: "play" | "pause" | "stop" | "next" | "previous" | "seek";
    /** Seconds, for "seek". */
    position?: number;
}

interface MediaActions {
    play: () => void;
    pause: () => void;
    next: () => void;
    previous: () => void;
    seek: (time: number) => void;
}

/**
 * The system's media controls (Windows: the volume flyout, quick settings,
 * the lock screen, media keys): they show the loaded track and control
 * playback. Elsewhere the backend ignores this.
 */
export const useMediaControls = (
    element: HTMLAudioElement,
    track: Track | null,
    playing: boolean,
    actions: MediaActions
) => {
    // The listener reads the latest handlers without re-subscribing.
    const latest = useRef(actions);
    useEffect(() => {
        latest.current = actions;
    });

    useEffect(() => {
        const unlisten = listen<MediaControl>("media-control", ({ payload }) => {
            const handlers = latest.current;
            if (payload.action === "seek") {
                if (payload.position !== undefined) handlers.seek(payload.position);
            } else if (payload.action === "stop") {
                handlers.pause();
            } else {
                handlers[payload.action]();
            }
        });
        return () => {
            unlisten.then((stop) => stop()).catch(() => {});
        };
    }, []);

    // The track and its status; the position too, when it jumps (a seek, a
    // new track: the system moves it on by itself while playing).
    useEffect(() => {
        const report = () => {
            invoke("set_media_state", {
                state: track
                    ? {
                        status: playing ? "playing" : "paused",
                        path: track.path,
                        title: displayTitle(track),
                        artist: displayArtists(track),
                        album: track.album,
                        albumArtist: track.albumArtist,
                        coverPath: track.coverPath,
                        duration: Number.isFinite(element.duration) ? element.duration : track.duration,
                        position: element.currentTime,
                    }
                    : { status: "none", duration: 0, position: 0 },
            }).catch(console.error);
        };
        report();
        element.addEventListener("seeked", report);
        element.addEventListener("durationchange", report);
        return () => {
            element.removeEventListener("seeked", report);
            element.removeEventListener("durationchange", report);
        };
    }, [element, track, playing]);
};
