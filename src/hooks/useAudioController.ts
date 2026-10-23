import { useState, useRef, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { notifyError } from "../utils/notify";

// An AbortError only means a newer load interrupted play(): not worth a notice.
const reportPlaybackError = (e: unknown) => {
    if (e instanceof DOMException && e.name === "AbortError") return;
    notifyError("Playback failed", e);
};

export const useAudioController = (
    initialVolume: number,
    onVolumeChange: (v: number) => void
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    // One element for the whole session: every track is loaded into it, so
    // listeners attached once keep working.
    const [element] = useState(() => new Audio());
    const audioRef = useRef<HTMLAudioElement | null>(element);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = Math.pow(initialVolume, 2);
        }
    }, [initialVolume]);

    // Track time and duration
    useEffect(() => {
        const updateTime = () => setCurrentTime(element.currentTime);
        const updateDuration = () => setDuration(element.duration);

        element.addEventListener("timeupdate", updateTime);
        element.addEventListener("loadedmetadata", updateDuration);

        return () => {
            element.removeEventListener("timeupdate", updateTime);
            element.removeEventListener("loadedmetadata", updateDuration);
        };
    }, [element]);

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
        setCurrentTime(0);
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
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    // Stop playback entirely and reset the position.
    const stop = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setCurrentTime(0);
        setIsPlaying(false);
    };

    return {
        isPlaying, setIsPlaying,
        volume: initialVolume,
        setVolume: onVolumeChange,
        currentTime, duration,
        audioRef, element,
        playFile, loadFilePaused, togglePlay, seek, stop
    };
};