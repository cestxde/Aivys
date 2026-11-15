/**
 * Desktop Web Audio EQ as a dual-slot mixer.
 * Two `<audio>` elements → slot gains → master volume → preamp → EQ → destination.
 * `createMediaElementSource` may run only once per element for the page life.
 * Built lazily on first enable so normal playback stays untouched until then.
 */

import { asNativeAudio } from "./nativeAudio";
import {
	dbToGain, EQ_BANDS, type EqualizerState,
} from "./equalizer";

export interface EqualizerGraph {
	ctx: AudioContext;
	/** Per-slot gains for crossfade (0–1). */
	slotGains: [GainNode, GainNode];
	/** User volume after the mix. */
	master: GainNode;
	preamp: GainNode;
	filters: BiquadFilterNode[];
	apply: (state: EqualizerState) => void;
	resume: () => void;
	setSlotGain: (slot: 0 | 1, value: number) => void;
	setMasterVolume: (elementVolume: number) => void;
}

let mixer: EqualizerGraph | null = null;
const attached = new WeakSet<HTMLAudioElement>();

export const hasEqualizerGraph = (): boolean => mixer !== null;

/** Build (or reuse) the dual-slot EQ mixer; null on Android / missing pair. */
export const ensureEqualizerGraph = (
	elements: [HTMLAudioElement, HTMLAudioElement],
): EqualizerGraph | null => {
	if (asNativeAudio(elements[0]) || asNativeAudio(elements[1])) return null;
	if (mixer) {
		attachElement(mixer, elements[0], 0);
		attachElement(mixer, elements[1], 1);
		return mixer;
	}

	const ctx = new AudioContext();
	const slotGains: [GainNode, GainNode] = [ctx.createGain(), ctx.createGain()];
	slotGains[0].gain.value = 1;
	slotGains[1].gain.value = 0;

	const master = ctx.createGain();
	master.gain.value = 1;

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

	slotGains[0].connect(master);
	slotGains[1].connect(master);
	master.connect(preamp);
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

	const setSlotGain = (slot: 0 | 1, value: number) => {
		const v = Math.min(1, Math.max(0, value));
		slotGains[slot].gain.setTargetAtTime(v, ctx.currentTime, 0.01);
	};

	const setMasterVolume = (elementVolume: number) => {
		master.gain.setTargetAtTime(Math.min(1, Math.max(0, elementVolume)), ctx.currentTime, 0.01);
	};

	mixer = { ctx, slotGains, master, preamp, filters, apply, resume, setSlotGain, setMasterVolume };
	attachElement(mixer, elements[0], 0);
	attachElement(mixer, elements[1], 1);
	resume();
	return mixer;
};

/** Active mixer, if EQ was enabled. */
export const getEqualizerGraph = (): EqualizerGraph | null => mixer;

const attachElement = (graph: EqualizerGraph, element: HTMLAudioElement, slot: 0 | 1) => {
	if (attached.has(element)) return;
	ensureCors(element);
	const source = graph.ctx.createMediaElementSource(element);
	source.connect(graph.slotGains[slot]);
	attached.add(element);
	element.volume = 1;
	element.addEventListener("play", graph.resume);
};

const ensureCors = (element: HTMLAudioElement) => {
	if (element.crossOrigin === "anonymous") return;
	const src = element.src;
	const time = element.currentTime;
	const playing = !element.paused;
	element.crossOrigin = "anonymous";
	if (!src) return;
	element.src = src;
	element.load();
	element.addEventListener("loadedmetadata", () => {
		if (Number.isFinite(time) && time > 0) {
			element.currentTime = Math.min(time, element.duration || time);
		}
		if (playing) void element.play().catch(() => { /* autoplay */ });
	}, { once: true });
};
