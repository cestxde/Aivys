import { useState, useEffect, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useAudioController } from "./useAudioController";
import { useAudioQueue } from "./useAudioQueue";
import type { AudioFile } from "../types";

export const useAudioPlayer = () => {
    const [path, setPath] = useState<string>(() => localStorage.getItem("aivys_last_path") || "");
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);

    const audio = useAudioController();
    const q = useAudioQueue();

    const playTrack = useCallback((
        trackOrPath: AudioFile | string,
        currentFiles: AudioFile[],
        shouldPlay = true
    ) => {
        let track: AudioFile | undefined;

        if (typeof trackOrPath === "string") {
            track = currentFiles.find(f => f.path === trackOrPath);
        } else {
            track = trackOrPath;
        }

        if (!track) return;

        setActivePath(track.path);
        q.buildQueue(currentFiles, track, q.isShuffle);

        if (shouldPlay) {
            audio.playFile(track.path);
        } else {
            if (audio.audioRef.current) {
                audio.audioRef.current.src = convertFileSrc(track.path);
                audio.audioRef.current.load();
                audio.setIsPlaying(false);
            }
        }
    }, [q.isShuffle, audio.playFile, audio.setIsPlaying, q.buildQueue]);

    const onNext = useCallback(() => {
        const next = q.getNextTrack(activePath);
        if (next) {
            playTrack(next, q.queue);
        }
    }, [activePath, q.getNextTrack, q.queue, playTrack]);

    const onAutoNext = useCallback(() => {
        if (q.repeatMode === 'one') {
            audio.seek(0);
            audio.audioRef.current?.play().catch(console.error);
            audio.setIsPlaying(true);
            return;
        }

        const isLastInQueue = q.queue.length > 0 &&
            activePath === q.queue[q.queue.length - 1].path;

        if (isLastInQueue && q.repeatMode === 'none') {
            if (q.queue.length > 0) {
                playTrack(q.queue[0], q.queue, false);
            }
        } else {
            onNext();
        }
    }, [q.repeatMode, q.queue, activePath, onNext, playTrack, audio.seek, audio.setIsPlaying]);

    const onPrev = useCallback(() => {
        if (audio.currentTime > 3) {
            audio.seek(0);
            return;
        }
        const prev = q.getPrevTrack(activePath);
        if (prev) {
            playTrack(prev, q.queue);
        }
    }, [audio.currentTime, audio.seek, q.getPrevTrack, q.queue, activePath, playTrack]);

    // Persist folder path
    useEffect(() => {
        if (path) localStorage.setItem("aivys_last_path", path);
    }, [path]);

    // Handle auto-next when track ends
    useEffect(() => {
        const element = audio.audioRef.current;
        if (!element) return;

        const handleEnded = () => {
            onAutoNext();
        };

        element.addEventListener("ended", handleEnded);
        return () => element.removeEventListener("ended", handleEnded);
    }, [onAutoNext, audio.audioRef]);

    const handleScan = async () => {
        try {
            const result: AudioFile[] = await invoke("scan_directory", { basePath: path });
            setFiles(result);
            if (!q.isShuffle) q.setQueue(result);
        } catch (error) {
            console.error("Scan error:", error);
        }
    };

    const toggleShuffle = (currentFiles: AudioFile[]) => {
        const nextShuffle = !q.isShuffle;
        q.setIsShuffle(nextShuffle);

        if (activePath) {
            const current = currentFiles.find(f => f.path === activePath);
            if (current) q.buildQueue(currentFiles, current, nextShuffle);
        }
    };

    const toggleRepeatMode = () => {
        const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
        const currentIndex = modes.indexOf(q.repeatMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        q.setRepeatMode(modes[nextIndex]);
    };

    return {
        path, setPath, files, activePath, handleScan,
        playTrack, onNext, onPrev,
        toggleShuffle, isShuffle: q.isShuffle,
        repeatMode: q.repeatMode, setRepeatMode: q.setRepeatMode,
        toggleRepeatMode,
        ...audio
    };
};