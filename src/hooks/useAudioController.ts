import { useCallback, useState, useRef, useEffect, useSyncExternalStore } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { notifyError } from "../utils/notify";
import { t } from "../i18n";

// An AbortError only means a newer load interrupted play(): not worth a notice.
const reportPlaybackError = (e: unknown) => {
    if (e instanceof DOMException && e.name === "AbortError") return;
    notifyError(t("error.playback"), e);
};

// Files rewritten this session (tag edits), by how many times. The webview
// caches what it read of a URL, and a rewritten file has its audio at other
// offsets: played from the old URL, it stalls partway and cannot seek.
const revisions = new Map<string, number>();

/** The URL the audio element loads `filePath` from: a new one after each rewrite. */
export const trackUrl = (filePath: string) => {
    const revision = revisions.get(filePath);
    const url = convertFileSrc(filePath);
    return revision ? `${url}?v=${revision}` : url;
};

/** The files at `paths` were rewritten: load them from new URLs from now on. */
export const markRewritten = (paths: string[]) => {
    for (const path of paths) revisions.set(path, (revisions.get(path) ?? 0) + 1);
};

/**
 * Position and length of what `element` plays, for the seek bar. Kept out of
 * the controller so only components showing the time re-render as it runs.
 */
export const usePlaybackTime = (element: HTMLAudioElement) => {
    const subscribe = useCallback((onChange: () => void) => {
        const events = ["timeupdate", "durationchange", "loadedmetadata", "seeked", "emptied"];
        events.forEach(event => element.addEventListener(event, onChange));
        return () => events.forEach(event => element.removeEventListener(event, onChange));
    }, [element]);
    const currentTime = useSyncExternalStore(subscribe, () => element.currentTime);
    const duration = useSyncExternalStore(subscribe, () => (Number.isFinite(element.duration) ? element.duration : 0));
    return { currentTime, duration };
};

export const useAudioController = (
    initialVolume: number,
    onVolumeChange: (v: number) => void
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    // One element for the whole session: every track is loaded into it, so
    // listeners attached once keep working.
    const [element] = useState(() => new Audio());
    const audioRef = useRef<HTMLAudioElement | null>(element);

    // Playing or not follows the element itself, so a failed start or a pause
    // from outside (the system) shows correctly.
    useEffect(() => {
        const playing = () => setIsPlaying(true);
        const paused = () => setIsPlaying(false);
        element.addEventListener("play", playing);
        element.addEventListener("pause", paused);
        return () => {
            element.removeEventListener("play", playing);
            element.removeEventListener("pause", paused);
        };
    }, [element]);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = Math.pow(initialVolume, 2);
        }
    }, [initialVolume]);

    // Replace the current source with `filePath`, resetting the position to 0
    // (or `startAt` seconds, once the file is far enough loaded to seek).
    // Returns the audio element so callers can start playback if needed.
    const loadSource = (filePath: string, startAt = 0) => {
        const assetUrl = trackUrl(filePath);

        if (!audioRef.current) {
            audioRef.current = new Audio(assetUrl);
        } else {
            audioRef.current.pause();
            audioRef.current.src = assetUrl;
            audioRef.current.load();
        }

        audioRef.current.volume = Math.pow(initialVolume, 2);
        audioRef.current.currentTime = 0;
        if (startAt > 0) {
            const audio = audioRef.current;
            audio.addEventListener("loadedmetadata", () => {
                // Not if another track was loaded meanwhile.
                if (audio.src === assetUrl) audio.currentTime = Math.min(startAt, audio.duration || startAt);
            }, { once: true });
        }
        return audioRef.current;
    };

    const playFile = (filePath: string) => {
        const audio = loadSource(filePath);
        setIsPlaying(true);
        audio.play().catch(reportPlaybackError);
    };

    // Load a track without starting playback (paused, at `startAt` seconds).
    const loadFilePaused = (filePath: string, startAt = 0) => {
        loadSource(filePath, startAt);
        setIsPlaying(false);
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(reportPlaybackError);
        }
        setIsPlaying(!isPlaying);
    };

    const seek = (time: number) => {
        if (audioRef.current) audioRef.current.currentTime = time;
    };

    // Stop playback entirely and reset the position.
    const stop = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
    };

    // Stop and let go of the file (Windows cannot move a file that is open).
    const unload = () => {
        stop();
        if (audioRef.current) {
            audioRef.current.removeAttribute("src");
            audioRef.current.load();
        }
    };

    return {
        isPlaying, setIsPlaying,
        volume: initialVolume,
        setVolume: onVolumeChange,
        audioRef, element,
        playFile, loadFilePaused, togglePlay, seek, stop, unload
    };
};