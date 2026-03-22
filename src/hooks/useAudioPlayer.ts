import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAudioController } from "./useAudioController";
import type { AudioFile } from "../types";

export const useAudioPlayer = () => {
    const [path, setPath] = useState<string>(() => {
        return localStorage.getItem("aivys_last_path") || "";
    });
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);

    const audio = useAudioController();

    // Persist folder path
    useEffect(() => {
        if (path) {
            localStorage.setItem("aivys_last_path", path);
        }
    }, [path]);

    const handleScan = async () => {
        try {
            const result: AudioFile[] = await invoke("scan_directory", { basePath: path });
            setFiles(result);
            localStorage.setItem("aivys_last_path", path);
        } catch (error) {
            console.error("Scan error:", error);
        }
    };

    const playTrack = (filePath: string) => {
        setActivePath(filePath);
        audio.playFile(filePath);
    };

    return {
        path,
        setPath,
        files,
        activePath,
        handleScan,
        playTrack,
        ...audio
    };
};