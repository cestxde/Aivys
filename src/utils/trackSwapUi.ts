import { useSyncExternalStore } from "react";
import { TRACK_SWAP_MS_NORMAL } from "./transition";

let swapMs = TRACK_SWAP_MS_NORMAL;
const listeners = new Set<() => void>();

/** Next player-UI track crossfade duration (ms). */
export const setTrackSwapMs = (ms: number) => {
	if (swapMs === ms) return;
	swapMs = ms;
	listeners.forEach(listener => listener());
};

export const getTrackSwapMs = () => swapMs;

/** Subscribe to the duration used by `TrackCrossfade`. */
export const useTrackSwapMs = () =>
	useSyncExternalStore(
		(onChange) => {
			listeners.add(onChange);
			return () => { listeners.delete(onChange); };
		},
		getTrackSwapMs,
		getTrackSwapMs,
	);
