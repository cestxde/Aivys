import { useCallback, useEffect, useRef } from "react";
import { markRewritten, trackUrl, useAudioController } from "./useAudioController";
import { useAudioQueue } from "./useAudioQueue";
import type { Track, PlayerSettings } from "../types";
import { nextRepeatMode } from "../constants";
import { loadPosition, loadQueue, savePosition, saveQueue } from "../utils/session";
import { asNativeAudio } from "../utils/nativeAudio";
import { setTrackSwapMs } from "../utils/trackSwapUi";
import { displayArtists, displayTitle } from "../utils/track";
import {
	clampCrossfadeSec, clampDelayMs, equalPowerGains,
	TRACK_SWAP_MS_CROSSFADE, TRACK_SWAP_MS_FAST, TRACK_SWAP_MS_NORMAL,
} from "../utils/transition";

/** Back goes to the start of the track until it has played this long (seconds). */
const RESTART_THRESHOLD = 3;
/** How often the playback position is saved while playing, in milliseconds. */
const POSITION_SAVE_INTERVAL = 5000;

export const useAudioPlayer = (
	files: Track[],
	settings: PlayerSettings,
	updateSettings: (fields: Partial<PlayerSettings>) => void,
) => {
	const audio = useAudioController(
		settings.volume,
		(v) => updateSettings({ volume: v }),
	);
	const q = useAudioQueue();
	const isShuffle = settings.isShuffle;
	const repeatMode = settings.repeatMode;
	const transitionMode = settings.transitionMode;
	const delayMs = clampDelayMs(settings.delayMs);
	const crossfadeSec = clampCrossfadeSec(settings.crossfadeSec);
	const activePath = q.current?.path ?? null;

	const transitioning = useRef(false);
	const transitionGen = useRef(0);
	const delayTimer = useRef<number | null>(null);
	const fadeRaf = useRef<number | null>(null);
	const crossfadeStarted = useRef(false);
	const crossfadeUiFlipped = useRef(false);

	const clearTransitionTimers = useCallback(() => {
		if (delayTimer.current !== null) {
			window.clearTimeout(delayTimer.current);
			delayTimer.current = null;
		}
		if (fadeRaf.current !== null) {
			window.cancelAnimationFrame(fadeRaf.current);
			fadeRaf.current = null;
		}
		crossfadeStarted.current = false;
		crossfadeUiFlipped.current = false;
		transitioning.current = false;
		transitionGen.current += 1;
	}, []);

	const abortTransition = useCallback(() => {
		clearTransitionTimers();
		if (audio.dual) {
			audio.setSlotGain(audio.slot, 1);
			audio.setSlotGain(audio.idleSlot, 0);
			const idle = audio.elements[audio.idleSlot];
			if (!idle.paused) idle.pause();
		}
	}, [audio, clearTransitionTimers]);

	const playTrack = (track: Track, tracks: Track[], options: { shuffle?: boolean } = {}) => {
		abortTransition();
		setTrackSwapMs(TRACK_SWAP_MS_FAST);
		const shuffle = options.shuffle ?? isShuffle;
		if (shuffle !== isShuffle) updateSettings({ isShuffle: shuffle });
		const index = tracks.indexOf(track);
		const first = q.start(index >= 0 ? tracks : [track, ...tracks], Math.max(0, index), shuffle);
		if (first) audio.playFile(first.path);
	};

	const goTo = (track: Track | null) => {
		if (!track) return;
		abortTransition();
		setTrackSwapMs(TRACK_SWAP_MS_FAST);
		audio.playFile(track.path);
	};

	const onNext = () => goTo(q.move(1, true));

	const onPrev = () => {
		if (audio.element.currentTime > RESTART_THRESHOLD) {
			audio.seek(0);
			return;
		}
		goTo(q.move(-1, true));
	};

	const stopAfterTrack = useRef<(() => void) | null>(null);
	const setStopAfterTrack = useCallback((done: (() => void) | null) => {
		stopAfterTrack.current = done;
		asNativeAudio(audio.element)?.setStopAfterTrack(done !== null);
	}, [audio.element]);

	const previousTrack = () => goTo(q.move(-1, true));

	/** Next track for auto-advance, respecting repeat / end-of-queue. */
	const nextAutoTrack = (): { track: Track; play: boolean } | null => {
		if (repeatMode === "one") return null;
		if (q.isLast && repeatMode === "none") {
			return q.first ? { track: q.first, play: false } : null;
		}
		const wrap = repeatMode === "all" || !q.isLast;
		const track = q.peek(1, wrap);
		return track ? { track, play: true } : null;
	};

	const finishAdvance = (track: Track, play: boolean) => {
		setTrackSwapMs(TRACK_SWAP_MS_NORMAL);
		if (q.isLast && repeatMode === "none" && track === q.first) {
			q.rewind();
		} else {
			q.move(1, true);
		}
		if (play && audio.dual && audio.preloadReady(track.path) && audio.promotePreload(true)) {
			return;
		}
		if (play) audio.playFile(track.path);
		else audio.loadFilePaused(track.path);
	};

	const startGaplessAdvance = (track: Track, play: boolean) => {
		if (!play) {
			finishAdvance(track, false);
			return;
		}
		if (!audio.dual) {
			goTo(q.move(1, true));
			return;
		}
		transitioning.current = true;
		const gen = transitionGen.current;
		const run = () => {
			if (gen !== transitionGen.current) return;
			finishAdvance(track, true);
			transitioning.current = false;
			delayTimer.current = null;
		};
		const arm = () => {
			if (gen !== transitionGen.current) return;
			if (delayMs <= 0) {
				run();
				return;
			}
			delayTimer.current = window.setTimeout(run, delayMs);
		};
		if (audio.preloadReady(track.path)) {
			arm();
			return;
		}
		// Wait for the preloaded element — promoting an empty buffer stops audio
		// and leaves the seek bar with duration 0.
		void audio.whenPreloadReady(track.path).then(arm).catch(() => {
			if (gen !== transitionGen.current) return;
			transitioning.current = false;
			setTrackSwapMs(TRACK_SWAP_MS_NORMAL);
			q.move(1, true);
			audio.playFile(track.path);
		});
	};

	const startCrossfade = (track: Track) => {
		if (!audio.dual) {
			setTrackSwapMs(TRACK_SWAP_MS_FAST);
			goTo(q.move(1, true));
			return;
		}
		const begin = () => {
			if (audio.preloadPath() !== track.path) audio.preload(track.path);
			if (!audio.startPreloadSilent()) {
				setTrackSwapMs(TRACK_SWAP_MS_FAST);
				goTo(q.move(1, true));
				return;
			}
			transitioning.current = true;
			crossfadeStarted.current = true;
			crossfadeUiFlipped.current = false;
			const duration = audio.element.duration;
			const remaining = Number.isFinite(duration)
				? Math.max(0.05, duration - audio.element.currentTime)
				: crossfadeSec;
			const fadeFor = Math.min(crossfadeSec, remaining) * 1000;
			const fromSlot = audio.slot;
			const toSlot = audio.idleSlot;
			const started = performance.now();

			const tick = () => {
				const t = Math.min(1, (performance.now() - started) / fadeFor);
				const { out, inn } = equalPowerGains(t);
				audio.setSlotGain(fromSlot, out);
				audio.setSlotGain(toSlot, inn);
				// At equal power (~50% each), hand the UI / seek bar to the next track.
				if (!crossfadeUiFlipped.current && t >= 0.5) {
					crossfadeUiFlipped.current = true;
					setTrackSwapMs(TRACK_SWAP_MS_CROSSFADE);
					q.move(1, true);
					audio.revealIncoming();
				}
				if (t >= 1) {
					fadeRaf.current = null;
					crossfadeStarted.current = false;
					if (!crossfadeUiFlipped.current) {
						setTrackSwapMs(TRACK_SWAP_MS_CROSSFADE);
						q.move(1, true);
						audio.promotePreload(true);
					} else {
						audio.finishOutgoing(fromSlot);
					}
					crossfadeUiFlipped.current = false;
					transitioning.current = false;
					return;
				}
				fadeRaf.current = window.requestAnimationFrame(tick);
			};
			fadeRaf.current = window.requestAnimationFrame(tick);
		};

		const gen = transitionGen.current;
		if (audio.preloadReady(track.path)) {
			begin();
			return;
		}
		transitioning.current = true;
		void audio.whenPreloadReady(track.path).then(() => {
			if (gen !== transitionGen.current) return;
			begin();
		}).catch(() => {
			if (gen !== transitionGen.current) return;
			transitioning.current = false;
			setTrackSwapMs(TRACK_SWAP_MS_FAST);
			goTo(q.move(1, true));
		});
	};

	const onEnded = () => {
		if (transitioning.current && crossfadeStarted.current) return;

		const stop = stopAfterTrack.current;
		if (stop) {
			abortTransition();
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

		// Android: native owns auto-advance and emits `advanced`.
		if (asNativeAudio(audio.element)) return;

		const next = nextAutoTrack();
		if (!next) return;

		if (!next.play) {
			q.rewind();
			audio.loadFilePaused(next.track.path);
			return;
		}

		if (audio.dual && transitionMode === "gapless") {
			if (audio.preloadPath() !== next.track.path) audio.preload(next.track.path);
			startGaplessAdvance(next.track, true);
			return;
		}
		if (audio.dual && transitionMode === "crossfade" && crossfadeStarted.current) {
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

	// Preload next + start crossfade near the end (desktop).
	useEffect(() => {
		if (!audio.dual) return;
		const element = audio.element;
		const onTime = () => {
			if (transitioning.current || stopAfterTrack.current || repeatMode === "one") return;
			const next = nextAutoTrack();
			if (!next?.play) {
				audio.clearPreload();
				return;
			}
			if (audio.preloadPath() !== next.track.path) audio.preload(next.track.path);

			if (transitionMode !== "crossfade" || crossfadeStarted.current) return;
			const duration = element.duration;
			if (!Number.isFinite(duration) || duration <= 0) return;
			const fadeFor = Math.min(crossfadeSec, Math.max(0.05, duration * 0.45));
			if (element.currentTime >= duration - fadeFor) {
				startCrossfade(next.track);
			}
		};
		element.addEventListener("timeupdate", onTime);
		return () => element.removeEventListener("timeupdate", onTime);
	});

	// Keep preload in sync when queue / settings change.
	useEffect(() => {
		if (!audio.dual || transitioning.current) return;
		const next = nextAutoTrack();
		if (next?.play) audio.preload(next.track.path);
		else audio.clearPreload();
	}, [q.order, q.index, repeatMode, transitionMode, delayMs, crossfadeSec, activePath]);

	const { refresh } = q;
	useEffect(() => {
		refresh(files);
	}, [files, refresh]);

	const resumed = useRef(false);

	const resume = (tracks: Track[]) => {
		resumed.current = true;
		const saved = loadQueue(tracks);
		if (!saved) return;
		const playing = asNativeAudio(audio.element)?.before ?? null;
		let index = saved.index;
		if (playing) {
			const at = saved.order[playing.queueIndex]?.path === playing.path
				? playing.queueIndex
				: saved.order.findIndex(track => track.path === playing.path);
			if (at >= 0) index = at;
		}
		q.restore({ ...saved, index });
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
	useEffect(() => {
		native?.setTransition({
			mode: transitionMode,
			delayMs,
			crossfadeSec,
		});
	}, [native, transitionMode, delayMs, crossfadeSec]);

	// Native advanced to the next track on its own (gapless / crossfade / delay).
	useEffect(() => {
		if (!native) return;
		const onAdvanced = (e: Event) => {
			const detail = (e as CustomEvent<{
				path: string; queueIndex: number; ui?: string;
			}>).detail;
			if (!detail) return;
			setTrackSwapMs(detail.ui === "crossfade" ? TRACK_SWAP_MS_CROSSFADE : TRACK_SWAP_MS_NORMAL);
			if (typeof detail.queueIndex === "number" && detail.queueIndex >= 0) {
				q.jumpTo(detail.queueIndex);
			} else if (detail.path) {
				const at = q.order.findIndex(track => track.path === detail.path);
				if (at >= 0) q.jumpTo(at);
			}
		};
		native.addEventListener("advanced", onAdvanced);
		return () => native.removeEventListener("advanced", onAdvanced);
	});

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

	const forgetTracks = (tracks: Track[]) => {
		const paths = new Set(tracks.map(t => t.path));
		if (activePath && paths.has(activePath)) {
			abortTransition();
			audio.unload();
			const kept = q.order.filter(track => !paths.has(track.path));
			const before = q.order.slice(0, q.index).filter(track => !paths.has(track.path)).length;
			const next = kept[Math.min(before, kept.length - 1)];
			if (next) audio.loadFilePaused(next.path);
		}
		q.remove(paths);
	};

	const playAt = (index: number) => goTo(q.jumpTo(index));

	const setUpcoming = (tracks: Track[]) => q.setUpcoming(tracks, !isShuffle);

	const releaseWhile = async <T,>(
		paths: string[],
		work: () => Promise<T>,
		resumeAs?: (result: T) => string | undefined,
	): Promise<T> => {
		const element = audio.element;
		const path = paths.find(p => element.src === trackUrl(p));
		if (!path) {
			try {
				return await work();
			} finally {
				markRewritten(paths);
			}
		}
		abortTransition();
		const time = element.currentTime;
		const playing = !element.paused;
		const volume = settings.volume;
		audio.unload();
		let resume = path;
		try {
			const result = await work();
			resume = resumeAs?.(result) ?? path;
			return result;
		} finally {
			markRewritten(resume === path ? paths : [...paths, resume]);
			audio.loadFilePaused(resume, time);
			updateSettings({ volume });
			if (playing) audio.element.play().catch(console.error);
		}
	};

	const toggleRepeatMode = () => {
		updateSettings({ repeatMode: nextRepeatMode(repeatMode) });
	};

	const togglePlay = () => {
		if (transitioning.current) abortTransition();
		audio.togglePlay();
	};

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
		isPlaying: audio.isPlaying,
		volume: audio.volume,
		setVolume: audio.setVolume,
		seek: audio.seek,
		stop: () => { abortTransition(); audio.stop(); },
		togglePlay,
		element: audio.element,
		elements: audio.elements,
	};
};
