import { useEffect, useRef } from "react";
import type { Track } from "../types";

/** Persist listening chunks at least this often while music is playing. */
const FLUSH_EVERY_MS = 30_000;

/**
 * Measures wall-clock time spent playing and reports whole-second chunks via
 * `onListen`. Flushes on pause, track change, page hide, and every few seconds
 * while playing so a crash loses little.
 */
export const useListenTracking = (
    element: HTMLAudioElement,
    track: Track | null,
    onListen: (track: Track, seconds: number) => void,
) => {
    const latest = useRef({ track, onListen });
    useEffect(() => {
        latest.current = { track, onListen };
    }, [track, onListen]);

    useEffect(() => {
        let pending = 0;
        let since: number | null = null;
        let lastFlush = 0;
        // The track the pending seconds belong to (stable across `latest` updates).
        let credited: Track | null = track;

        const flush = (forTrack: Track | null = credited) => {
            const whole = Math.floor(pending);
            if (!forTrack || whole < 1) {
                if (whole >= 1) pending -= whole;
                return;
            }
            pending -= whole;
            lastFlush = Date.now();
            latest.current.onListen(forTrack, whole);
        };

        const tick = () => {
            if (since === null) return;
            const now = performance.now();
            pending += (now - since) / 1000;
            since = now;
            if (Date.now() - lastFlush >= FLUSH_EVERY_MS) flush();
        };

        const start = () => {
            if (since !== null || !credited) return;
            since = performance.now();
            lastFlush = Date.now();
        };

        const stop = () => {
            tick();
            since = null;
            flush();
        };

        const handlePlaying = () => {
            credited = latest.current.track;
            start();
        };
        const handlePause = () => stop();
        const handleEnded = () => stop();
        const handleTimeUpdate = () => tick();
        // A new source: credit what was left of the previous track, then wait
        // for `playing` on the next one.
        const handleLoadStart = () => {
            stop();
            credited = latest.current.track;
        };

        const handlePageHide = () => stop();

        if (!element.paused && credited) start();

        element.addEventListener("playing", handlePlaying);
        element.addEventListener("pause", handlePause);
        element.addEventListener("ended", handleEnded);
        element.addEventListener("timeupdate", handleTimeUpdate);
        element.addEventListener("loadstart", handleLoadStart);
        window.addEventListener("pagehide", handlePageHide);
        window.addEventListener("beforeunload", handlePageHide);
        return () => {
            stop();
            element.removeEventListener("playing", handlePlaying);
            element.removeEventListener("pause", handlePause);
            element.removeEventListener("ended", handleEnded);
            element.removeEventListener("timeupdate", handleTimeUpdate);
            element.removeEventListener("loadstart", handleLoadStart);
            window.removeEventListener("pagehide", handlePageHide);
            window.removeEventListener("beforeunload", handlePageHide);
        };
    }, [element, track]);
};
