import { useState, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { AudioFile } from "../types";

export const useAudioPlayer = () => {
    const [path, setPath] = useState("");
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handleScan = async () => {
        try {
            const result: AudioFile[] = await invoke("scan_directory", { basePath: path });
            setFiles(result);
        } catch (error) {
            console.error("Scan error:", error);
        }
    };

    const playTrack = (filePath: string) => {
        const assetUrl = convertFileSrc(filePath);

        if (!audioRef.current) {
            audioRef.current = new Audio(assetUrl);
        } else {
            audioRef.current.pause();
            audioRef.current.src = assetUrl;
            audioRef.current.load();
        }

        setActivePath(filePath);
        audioRef.current.play().catch(e => console.error("Playback error:", e));
    };

    return {
        path,
        setPath,
        files,
        activePath,
        handleScan,
        playTrack
    };
};