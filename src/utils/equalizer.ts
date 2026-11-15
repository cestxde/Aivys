/**
 * Desktop equalizer: band layout, presets, and device-local settings.
 * Frequencies match the Yandex Music-style 10-band graphic EQ.
 */

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const;

export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;

export type EqGains = [number, number, number, number, number, number, number, number, number, number];

export interface EqualizerState {
	enabled: boolean;
	/** Preamp in dB (−12…+12). */
	preamp: number;
	gains: EqGains;
	/** Built-in preset id, or `"custom"` after manual band edits. */
	presetId: string;
}

export interface EqPreset {
	id: string;
	/** i18n message key under `eq.preset.*`. */
	labelKey:
		| "eq.preset.flat"
		| "eq.preset.classical"
		| "eq.preset.dance"
		| "eq.preset.bass"
		| "eq.preset.treble"
		| "eq.preset.vocal"
		| "eq.preset.rock"
		| "eq.preset.pop"
		| "eq.preset.soft"
		| "eq.preset.electronic";
	gains: EqGains;
	preamp?: number;
}

const flat = (): EqGains => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** Approximate curves inspired by common music-player presets (not a licensed copy). */
export const EQ_PRESETS: EqPreset[] = [
	{ id: "flat", labelKey: "eq.preset.flat", gains: flat() },
	{ id: "classical", labelKey: "eq.preset.classical", gains: [0, 0, 0, 0, 0, 0, -2, -2, -2, -3] },
	{ id: "dance", labelKey: "eq.preset.dance", gains: [4, 3, 1, 0, 0, -2, -3, -3, 0, 0] },
	{ id: "bass", labelKey: "eq.preset.bass", gains: [6, 5, 3, 2, 0, -1, -2, -2, 0, 0] },
	{ id: "treble", labelKey: "eq.preset.treble", gains: [-2, -1, 0, 0, 0, 1, 2, 4, 5, 6] },
	{ id: "vocal", labelKey: "eq.preset.vocal", gains: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2] },
	{ id: "rock", labelKey: "eq.preset.rock", gains: [4, 3, 1, 0, -1, 0, 1, 2, 3, 3] },
	{ id: "pop", labelKey: "eq.preset.pop", gains: [-1, 0, 1, 2, 3, 2, 0, -1, -1, -1] },
	{ id: "soft", labelKey: "eq.preset.soft", gains: [2, 1, 0, -1, -1, 0, 1, 2, 3, 4] },
	{ id: "electronic", labelKey: "eq.preset.electronic", gains: [4, 3, 1, 0, -2, 1, 0, 1, 3, 4] },
];

export const DEFAULT_EQ: EqualizerState = {
	enabled: false,
	preamp: 0,
	gains: flat(),
	presetId: "flat",
};

const clampDb = (value: number): number =>
	Math.min(EQ_GAIN_MAX, Math.max(EQ_GAIN_MIN, value));

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export const formatBandHz = (hz: number): string =>
	hz >= 1000 ? `${hz / 1000}k` : String(hz);

export const isEqualizerState = (value: unknown): value is EqualizerState => {
	if (!value || typeof value !== "object") return false;
	const state = value as EqualizerState;
	return (
		typeof state.enabled === "boolean"
		&& typeof state.preamp === "number"
		&& typeof state.presetId === "string"
		&& Array.isArray(state.gains)
		&& state.gains.length === EQ_BANDS.length
		&& state.gains.every(gain => typeof gain === "number")
	);
};

export const normalizeEqualizerState = (state: EqualizerState): EqualizerState => ({
	enabled: state.enabled,
	preamp: clampDb(state.preamp),
	gains: state.gains.map(clampDb) as EqGains,
	presetId: state.presetId || "custom",
});

export const presetById = (id: string): EqPreset | undefined =>
	EQ_PRESETS.find(preset => preset.id === id);

export const applyPreset = (id: string): EqualizerState | null => {
	const preset = presetById(id);
	if (!preset) return null;
	return {
		enabled: true,
		preamp: clampDb(preset.preamp ?? 0),
		gains: [...preset.gains] as EqGains,
		presetId: preset.id,
	};
};
