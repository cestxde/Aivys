import type { RepeatMode } from "./types";

/** Cycle order for the repeat button (none -> all -> one -> none). */
export const REPEAT_MODES: RepeatMode[] = ["none", "all", "one"];

/** The repeat mode that follows `mode` when the repeat button is clicked. */
export const nextRepeatMode = (mode: RepeatMode): RepeatMode => {
    const index = REPEAT_MODES.indexOf(mode);
    return REPEAT_MODES[(index + 1) % REPEAT_MODES.length];
};
