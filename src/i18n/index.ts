/**
 * Interface language. A tiny external store, so components (via `useI18n`)
 * and plain code (hooks' error notices, sort labels) translate the same way:
 * `t(key, params)` looks the key up in the current language.
 *
 * The choice is device-local; index.html reads the same storage keys before
 * the first paint to pick the boot logo.
 */
import { useSyncExternalStore } from "react";
import { en, type Message, type MessageKey } from "./en";
import { ru } from "./ru";

export type { MessageKey } from "./en";

export type Language = 'en' | 'ru';
/** "system" follows the OS language. */
export type LanguagePreference = 'system' | Language;
/** "auto" shows the logo of the interface language. */
export type LogoPreference = 'auto' | Language;

const DICTIONARIES: Record<Language, Record<MessageKey, Message>> = { en, ru };

const LANGUAGE_KEY = "aivys.language";
const LOGO_KEY = "aivys.logo";

const read = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const write = (key: string, value: string | null) => {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Not remembered; fine.
    }
};

const systemLanguage = (): Language => (navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en");

const isLanguage = (value: string | null): value is Language => value === "en" || value === "ru";

let languagePreference: LanguagePreference = isLanguage(read(LANGUAGE_KEY)) ? read(LANGUAGE_KEY) as Language : "system";
let logoPreference: LogoPreference = isLanguage(read(LOGO_KEY)) ? read(LOGO_KEY) as Language : "auto";
let language: Language = languagePreference === "system" ? systemLanguage() : languagePreference;

const listeners = new Set<() => void>();
let version = 0;

const changed = () => {
    version++;
    document.documentElement.lang = language;
    document.documentElement.dataset.logo = logoLanguage();
    listeners.forEach(listener => listener());
};

export const getLanguage = (): Language => language;
export const getLanguagePreference = (): LanguagePreference => languagePreference;
export const getLogoPreference = (): LogoPreference => logoPreference;

/** The language whose logo to show. */
export const logoLanguage = (): Language => (logoPreference === "auto" ? language : logoPreference);

export const setLanguagePreference = (preference: LanguagePreference) => {
    languagePreference = preference;
    language = preference === "system" ? systemLanguage() : preference;
    write(LANGUAGE_KEY, preference === "system" ? null : preference);
    changed();
};

export const setLogoPreference = (preference: LogoPreference) => {
    logoPreference = preference;
    write(LOGO_KEY, preference === "auto" ? null : preference);
    changed();
};

type Params = Record<string, string | number>;

const pluralRules = new Map<Language, Intl.PluralRules>();

/** Pick the plural form for `count` (Russian has one / few / many). */
const pluralForm = (message: Exclude<Message, string>, count: number): string => {
    let rules = pluralRules.get(language);
    if (!rules) {
        rules = new Intl.PluralRules(language);
        pluralRules.set(language, rules);
    }
    const form = rules.select(count) as keyof typeof message;
    return message[form] ?? message.other;
};

/** The message for `key` in the current language, with `{name}` placeholders filled in. */
export const t = (key: MessageKey, params?: Params): string => {
    const message = DICTIONARIES[language][key] ?? en[key];
    const text = typeof message === "string" ? message : pluralForm(message, Number(params?.count ?? 0));
    return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : text;
};

const collators = new Map<Language, Intl.Collator>();

/** Natural, case-insensitive comparison in the interface language. */
export const compareText = (a: string, b: string): number => {
    let collator = collators.get(language);
    if (!collator) {
        collator = new Intl.Collator(language, { numeric: true, sensitivity: "base" });
        collators.set(language, collator);
    }
    return collator.compare(a, b);
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/**
 * Re-render on a language or logo change. Returns the current language; pass
 * it to memos whose values contain translated text.
 */
export const useI18n = (): Language => {
    useSyncExternalStore(subscribe, () => version);
    return language;
};

document.documentElement.lang = language;
document.documentElement.dataset.logo = logoLanguage();
