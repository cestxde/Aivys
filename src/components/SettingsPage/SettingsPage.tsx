import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { FolderOpen, Info, Keyboard, MicVocal, Palette, RefreshCw, Library, Share2 } from "lucide-react";
import { ArtistRulesEditor } from "./ArtistRules";
import { ShortcutSettings } from "./ShortcutSettings";
import type { ThemePreference } from "../../utils/theme";
import {
    getLanguagePreference, getLogoPreference, setLanguagePreference, setLogoPreference, t,
    type LanguagePreference, type LogoPreference,
} from "../../i18n";
import "./SettingsPage.css";

interface SettingsPageProps {
    theme: ThemePreference;
    onThemeChange: (theme: ThemePreference) => void;
    libraryPath: string;
    /** Remembered folders other than the open one. */
    otherRecentCount: number;
    onChangeFolder: () => void;
    onRescan: () => void;
    onClearRecent: () => void;
    /** Merge sync-conflict copies in `.aivys/` now. */
    onCheckConflicts: () => Promise<void>;
}

const Section = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
    <section className="settings-section">
        <h2 className="settings-section-title">{icon} {title}</h2>
        <div className="settings-rows">{children}</div>
    </section>
);

/** One setting: what it is on the left, its control on the right. */
const Row = ({ title, description, children }: {
    title: string;
    description?: ReactNode;
    children?: ReactNode;
}) => (
    <div className="settings-row">
        <div className="settings-row-text">
            <span className="settings-row-title">{title}</span>
            {description && <span className="settings-row-description">{description}</span>}
        </div>
        {children && <div className="settings-row-control">{children}</div>}
    </div>
);

/** A segmented choice between a few options. */
const Segmented = <T extends string>({ options, value, onChange, disabled }: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
}) => (
    <div className="settings-segmented" role="radiogroup">
        {options.map(option => (
            <button
                key={option.value}
                role="radio"
                aria-checked={option.value === value}
                className={option.value === value ? "active" : ""}
                disabled={disabled}
                onClick={() => onChange(option.value)}
            >
                {option.label}
            </button>
        ))}
    </div>
);

/** App and library settings, in sections. */
export const SettingsPage = ({
    theme,
    onThemeChange,
    libraryPath,
    otherRecentCount,
    onChangeFolder,
    onRescan,
    onClearRecent,
    onCheckConflicts,
}: SettingsPageProps) => {
    const [version, setVersion] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        getVersion().then(setVersion).catch(() => setVersion(null));
    }, []);

    // The folder name is shown as code inside the sentence.
    const [conflictsBefore, conflictsAfter] = t("settings.conflictsHint").split("{folder}");

    const checkConflicts = async () => {
        setChecking(true);
        try {
            await onCheckConflicts();
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="settings-page">
            <h1 className="settings-title">{t("nav.settings")}</h1>

            <Section icon={<Palette size={16} />} title={t("settings.appearance")}>
                <Row title={t("settings.theme")} description={t("settings.themeHint")}>
                    <Segmented<ThemePreference>
                        options={[
                            { value: "system", label: t("settings.system") },
                            { value: "light", label: t("settings.light") },
                            { value: "dark", label: t("settings.dark") },
                        ]}
                        value={theme}
                        onChange={onThemeChange}
                    />
                </Row>
                <Row title={t("settings.language")} description={t("settings.languageHint")}>
                    <Segmented<LanguagePreference>
                        options={[
                            { value: "system", label: t("settings.system") },
                            // Language names are written in their own language.
                            { value: "en", label: "English" },
                            { value: "ru", label: "Русский" },
                        ]}
                        value={getLanguagePreference()}
                        onChange={setLanguagePreference}
                    />
                </Row>
                <Row title={t("settings.logo")} description={t("settings.logoHint")}>
                    <Segmented<LogoPreference>
                        options={[
                            { value: "auto", label: t("settings.logoAuto") },
                            { value: "en", label: "Aivys" },
                            { value: "ru", label: "Айвис" },
                        ]}
                        value={getLogoPreference()}
                        onChange={setLogoPreference}
                    />
                </Row>
            </Section>

            <Section icon={<Library size={16} />} title={t("settings.library")}>
                <Row title={t("settings.folder")} description={<span className="settings-path">{libraryPath}</span>}>
                    <button className="settings-button" onClick={onChangeFolder}>
                        <FolderOpen size={14} /> {t("settings.change")}
                    </button>
                </Row>
                <Row title={t("settings.rescan")} description={t("settings.rescanHint")}>
                    <button className="settings-button" onClick={onRescan}>
                        <RefreshCw size={14} /> {t("settings.rescan")}
                    </button>
                </Row>
                <Row
                    title={t("settings.recent")}
                    description={otherRecentCount > 0
                        ? t("settings.recentCount", { count: otherRecentCount })
                        : t("settings.recentNone")}
                >
                    <button className="settings-button" disabled={otherRecentCount === 0} onClick={onClearRecent}>
                        {t("settings.clear")}
                    </button>
                </Row>
            </Section>

            <Section icon={<MicVocal size={16} />} title={t("settings.artists")}>
                <div className="settings-row settings-row-block">
                    <span className="settings-row-description">{t("settings.artistsHint")}</span>
                    <ArtistRulesEditor onApply={onRescan} />
                </div>
            </Section>

            <Section icon={<Keyboard size={16} />} title={t("settings.shortcuts")}>
                <ShortcutSettings />
            </Section>

            <Section icon={<Share2 size={16} />} title={t("settings.sync")}>
                <Row title={t("settings.conflicts")} description={<>{conflictsBefore}<code>.aivys</code>{conflictsAfter}</>}>
                    <button className="settings-button" disabled={checking} onClick={checkConflicts}>
                        <RefreshCw size={14} className={checking ? "settings-spin" : ""} /> {t("settings.checkNow")}
                    </button>
                </Row>
            </Section>

            <Section icon={<Info size={16} />} title={t("settings.about")}>
                <Row title="Aivys" description={version ? t("settings.version", { version }) : undefined} />
            </Section>
        </div>
    );
};
