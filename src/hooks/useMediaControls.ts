import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Track } from "../types";
import { displayArtists, displayTitle } from "../utils/track";
import { asNativeAudio } from "../utils/nativeAudio";

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
 * the lock screen, media keys; Android: the notification, the lock screen,
 * headset buttons): they show the loaded track and control playback. On
 * Windows through the backend; on Android the app's player has them, and
 * plays and pauses by itself.
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

    // Android: "next" / "previous" from the system's controls.
    useEffect(() => {
        const next = () => latest.current.next();
        const previous = () => latest.current.previous();
        element.addEventListener("nexttrack", next);
        element.addEventListener("previoustrack", previous);
        return () => {
            element.removeEventListener("nexttrack", next);
            element.removeEventListener("previoustrack", previous);
        };
    }, [element]);

    useEffect(() => {
        if (!track) return;
        asNativeAudio(element)?.setNowPlaying({
            title: displayTitle(track),
            artist: displayArtists(track),
            album: track.album,
            cover: track.coverPath,
        });
    }, [element, track]);

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
