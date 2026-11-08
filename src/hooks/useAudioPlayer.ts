import { useCallback, useEffect, useRef } from "react";
import { markRewritten, trackUrl, useAudioController } from "./useAudioController";
import { useAudioQueue } from "./useAudioQueue";
import type { Track, PlayerSettings } from "../types";
import { nextRepeatMode } from "../constants";
import { loadPosition, loadQueue, savePosition, saveQueue } from "../utils/session";
import { asNativeAudio } from "../utils/nativeAudio";
import { displayArtists, displayTitle } from "../utils/track";

/** Back goes to the start of the track until it has played this long (seconds). */
const RESTART_THRESHOLD = 3;
/** How often the playback position is saved while playing, in milliseconds. */
const POSITION_SAVE_INTERVAL = 5000;

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

    // The sleep timer's "end of the track": then the next track is loaded,
    // paused, instead of played; this is called.
    const stopAfterTrack = useRef<(() => void) | null>(null);
    const setStopAfterTrack = useCallback((done: (() => void) | null) => {
        stopAfterTrack.current = done;
        // Android: the app's player stops there too, with the page gone.
        asNativeAudio(audio.element)?.setStopAfterTrack(done !== null);
    }, [audio.element]);

    /** The previous track, however far into this one (a swipe on the phone's player). */
    const previousTrack = () => goTo(q.move(-1, true));

    // At the end of a track: repeat it, go on, or (at the end of the queue
    // without repeat) stop on the first track.
    const onEnded = () => {
        const stop = stopAfterTrack.current;
        if (stop) {
            stopAfterTrack.current = null;
            const next = q.move(1, true);
            if (next) audio.loadFilePaused(next.path);
            stop();
            return;
        }
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

    // The session is saved once the last one was taken over (or there was
    // none to take): saving earlier would overwrite it with an empty queue.
    const resumed = useRef(false);

    /** Take over the last session's queue, its track loaded paused where it stopped. */
    const resume = (tracks: Track[]) => {
        resumed.current = true;
        const saved = loadQueue(tracks);
        if (!saved) return;
        // On Android the app's player may have gone on through the queue while
        // the page was gone (the app swiped away): the queue goes on from there.
        const playing = asNativeAudio(audio.element)?.before ?? null;
        let index = saved.index;
        if (playing) {
            const at = saved.order[playing.queueIndex]?.path === playing.path
                ? playing.queueIndex
                : saved.order.findIndex(track => track.path === playing.path);
            if (at >= 0) index = at;
        }
        q.restore({ ...saved, index });
        // The modes may have been changed with the buttons of the system's controls meanwhile.
        if (playing) {
            if (playing.repeat !== repeatMode) updateSettings({ repeatMode: playing.repeat });
            if (playing.shuffle !== isShuffle) toggleShuffle();
        }
        const track = saved.order[index];
        if (track) audio.loadFilePaused(track.path, loadPosition(track.path));
    };

    const { source, order, index } = q;
    useEffect(() => {
        if (resumed.current) saveQueue({ source, order, index });
    }, [source, order, index]);

    // Android: the app's player is told the queue too, to go on through it with
    // the page gone (the app swiped away). Not before the last session's queue
    // is taken over: the player may be going on through it already.
    const native = asNativeAudio(audio.element);
    useEffect(() => {
        if (!native || !resumed.current) return;
        native.setQueue(order.map(track => ({
            path: track.path,
            title: displayTitle(track),
            artist: displayArtists(track),
            album: track.album,
            cover: track.coverPath,
        })));
    }, [native, order]);
    useEffect(() => {
        if (native && resumed.current) native.setQueueIndex(index);
    }, [native, order, index]);
    useEffect(() => {
        native?.setRepeat(repeatMode);
    }, [native, repeatMode]);
    useEffect(() => {
        native?.setShuffle(isShuffle);
    }, [native, isShuffle]);

    // The position: every few seconds while playing, and on pause, seek and close.
    const { element } = audio;
    useEffect(() => {
        if (!activePath) return;
        let savedAt = 0;
        const save = () => {
            if (!resumed.current) return;
            savedAt = Date.now();
            savePosition(activePath, element.currentTime);
        };
        const tick = () => {
            if (Date.now() - savedAt >= POSITION_SAVE_INTERVAL) save();
        };
        element.addEventListener("timeupdate", tick);
        element.addEventListener("pause", save);
        element.addEventListener("seeked", save);
        window.addEventListener("pagehide", save);
        window.addEventListener("beforeunload", save);
        return () => {
            element.removeEventListener("timeupdate", tick);
            element.removeEventListener("pause", save);
            element.removeEventListener("seeked", save);
            window.removeEventListener("pagehide", save);
            window.removeEventListener("beforeunload", save);
        };
    }, [element, activePath]);

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

    /** Play the queue's track at position `index` (from the queue panel). */
    const playAt = (index: number) => goTo(q.jumpTo(index));

    /** What comes after the current track, reordered, trimmed or emptied. */
    const setUpcoming = (tracks: Track[]) => q.setUpcoming(tracks, !isShuffle);

    /**
     * Run `work`, which rewrites some of the files at `paths`: if one of them
     * is loaded, it is let go meanwhile (Windows may refuse to replace an open
     * file) and loaded again where it was, playing if it was. The files are
     * loaded from new URLs afterwards, past what the webview cached of them.
     * `resumeAs` may point the reload at a new path (a rename); omit or return
     * undefined to keep the original.
     */
    const releaseWhile = async <T,>(
        paths: string[],
        work: () => Promise<T>,
        resumeAs?: (result: T) => string | undefined,
    ): Promise<T> => {
        const element = audio.element;
        // By the element, not the render: this may run from an older closure (a notice's button).
        const path = paths.find(p => element.src === trackUrl(p));
        if (!path) {
            try {
                return await work();
            } finally {
                markRewritten(paths);
            }
        }
        const time = element.currentTime;
        const playing = !element.paused;
        const volume = element.volume;
        audio.unload();
        let resume = path;
        try {
            const result = await work();
            resume = resumeAs?.(result) ?? path;
            return result;
        } finally {
            markRewritten(resume === path ? paths : [...paths, resume]);
            audio.loadFilePaused(resume, time);
            element.volume = volume;
            if (playing) element.play().catch(console.error);
        }
    };

    const toggleRepeatMode = () => {
        updateSettings({ repeatMode: nextRepeatMode(repeatMode) });
    };

    // Android: the shuffle and repeat buttons of the system's controls. Re-subscribed
    // every render, so the handlers see the current modes.
    useEffect(() => {
        if (!native) return;
        native.addEventListener("shufflebutton", toggleShuffle);
        native.addEventListener("repeatbutton", toggleRepeatMode);
        return () => {
            native.removeEventListener("shufflebutton", toggleShuffle);
            native.removeEventListener("repeatbutton", toggleRepeatMode);
        };
    });

    return {
        activePath,
        playTrack, onNext, onPrev, previousTrack, resume, setStopAfterTrack,
        playNext, addToQueue, forgetTracks,
        queue: { order: q.order, index: q.index },
        playAt, removeFromQueue: q.removeAt, setUpcoming, replacePath: q.replacePath, releaseWhile,
        toggleShuffle, isShuffle,
        repeatMode, toggleRepeatMode,
        ...audio
    };
};
