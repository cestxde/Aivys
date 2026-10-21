import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAudioController } from "./useAudioController";
import { useAudioQueue } from "./useAudioQueue";
import type { Track } from "../types";
import { usePlayerSettings } from "./usePlayerSettings";

export const useAudioPlayer = () => {
    const { settings, updateSettings } = usePlayerSettings();
    const [files, setFiles] = useState<Track[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);

    const audio = useAudioController(
        settings.volume,
        (v) => updateSettings({ volume: v })
    );
    const q = useAudioQueue(
        settings.isShuffle,
        (val) => updateSettings({ isShuffle: val }),
        settings.repeatMode,
        (val) => updateSettings({ repeatMode: val })
    );

    // Start a track from a user action (list click, play all, shuffle all).
    // This rebuilds the queue so playback follows the given file list.
    const playTrack = useCallback((
        trackOrPath: Track | string,
        currentFiles: Track[],
        shouldPlay = true
    ) => {
        let track: Track | undefined;

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
            audio.loadFilePaused(track.path);
        }
    }, [q.isShuffle, audio.playFile, audio.loadFilePaused, q.buildQueue]);

    // Move within the existing queue WITHOUT rebuilding it. This keeps a stable
    // shuffle order, so Prev goes back to the actual previous track.
    const goToTrack = useCallback((track: Track) => {
        setActivePath(track.path);
        audio.playFile(track.path);
    }, [audio.playFile]);
    const onNext = useCallback(() => {
        const next = q.getNextTrack(activePath);
        if (next) {
            goToTrack(next);
        }
    }, [activePath, q.getNextTrack, goToTrack]);

    const onAutoNext = useCallback(() => {
        if (q.repeatMode === 'one') {
            audio.seek(0);
            audio.audioRef.current?.play().catch(console.error);
            audio.setIsPlaying(true);
            return;
        }

        if (q.queue.length === 0) return;

        const isLastInQueue = activePath === q.queue[q.queue.length - 1].path;

        if (isLastInQueue && q.repeatMode === 'none') {
            // End of queue: return to the first track, paused at position 0.
            const first = q.queue[0];
            setActivePath(first.path);
            audio.loadFilePaused(first.path);
            return;
        }

        onNext();
    }, [q.repeatMode, q.queue, activePath, onNext, audio.seek, audio.setIsPlaying, audio.loadFilePaused]);

    const onPrev = useCallback(() => {
        if (audio.currentTime > 3) {
            audio.seek(0);
            return;
        }
        const prev = q.getPrevTrack(activePath);
        if (prev) {
            goToTrack(prev);
        }
    }, [audio.currentTime, audio.seek, q.getPrevTrack, activePath, goToTrack]);

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
        if (!settings.lastPath) return;
        try {
            const result: Track[] = await invoke("scan_directory", { basePath: settings.lastPath });
            setFiles(result);
            if (!q.isShuffle) q.setQueue(result);
        } catch (error) {
            console.error("Scan error:", error);
        }
    };

    const toggleShuffle = (currentFiles: Track[]) => {
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
        path: settings.lastPath,
        setPath: (val: string) => updateSettings({ lastPath: val }),
        files, activePath, handleScan,
        playTrack, onNext, onPrev,
        toggleShuffle, isShuffle: q.isShuffle,
        repeatMode: q.repeatMode, setRepeatMode: q.setRepeatMode,
        toggleRepeatMode,
        ...audio
    };
};