import { useCallback, useState, useRef, useEffect, useSyncExternalStore } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { notifyError } from "../utils/notify";
import { asNativeAudio, createPlayer } from "../utils/nativeAudio";
import { getEqualizerGraph } from "../utils/equalizerGraph";
import { toElementVolume } from "../utils/volume";
import { t } from "../i18n";

// An AbortError only means a newer load interrupted play(): not worth a notice.
const reportPlaybackError = (e: unknown) => {
	if (e instanceof DOMException && e.name === "AbortError") return;
	notifyError(t("error.playback"), e);
};

// Files rewritten this session (tag edits), by how many times. The webview
// caches what it read of a URL, and a rewritten file has its audio at other
// offsets: played from the old URL, it stalls partway and cannot seek.
const revisions = new Map<string, number>();

/** The URL the audio element loads `filePath` from: a new one after each rewrite. */
export const trackUrl = (filePath: string) => {
	const revision = revisions.get(filePath);
	const url = convertFileSrc(filePath);
	return revision ? `${url}?v=${revision}` : url;
};

/** The files at `paths` were rewritten: load them from new URLs from now on. */
export const markRewritten = (paths: string[]) => {
	for (const path of paths) revisions.set(path, (revisions.get(path) ?? 0) + 1);
};

/**
 * Position and length of what `element` plays, for the seek bar. Kept out of
 * the controller so only components showing the time re-render as it runs.
 */
export const usePlaybackTime = (element: HTMLAudioElement) => {
	const subscribe = useCallback((onChange: () => void) => {
		const events = ["timeupdate", "durationchange", "loadedmetadata", "seeked", "emptied"];
		events.forEach(event => element.addEventListener(event, onChange));
		const wake = () => onChange();
		document.addEventListener("visibilitychange", wake);
		window.addEventListener("focus", wake);
		return () => {
			events.forEach(event => element.removeEventListener(event, onChange));
			document.removeEventListener("visibilitychange", wake);
			window.removeEventListener("focus", wake);
		};
	}, [element]);
	const currentTime = useSyncExternalStore(subscribe, () => element.currentTime);
	const duration = useSyncExternalStore(subscribe, () => (Number.isFinite(element.duration) ? element.duration : 0));
	return { currentTime, duration };
};

const pathFromSrc = (src: string): string | null => {
	if (!src) return null;
	try {
		return decodeURIComponent(new URL(src).pathname.slice(1));
	} catch {
		return null;
	}
};

/**
 * Transport: one NativeAudio on Android, or two HTMLAudioElements on desktop
 * (current + preloaded next for gapless / crossfade).
 */
