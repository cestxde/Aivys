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

    const playFile = (filePath: string) => {
        const assetUrl = convertFileSrc(filePath);

        if (!audioRef.current) {
            audioRef.current = new Audio(assetUrl);
        } else {
            audioRef.current.pause();
            audioRef.current.src = assetUrl;
            audioRef.current.load();
        }

        audioRef.current.volume = Math.pow(initialVolume, 2);
        setIsPlaying(true);
        audioRef.current.play().catch(e => console.error("Playback error:", e));
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
        playFile, togglePlay, seek
    };
};