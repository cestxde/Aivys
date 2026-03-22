import { useState, useRef, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { AudioFile } from "../types";

export const useAudioPlayer = () => {
    const [path, setPath] = useState("");
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.5);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = Math.pow(volume, 2);
        }
    }, [volume]);

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
    }, [activePath]);

    const seek = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleScan = async () => {
        try {
            const result: AudioFile[] = await invoke("scan_directory", { basePath: path });
            setFiles(result);
        } catch (error) {
            console.error("Scan error:", error);
        }
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

    const playTrack = (filePath: string) => {
        const assetUrl = convertFileSrc(filePath);

        if (!audioRef.current) {
            audioRef.current = new Audio(assetUrl);
            audioRef.current.volume = volume;
        } else {
            audioRef.current.pause();
            audioRef.current.src = assetUrl;
            audioRef.current.load();
        }

        setActivePath(filePath);
        setIsPlaying(true);
        audioRef.current.play().catch(e => console.error("Playback error:", e));
    };

    return {
        path,
        setPath,
        files,
        activePath,
        isPlaying,
        volume,
        setVolume,
        handleScan,
        playTrack,
        togglePlay,
        currentTime,
        duration,
        seek
    };
};