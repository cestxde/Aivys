import { useCallback, useEffect, useMemo, useState } from "react";
import {
	applyPreset,
	DEFAULT_EQ,
	EQ_GAIN_MAX,
	EQ_GAIN_MIN,
	isEqualizerState,
	normalizeEqualizerState,
	type EqGains,
	type EqualizerState,
} from "../utils/equalizer";
import { ensureEqualizerGraph, hasEqualizerGraph } from "../utils/equalizerGraph";
import { asNativeAudio } from "../utils/nativeAudio";
import { useStoredState } from "./useRemembered";

const clamp = (value: number) => Math.min(EQ_GAIN_MAX, Math.max(EQ_GAIN_MIN, value));

/**
 * Desktop equalizer state + Web Audio graph. No-op on Android (native player).
 * The audio graph is created only when EQ is first turned on, so playback
 * works normally until then.
 */
export const useEqualizer = (element: HTMLAudioElement) => {
	const supported = useMemo(() => !asNativeAudio(element), [element]);
	const [state, setStored] = useStoredState("eq", DEFAULT_EQ, isEqualizerState);
	const [open, setOpen] = useState(false);

	const commit = useCallback((next: EqualizerState) => {
		setStored(normalizeEqualizerState(next));
	}, [setStored]);

	useEffect(() => {
		if (!supported) return;
		const normalized = normalizeEqualizerState(state);
		// Do not hijack the element until the user actually enables EQ.
		if (!normalized.enabled && !hasEqualizerGraph(element)) return;
		const graph = ensureEqualizerGraph(element);
		if (!graph) return;
		graph.apply(normalized);
		graph.resume();
	}, [supported, element, state]);

	const setEnabled = useCallback((enabled: boolean) => {
		commit({ ...state, enabled });
	}, [commit, state]);

	const setPreamp = useCallback((preamp: number) => {
		commit({ ...state, enabled: true, preamp: clamp(preamp), presetId: "custom" });
	}, [commit, state]);

	const setBand = useCallback((index: number, gain: number) => {
		if (index < 0 || index >= state.gains.length) return;
		const gains = [...state.gains] as EqGains;
		gains[index] = clamp(gain);
		commit({ ...state, enabled: true, gains, presetId: "custom" });
	}, [commit, state]);

	const setPreset = useCallback((presetId: string) => {
		const next = applyPreset(presetId);
		if (!next) return;
		commit(next);
	}, [commit]);

	return {
		supported,
		open,
		setOpen,
		state,
		setEnabled,
		setPreamp,
		setBand,
		setPreset,
	};
};

export type EqualizerApi = ReturnType<typeof useEqualizer>;
