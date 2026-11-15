/**
 * One Web Audio EQ graph per desktop `<audio>` element.
 * `createMediaElementSource` may run only once per element for the page life.
 * Built lazily on first enable so normal playback stays untouched until then.
 */

import { asNativeAudio } from "./nativeAudio";
import {
	dbToGain, EQ_BANDS, type EqualizerState,
} from "./equalizer";

export interface EqualizerGraph {
	ctx: AudioContext;
	preamp: GainNode;
	filters: BiquadFilterNode[];
	apply: (state: EqualizerState) => void;
	resume: () => void;
}

const graphs = new WeakMap<HTMLAudioElement, EqualizerGraph>();

export const hasEqualizerGraph = (element: HTMLAudioElement): boolean =>
	graphs.has(element);

/** Build (or reuse) the EQ chain for a real HTML audio element; null on Android. */
export const ensureEqualizerGraph = (element: HTMLAudioElement): EqualizerGraph | null => {
	if (asNativeAudio(element)) return null;
	const existing = graphs.get(element);
	if (existing) return existing;

	const ctx = new AudioContext();
	// CORS mode must be on before MediaElementSource, or the graph is silent.
	if (element.crossOrigin !== "anonymous") {
		const src = element.src;
		const time = element.currentTime;
		const playing = !element.paused;
		element.crossOrigin = "anonymous";
		if (src) {
			element.src = src;
			element.load();
			const restore = () => {
				if (Number.isFinite(time) && time > 0) {
					element.currentTime = Math.min(time, element.duration || time);
				}
				if (playing) void element.play().catch(() => { /* autoplay */ });
			};
			element.addEventListener("loadedmetadata", restore, { once: true });
		}
	}
	const source = ctx.createMediaElementSource(element);
	const preamp = ctx.createGain();
	preamp.gain.value = 1;

	const filters = EQ_BANDS.map(frequency => {
		const filter = ctx.createBiquadFilter();
		filter.type = "peaking";
		filter.frequency.value = frequency;
		filter.Q.value = 1.2;
		filter.gain.value = 0;
		return filter;
	});

	source.connect(preamp);
	let node: AudioNode = preamp;
	for (const filter of filters) {
		node.connect(filter);
		node = filter;
	}
	node.connect(ctx.destination);

	const apply = (state: EqualizerState) => {
		const preampDb = state.enabled ? state.preamp : 0;
		preamp.gain.setTargetAtTime(dbToGain(preampDb), ctx.currentTime, 0.015);
		filters.forEach((filter, index) => {
			const db = state.enabled ? state.gains[index] : 0;
			filter.gain.setTargetAtTime(db, ctx.currentTime, 0.015);
		});
	};

	const resume = () => {
		if (ctx.state === "suspended") void ctx.resume();
	};

	const graph: EqualizerGraph = { ctx, preamp, filters, apply, resume };
	graphs.set(element, graph);

	element.addEventListener("play", resume);
	resume();
	return graph;
};
