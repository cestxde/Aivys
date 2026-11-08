import type { MessageKey } from "../i18n";

/** Writing-system bits on `Track.scripts` (must match src-tauri/src/scripts.rs). */
export const SCRIPT_LATIN = 1 << 0;
export const SCRIPT_CYRILLIC = 1 << 1;
export const SCRIPT_JAPANESE = 1 << 2;
export const SCRIPT_KOREAN = 1 << 3;
export const SCRIPT_HAN = 1 << 4;
export const SCRIPT_ARABIC = 1 << 5;
export const SCRIPT_THAI = 1 << 6;
export const SCRIPT_GREEK = 1 << 7;
export const SCRIPT_OTHER = 1 << 8;

/** Scripts offered in the search filter (Latin is nearly universal, so omitted). */
export const FILTER_SCRIPTS: { bit: number; label: MessageKey }[] = [
    { bit: SCRIPT_JAPANESE, label: "scripts.japanese" },
    { bit: SCRIPT_HAN, label: "scripts.han" },
    { bit: SCRIPT_KOREAN, label: "scripts.korean" },
    { bit: SCRIPT_CYRILLIC, label: "scripts.cyrillic" },
    { bit: SCRIPT_ARABIC, label: "scripts.arabic" },
    { bit: SCRIPT_THAI, label: "scripts.thai" },
    { bit: SCRIPT_GREEK, label: "scripts.greek" },
    { bit: SCRIPT_OTHER, label: "scripts.other" },
];

/** Union of script bits present on any of the tracks. */
export const presentScripts = (scripts: Iterable<number>): number => {
    let mask = 0;
    for (const value of scripts) mask |= value;
    return mask;
};
