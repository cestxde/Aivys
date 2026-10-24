import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, RefreshCw, X } from "lucide-react";
import type { ArtistRules } from "../../types";
import { notifyError } from "../../utils/notify";
import { t } from "../../i18n";

/** An editable list of short strings, as removable chips plus an input. */
const ChipList = ({ items, placeholder, onChange }: {
    items: string[];
    placeholder: string;
    onChange: (items: string[]) => void;
}) => {
    const [draft, setDraft] = useState("");
    const add = () => {
        const item = draft.trim();
        if (item && !items.some(known => known.toLowerCase() === item.toLowerCase())) onChange([...items, item]);
        setDraft("");
    };
    return (
        <div className="settings-chips">
            {items.map(item => (
                <span key={item} className="settings-chip">
                    {item}
                    <button
                        title={t("settings.remove", { name: item })}
                        aria-label={t("settings.remove", { name: item })}
                        onClick={() => onChange(items.filter(known => known !== item))}
                    >
                        <X size={12} />
                    </button>
                </span>
            ))}
            <span className="settings-chip-add">
                <input
                    className="rule-input"
                    value={draft}
                    placeholder={placeholder}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                />
                <button className="settings-button" disabled={!draft.trim()} onClick={add}>
                    <Plus size={14} /> {t("settings.add")}
                </button>
            </span>
        </div>
    );
};

/**
 * How artist tags are split into artists: on or off, the separators and the
 * names never split, stored in `.aivys/library.json`. Saving rescans the
 * library, which re-derives the artists from the index without reading files.
 */
export const ArtistRulesEditor = ({ onApply }: { onApply: () => void }) => {
    const [saved, setSaved] = useState<ArtistRules | null>(null);
    const [rules, setRules] = useState<ArtistRules | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        invoke<{ artists: ArtistRules }>("get_library_settings")
            .then(settings => {
                setSaved(settings.artists);
                setRules(settings.artists);
            })
            .catch(e => notifyError(t("error.loadArtistRules"), e));
    }, []);

    if (!rules || !saved) return null;
    const changed = JSON.stringify(rules) !== JSON.stringify(saved);

    const resetToDefaults = async () => {
        try {
            setRules(await invoke<ArtistRules>("default_artist_rules"));
        } catch (e) {
            notifyError(t("error.loadArtistRules"), e);
        }
    };

    const save = async () => {
        setSaving(true);
        try {
            const settings = await invoke<{ artists: ArtistRules }>("set_artist_rules", { rules });
            setSaved(settings.artists);
            setRules(settings.artists);
            onApply();
        } catch (e) {
            notifyError(t("error.saveArtistRules"), e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-artist-rules">
            <label className="settings-check">
                <input
                    type="checkbox"
                    checked={rules.enabled}
                    onChange={(e) => setRules({ ...rules, enabled: e.target.checked })}
                />
                {t("settings.splitArtists")}
            </label>
            <fieldset className="settings-field" disabled={!rules.enabled}>
                <span className="settings-row-title">{t("settings.splitOn")}</span>
                <span className="settings-row-description">{t("settings.splitOnHint")}</span>
                <ChipList
                    items={rules.splitOn}
                    placeholder={t("settings.addSeparator")}
                    onChange={(splitOn) => setRules({ ...rules, splitOn })}
                />
            </fieldset>
            <fieldset className="settings-field" disabled={!rules.enabled}>
                <span className="settings-row-title">{t("settings.keepWhole")}</span>
                <span className="settings-row-description">{t("settings.keepWholeHint")}</span>
                <ChipList
                    items={rules.keepWhole}
                    placeholder={t("settings.addName")}
                    onChange={(keepWhole) => setRules({ ...rules, keepWhole })}
                />
            </fieldset>
            <div className="settings-field-actions">
                <button className="settings-button" disabled={saving} onClick={resetToDefaults}>
                    {t("settings.resetRules")}
                </button>
                <span className="settings-actions-gap" />
                <button className="settings-button" disabled={!changed || saving} onClick={() => setRules(saved)}>
                    {t("common.cancel")}
                </button>
                <button className="settings-button primary" disabled={!changed || saving} onClick={save}>
                    <RefreshCw size={14} className={saving ? "settings-spin" : ""} /> {t("settings.applyRules")}
                </button>
            </div>
        </div>
    );
};
