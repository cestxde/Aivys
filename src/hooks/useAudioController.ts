import { useState, useRef, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export const useAudioController = (
    initialVolume: number,
    onVolumeChange: (v: number) => void
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = Math.pow(initialVolume, 2);
        }
    }, [initialVolume]);

    // Track time and duration
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => setCurrentTime(audio.currentTime);
        const updateDuration = () => setDuration(audio.duration);

        audio.addEventListener("timeupdate", updateTime);
        audio.addEventListener("loadedmetadata", updateDuration);

        return () => {
            audio.removeEventListener("timeupdate", updateTime);
            audio.removeEventListener("loadedmetadata", updateDuration);
        };
    }, [isPlaying, audioRef.current]);

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
        audio.play().catch(e => console.error("Playback error:", e));
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
            audioRef.current.play().catch(e => console.error("Playback error:", e));
        }
        setIsPlaying(!isPlaying);
    };

    const seek = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    return {
        isPlaying, setIsPlaying,
        volume: initialVolume,
        setVolume: onVolumeChange,
        currentTime, duration,
        audioRef,
        playFile, loadFilePaused, togglePlay, seek
    };
};