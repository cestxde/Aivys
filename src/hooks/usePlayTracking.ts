import { useEffect, useRef } from "react";
import type { Track } from "../types";

/** Share of a track that must be played for it to count as completed. */
const COMPLETE_RATIO = 0.9;

/**
 * Reports listening events of the audio element: `onStart` once each time a
 * track actually starts playing (resuming after a pause does not count, a
 * repeat does), `onComplete` once it has played to (near) the end.
 */
export const usePlayTracking = (
    element: HTMLAudioElement,
    track: Track | null,
    onStart: (track: Track) => void,
    onComplete: (track: Track) => void
) => {
    // Event handlers read the latest values without re-subscribing.
    const latest = useRef({ track, onStart, onComplete });
    useEffect(() => {
        latest.current = { track, onStart, onComplete };
    }, [track, onStart, onComplete]);

    useEffect(() => {
        let started = false;
        let completed = false;

        const reset = () => {
            started = false;
            completed = false;
        };

        const handlePlaying = () => {
            const { track, onStart } = latest.current;
            if (started || !track) return;
            started = true;
            onStart(track);
        };

        const handleTimeUpdate = () => {
            const { track, onComplete } = latest.current;
            if (!started || completed || !track) return;
            const duration = element.duration;
            if (duration > 0 && element.currentTime >= duration * COMPLETE_RATIO) {
                completed = true;
                onComplete(track);
            }
        };

        // A new source, or the end of the track (repeat-one replays it).
        const handleEnded = () => {
            handleTimeUpdate();
            reset();
        };

        element.addEventListener("loadstart", reset);
        element.addEventListener("playing", handlePlaying);
        element.addEventListener("timeupdate", handleTimeUpdate);
        element.addEventListener("ended", handleEnded);
        return () => {
            element.removeEventListener("loadstart", reset);
            element.removeEventListener("playing", handlePlaying);
            element.removeEventListener("timeupdate", handleTimeUpdate);
            element.removeEventListener("ended", handleEnded);
        };
    }, [element]);
};
