import { useEffect, useRef, useState } from "react";
import { asNativeAudio } from "../utils/nativeAudio";

/** When the music stops: at a time (ms since the epoch), or at the end of the track. */
export type SleepTimer = { kind: "time"; endsAt: number } | { kind: "track" } | null;

/** How long the music fades out before it stops (the desktop's; Android's in PlayerHub.kt). */
const FADE_MS = 15_000;

/**
 * The sleep timer. At a time, the music fades out and pauses: on Android in
 * the app's player (the page may sleep with the screen off), elsewhere here.
 * At the end of the track, the player loads the next one paused instead of
 * playing it (`setStopAfterTrack`). Either way it is off again after.
 */
export const useSleepTimer = (
    element: HTMLAudioElement,
    volume: number,
    setStopAfterTrack: (done: (() => void) | null) => void,
) => {
    const [timer, setTimer] = useState<SleepTimer>(null);
    // The volume to fade from and to come back to, as it is now.
    const volumeNow = useRef(volume);
    useEffect(() => {
        volumeNow.current = volume;
    });

    useEffect(() => {
        if (timer?.kind !== "time") return;
        const native = asNativeAudio(element);
        if (native) {
            native.sleepAfter(Math.max(0, (timer.endsAt - Date.now()) / 1000));
            const slept = () => setTimer(null);
            element.addEventListener("slept", slept);
            return () => {
                element.removeEventListener("slept", slept);
                native.cancelSleep();
            };
        }
        let fading = 0;
        const fadeIn = setTimeout(() => {
            fading = window.setInterval(() => {
                const left = timer.endsAt - Date.now();
                if (left > 0) {
                    element.volume = volumeNow.current * Math.min(1, left / FADE_MS);
                    return;
                }
                element.pause();
                setTimer(null);
            }, 100);
        }, Math.max(0, timer.endsAt - Date.now() - FADE_MS));
        return () => {
            clearTimeout(fadeIn);
            clearInterval(fading);
            element.volume = volumeNow.current;
        };
    }, [timer, element]);

    useEffect(() => {
        setStopAfterTrack(timer?.kind === "track" ? () => setTimer(null) : null);
    }, [timer, setStopAfterTrack]);

    return { timer, setTimer };
};
