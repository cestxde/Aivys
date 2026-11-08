/**
 * Map the UI volume slider (0–1, linear) to the value set on the audio
 * element / native player. Squaring feels more even across the range.
 */
export const toElementVolume = (linear: number): number =>
    Math.pow(Math.min(1, Math.max(0, linear)), 2);
