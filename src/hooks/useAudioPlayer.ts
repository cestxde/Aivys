import { useEffect } from "react";
import { useAudioController } from "./useAudioController";
import { useAudioQueue } from "./useAudioQueue";
import type { Track, PlayerSettings } from "../types";
import { nextRepeatMode } from "../constants";

/** Back goes to the start of the track until it has played this long (seconds). */
const RESTART_THRESHOLD = 3;

export const useAudioPlayer = (
    files: Track[],
    settings: PlayerSettings,
    updateSettings: (fields: Partial<PlayerSettings>) => void
) => {
    const audio = useAudioController(
        settings.volume,
        (v) => updateSettings({ volume: v })
    );
    const q = useAudioQueue();
    const isShuffle = settings.isShuffle;
    const repeatMode = settings.repeatMode;
    const activePath = q.current?.path ?? null;

    /**
     * Start `track` within `tracks` (a list click, play all, shuffle all); the
     * queue becomes `tracks`. `shuffle` turns shuffling on or off for it,
     * otherwise the current setting applies.
     */
    const playTrack = (track: Track, tracks: Track[], options: { shuffle?: boolean } = {}) => {
        const shuffle = options.shuffle ?? isShuffle;
        if (shuffle !== isShuffle) updateSettings({ isShuffle: shuffle });
        const index = tracks.indexOf(track);
        const first = q.start(index >= 0 ? tracks : [track, ...tracks], Math.max(0, index), shuffle);
        if (first) audio.playFile(first.path);
    };

    const goTo = (track: Track | null) => {
        if (track) audio.playFile(track.path);
    };

    const onNext = () => goTo(q.move(1, true));

    const onPrev = () => {
        if (audio.element.currentTime > RESTART_THRESHOLD) {
            audio.seek(0);
            return;
        }
        goTo(q.move(-1, true));
    };

    // At the end of a track: repeat it, go on, or (at the end of the queue
    // without repeat) stop on the first track.
    const onEnded = () => {
        if (repeatMode === "one") {
            audio.seek(0);
            audio.element.play().catch(console.error);
            return;
        }
        if (q.isLast && repeatMode === "none") {
            q.rewind();
            if (q.first) audio.loadFilePaused(q.first.path);
            return;
        }
        goTo(q.move(1, true));
    };

    // Re-subscribed every render, so the handler sees the current queue.
    useEffect(() => {
        const element = audio.element;
        element.addEventListener("ended", onEnded);
        return () => element.removeEventListener("ended", onEnded);
    });

    // A rescan (or a deleted file) replaces the track objects: follow it.
    const { refresh } = q;
    useEffect(() => {
        refresh(files);
    }, [files, refresh]);

    const toggleShuffle = () => {
        const shuffle = !isShuffle;
        updateSettings({ isShuffle: shuffle });
        q.setShuffled(shuffle);
    };

    // With nothing playing, both just start the given tracks.
    const playNext = (tracks: Track[]) => {
        if (tracks.length === 0) return;
        if (!activePath) {
            playTrack(tracks[0], tracks);
            return;
        }
        q.insertNext(tracks);
    };

    const addToQueue = (tracks: Track[]) => {
        if (tracks.length === 0) return;
        if (!activePath) {
            playTrack(tracks[0], tracks);
            return;
        }
        q.append(tracks);
    };

    /**
     * Drop tracks (files about to be deleted) from the queue. If the current
     * one goes, its file is let go and the track taking its place is loaded,
     * paused.
     */
    const forgetTracks = (tracks: Track[]) => {
        const paths = new Set(tracks.map(t => t.path));
        if (activePath && paths.has(activePath)) {
            audio.unload();
            const kept = q.order.filter(track => !paths.has(track.path));
            const before = q.order.slice(0, q.index).filter(track => !paths.has(track.path)).length;
            const next = kept[Math.min(before, kept.length - 1)];
            if (next) audio.loadFilePaused(next.path);
        }
        q.remove(paths);
    };

    const toggleRepeatMode = () => {
        updateSettings({ repeatMode: nextRepeatMode(repeatMode) });
    };

    return {
        activePath,
        playTrack, onNext, onPrev,
        playNext, addToQueue, forgetTracks,
        toggleShuffle, isShuffle,
        repeatMode, toggleRepeatMode,
        ...audio
    };
};
