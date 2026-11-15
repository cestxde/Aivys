import type { TransitionMode } from "../types";

export const DELAY_MS_MIN = 0;
export const DELAY_MS_MAX = 30_000;
export const CROSSFADE_SEC_MIN = 1;
export const CROSSFADE_SEC_MAX = 12;

export const clampDelayMs = (value: number): number =>
	Math.min(DELAY_MS_MAX, Math.max(DELAY_MS_MIN, Math.round(value)));

export const clampCrossfadeSec = (value: number): number =>
	Math.min(CROSSFADE_SEC_MAX, Math.max(CROSSFADE_SEC_MIN, Math.round(value * 10) / 10));

export const isTransitionMode = (value: unknown): value is TransitionMode =>
	value === "gapless" || value === "crossfade";

/** Equal-power crossfade curve: out fades cos, in fades sin. */
export const equalPowerGains = (t: number): { out: number; inn: number } => {
	const x = Math.min(1, Math.max(0, t));
	const angle = x * (Math.PI / 2);
	return { out: Math.cos(angle), inn: Math.sin(angle) };
};