export const useAudioController = (
	initialVolume: number,
	onVolumeChange: (v: number) => void,
) => {
	const [isPlaying, setIsPlaying] = useState(false);
	const [slot, setSlot] = useState<0 | 1>(0);
	const volumeRef = useRef(initialVolume);

	const [pair] = useState((): [HTMLAudioElement, HTMLAudioElement] => {
		const primary = createPlayer();
		if (asNativeAudio(primary)) return [primary, primary];
		return [primary, createPlayer()];
	});
	const dual = pair[0] !== pair[1];
	const element = pair[slot];
	const idleSlot: 0 | 1 = slot === 0 ? 1 : 0;
	const pathsRef = useRef<[string | null, string | null]>([null, null]);
	const preloadPathRef = useRef<string | null>(null);

	useEffect(() => {
		volumeRef.current = initialVolume;
		applyVolume(pair, slot, initialVolume);
	}, [initialVolume, pair, slot]);

	useEffect(() => {
		const onPlay = () => setIsPlaying(true);
		const onPause = () => {
			if (dual && !pair[0].paused) return;
			if (dual && !pair[1].paused) return;
			setIsPlaying(false);
		};
		for (const el of dual ? pair : [pair[0]]) {
			el.addEventListener("play", onPlay);
			el.addEventListener("pause", onPause);
		}
		return () => {
			for (const el of dual ? pair : [pair[0]]) {
				el.removeEventListener("play", onPlay);
				el.removeEventListener("pause", onPause);
			}
		};
	}, [pair, dual]);

	const loadInto = (target: 0 | 1, filePath: string, startAt = 0) => {
		const audio = pair[target];
		const assetUrl = trackUrl(filePath);
		audio.pause();
		audio.src = assetUrl;
		audio.load();
		pathsRef.current[target] = filePath;
		applyElementVolume(audio, target, volumeRef.current, target === slot ? 1 : 0);
		audio.currentTime = 0;
		if (startAt > 0) {
			audio.addEventListener("loadedmetadata", () => {
				if (audio.src === assetUrl) {
					audio.currentTime = Math.min(startAt, audio.duration || startAt);
				}
			}, { once: true });
		}
		return audio;
	};

	const clearSlot = (target: 0 | 1) => {
		const audio = pair[target];
		audio.pause();
		audio.removeAttribute("src");
		audio.load();
		pathsRef.current[target] = null;
		if (preloadPathRef.current && target === idleSlot) preloadPathRef.current = null;
	};

	/** Replace the current source and play. */
	const playFile = (filePath: string) => {
		abortIdle();
		const audio = loadInto(slot, filePath);
		setIsPlaying(true);
		setSlotGain(slot, 1);
		if (dual) setSlotGain(idleSlot, 0);
		audio.play().catch(reportPlaybackError);
	};

	/** Load current without starting playback. */
	const loadFilePaused = (filePath: string, startAt = 0) => {
		abortIdle();
		loadInto(slot, filePath, startAt);
		setSlotGain(slot, 1);
		if (dual) setSlotGain(idleSlot, 0);
		setIsPlaying(false);
	};

	/** Preload `filePath` into the idle desktop slot (no-op on Android). */
	const preload = (filePath: string) => {
		if (!dual) return;
		if (preloadPathRef.current === filePath && pathsRef.current[idleSlot] === filePath) return;
		loadInto(idleSlot, filePath);
		preloadPathRef.current = filePath;
		setSlotGain(idleSlot, 0);
		pair[idleSlot].pause();
	};

	const clearPreload = () => {
		if (!dual) return;
		preloadPathRef.current = null;
		clearSlot(idleSlot);
		setSlotGain(idleSlot, 0);
	};

	const abortIdle = () => {
		if (!dual) return;
		pair[idleSlot].pause();
		if (preloadPathRef.current) {
			// Keep preload buffer unless clearing explicitly.
		}
	};

	const clearSlotQuiet = (target: 0 | 1) => {
		if (!dual || !pathsRef.current[target]) return;
		const el = pair[target];
		el.pause();
		el.removeAttribute("src");
		el.load();
		pathsRef.current[target] = null;
	};

	/** True when the idle slot has `path` buffered enough to start. */
	const preloadReady = (path: string): boolean => {
		if (!dual || preloadPathRef.current !== path) return false;
		if (pathsRef.current[idleSlot] !== path) return false;
		return pair[idleSlot].readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
	};

	/**
	 * Wait until the idle preload for `path` can play, or reject on error/timeout.
	 */
	const whenPreloadReady = (path: string, timeoutMs = 8_000): Promise<void> => {
		if (preloadReady(path)) return Promise.resolve();
		if (!dual) return Promise.reject(new Error("no dual"));
		if (preloadPathRef.current !== path) {
			preload(path);
		}
		const el = pair[idleSlot];
		return new Promise((resolve, reject) => {
			let done = false;
			const finish = (ok: boolean) => {
				if (done) return;
				done = true;
				window.clearTimeout(timer);
				el.removeEventListener("canplay", onReady);
				el.removeEventListener("loadeddata", onReady);
				el.removeEventListener("error", onErr);
				ok ? resolve() : reject(new Error("preload failed"));
			};
			const onReady = () => finish(true);
			const onErr = () => finish(false);
			const timer = window.setTimeout(() => finish(preloadReady(path)), timeoutMs);
			el.addEventListener("canplay", onReady);
			el.addEventListener("loadeddata", onReady);
			el.addEventListener("error", onErr);
			// Already moving — check again in case we raced the listeners.
			if (preloadReady(path)) finish(true);
		});
	};

	/**
	 * Promote the preloaded idle slot to current and optionally play.
	 * Returns false if nothing was preloaded.
	 */
	const promotePreload = (play: boolean): boolean => {
		if (!dual || !preloadPathRef.current) return false;
		const next = idleSlot;
		const prev = slot;
		const incoming = pair[next];
		setSlotGain(next, 1);
		setSlotGain(prev, 0);
		preloadPathRef.current = null;
		setSlot(next);
		if (play) {
			// Start the next element before pausing the previous so the shared
			// pause handler never sees both slots idle (which flips isPlaying off).
			setIsPlaying(true);
			const start = incoming.play();
			pair[prev].pause();
			start.catch(reportPlaybackError);
		} else {
			pair[prev].pause();
			setIsPlaying(false);
		}
		queueMicrotask(() => clearSlotQuiet(prev));
		return true;
	};

	/**
	 * Mid crossfade: make the incoming slot the UI "current" without stopping
	 * the outgoing one (both keep playing while gains finish ramping).
	 */
	const revealIncoming = (): boolean => {
		if (!dual || !preloadPathRef.current) return false;
		const incoming = idleSlot;
		setSlot(incoming);
		preloadPathRef.current = null;
		setIsPlaying(true);
		return true;
	};

	/** After a revealed crossfade: silence and free the outgoing slot. */
	const finishOutgoing = (outgoing: 0 | 1) => {
		if (!dual) return;
		const keep: 0 | 1 = outgoing === 0 ? 1 : 0;
		pair[outgoing].pause();
		setSlotGain(outgoing, 0);
		setSlotGain(keep, 1);
		// Keep UI on the incoming slot if a reveal already swapped it.
		if (slot === outgoing) setSlot(keep);
		clearSlotQuiet(outgoing);
	};

	/** Start the preloaded track at volume 0 (crossfade in). */
	const startPreloadSilent = (): boolean => {
		if (!dual || !preloadPathRef.current) return false;
		const incoming = pair[idleSlot];
		if (incoming.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
		setSlotGain(idleSlot, 0);
		try {
			incoming.currentTime = 0;
		} catch { /* not seekable yet */ }
		incoming.play().catch(reportPlaybackError);
		setIsPlaying(true);
		return true;
	};

	const setSlotGain = (target: 0 | 1, value: number) => {
		const graph = getEqualizerGraph();
		if (graph && dual) {
			graph.setSlotGain(target, value);
			pair[target].volume = 1;
			return;
		}
		pair[target].volume = toElementVolume(volumeRef.current) * value;
	};

	const togglePlay = () => {
		if (isPlaying) {
			pair[0].pause();
			if (dual) pair[1].pause();
			setIsPlaying(false);
		} else {
			element.play().catch(reportPlaybackError);
			setIsPlaying(true);
		}
	};

	const seek = (time: number) => {
		element.currentTime = time;
	};

	const stop = () => {
		pair[0].pause();
		pair[0].currentTime = 0;
		if (dual) {
			pair[1].pause();
			pair[1].currentTime = 0;
		}
		setIsPlaying(false);
	};

	const unload = () => {
		stop();
		clearSlot(0);
		if (dual) clearSlot(1);
		preloadPathRef.current = null;
	};

	const audioRef = useRef<HTMLAudioElement | null>(element);
	audioRef.current = element;

	return {
		isPlaying, setIsPlaying,
		volume: initialVolume,
		setVolume: onVolumeChange,
		audioRef, element,
		/** Desktop pair; on Android both entries are the same NativeAudio. */
		elements: pair,
		slot,
		idleSlot,
		dual,
		preloadPath: () => preloadPathRef.current,
		pathInSlot: (s: 0 | 1) => pathsRef.current[s],
		playFile, loadFilePaused, preload, clearPreload, promotePreload,
		preloadReady, whenPreloadReady,
		revealIncoming, finishOutgoing, startPreloadSilent,
		setSlotGain,
		togglePlay, seek, stop, unload,
	};
};

const applyVolume = (
	pair: [HTMLAudioElement, HTMLAudioElement],
	slot: 0 | 1,
	linear: number,
) => {
	const graph = getEqualizerGraph();
	const mapped = toElementVolume(linear);
	if (graph && pair[0] !== pair[1]) {
		graph.setMasterVolume(mapped);
		pair[0].volume = 1;
		pair[1].volume = 1;
		return;
	}
	pair[slot].volume = mapped;
};

const applyElementVolume = (
	audio: HTMLAudioElement,
	target: 0 | 1,
	linear: number,
	slotGain: number,
) => {
	const graph = getEqualizerGraph();
	if (graph && !asNativeAudio(audio)) {
		audio.volume = 1;
		graph.setMasterVolume(toElementVolume(linear));
		graph.setSlotGain(target, slotGain);
		return;
	}
	audio.volume = toElementVolume(linear) * slotGain;
};

/** Whether `element.src` currently points at one of `paths`. */
export const srcMatchesPath = (element: HTMLAudioElement, paths: string[]): string | undefined =>
	paths.find(p => element.src === trackUrl(p) || pathFromSrc(element.src)?.endsWith(p.replace(/\\/g, "/")));
