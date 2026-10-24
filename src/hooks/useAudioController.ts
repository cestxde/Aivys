import { useCallback, useState, useRef, useEffect, useSyncExternalStore } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { notifyError } from "../utils/notify";
import { t } from "../i18n";

// An AbortError only means a newer load interrupted play(): not worth a notice.
const reportPlaybackError = (e: unknown) => {
    if (e instanceof DOMException && e.name === "AbortError") return;
    notifyError(t("error.playback"), e);
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

    // Replace the current source with `filePath`, resetting the position to 0.
    // Returns the audio element so callers can start playback if needed.
    const loadSource = (filePath: string) => {
        const assetUrl = convertFileSrc(filePath);

        if (!audioRef.current) {
            audioRef.current = new Audio(assetUrl);
        } else {
            audioRef.current.pause();
            audioRef.current.src = assetUrl;
            audioRef.current.load();
        }

        audioRef.current.volume = Math.pow(initialVolume, 2);
        audioRef.current.currentTime = 0;
        return audioRef.current;
    };

    const playFile = (filePath: string) => {
        const audio = loadSource(filePath);
        setIsPlaying(true);
        audio.play().catch(reportPlaybackError);
    };

    // Load a track without starting playback (paused, position at 0).
    const loadFilePaused = (filePath: string) => {
        loadSource(filePath);
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