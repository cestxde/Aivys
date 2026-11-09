import { useEffect, useRef, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
    AppWindow, ArrowLeft, ChevronRight, Download, FolderOpen, Info, Keyboard,
    Library, Palette, RefreshCw, ScrollText, Share2,
} from "lucide-react";
import { ArtistRulesEditor } from "./ArtistRules";
import { ShortcutSettings } from "./ShortcutSettings";
import {
    checkForUpdates, isAndroid, isLinkUpdate, openChangelog, openUpdateDialog, setUpdatePrompt, useUpdatePrompt, useUpdateStatus,
} from "../../utils/updates";
import type { ThemePreference } from "../../utils/theme";
import {
    getLanguagePreference, getLogoPreference, setLanguagePreference, setLogoPreference, t,
    type LanguagePreference, type LogoPreference, type MessageKey,
} from "../../i18n";
import { setCloseToTray, useCloseToTray } from "../../hooks/useTray";
import { useBackLayer } from "../../hooks/useBackLayer";
import { useIsPhone } from "../../hooks/useIsPhone";
import { androidStorage } from "../../utils/androidStorage";
import "./SettingsPage.css";

/** Content column too narrow for a settings sidebar + panel side by side. */
const COMPACT_WIDTH = 560;

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

type CategoryId = "appearance" | "window" | "library" | "sync" | "shortcuts" | "about";

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

const Rows = ({ children }: { children: ReactNode }) => (
    <div className="settings-rows">{children}</div>
);

/** App and library settings, split into categories. */
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
    const isPhone = useIsPhone();
    const desktop = androidStorage === null;
    const rootRef = useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = useState(false);
    // Phone, or a desktop window where the settings column itself is squeezed.
    const compact = isPhone || narrow;
    const [version, setVersion] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [category, setCategory] = useState<CategoryId | null>(compact ? null : "appearance");
    const updates = useUpdateStatus();
    const prompt = useUpdatePrompt();
    const closeToTray = useCloseToTray();

    useEffect(() => {
        getVersion().then(setVersion).catch(() => setVersion(null));
    }, []);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const measure = (width: number) => setNarrow(width < COMPACT_WIDTH);
        measure(el.getBoundingClientRect().width);
        const observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width;
            if (width != null) measure(width);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Compact: leave a category with Back; wide desktop always keeps one selected.
    useBackLayer(compact && category !== null, () => setCategory(null));
    useEffect(() => {
        if (compact) {
            setCategory(null);
        } else {
            setCategory(prev => prev ?? "appearance");
        }
    }, [compact]);

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

    const categories: { id: CategoryId; icon: ReactNode; title: MessageKey; desktopOnly?: boolean }[] = [
        { id: "appearance", icon: <Palette size={18} />, title: "settings.appearance" },
        { id: "window", icon: <AppWindow size={18} />, title: "settings.window", desktopOnly: true },
        { id: "library", icon: <Library size={18} />, title: "settings.library" },
        { id: "sync", icon: <Share2 size={18} />, title: "settings.sync" },
        { id: "shortcuts", icon: <Keyboard size={18} />, title: "settings.shortcuts", desktopOnly: true },
        { id: "about", icon: <Info size={18} />, title: "settings.about" },
    ];
    const visible = categories.filter(entry => !entry.desktopOnly || desktop);

    const appearance = (
        <Rows>
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
        </Rows>
    );

    const windowSettings = (
        <Rows>
            <Row title={t("settings.closeToTray")} description={t("settings.closeToTrayHint")}>
                <input
                    type="checkbox"
                    className="settings-checkbox"
                    aria-label={t("settings.closeToTray")}
                    checked={closeToTray}
                    onChange={(e) => setCloseToTray(e.target.checked)}
                />
            </Row>
        </Rows>
    );

    const library = (
        <>
            <Rows>
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
            </Rows>
            <div className="settings-subsection">
                <h3 className="settings-subsection-title">{t("settings.artists")}</h3>
                <Rows>
                    <div className="settings-row settings-row-block">
                        <span className="settings-row-description">{t("settings.artistsHint")}</span>
                        <ArtistRulesEditor onApply={onRescan} />
                    </div>
                </Rows>
            </div>
        </>
    );

    const sync = (
        <Rows>
            <Row title={t("settings.conflicts")} description={<>{conflictsBefore}<code>.aivys</code>{conflictsAfter}</>}>
                <button className="settings-button" disabled={checking} onClick={checkConflicts}>
                    <RefreshCw size={14} className={checking ? "settings-spin" : ""} /> {t("settings.checkNow")}
                </button>
            </Row>
        </Rows>
    );

    const shortcuts = (
        <Rows>
            <ShortcutSettings />
        </Rows>
    );

    const about = (
        <Rows>
            <Row
                title={version ? t("settings.version", { version }) : "Aivys"}
                description={
                    updates.kind === "checking" ? t("updates.checking")
                        : updates.kind === "current" ? t("updates.upToDate")
                        : updates.kind === "available" || updates.kind === "downloading" ? t("updates.available", { version: updates.update.version })
                        : updates.kind === "error" ? t("updates.checkFailed", { message: updates.message })
                        : undefined
                }
            >
                {updates.kind === "available" || updates.kind === "downloading" || (updates.kind === "error" && updates.update) ? (
                    <button className="settings-button" onClick={openUpdateDialog}>
                        <Download size={14} /> {"update" in updates && updates.update && isLinkUpdate(updates.update) ? t("updates.download") : t("updates.install")}
                    </button>
                ) : (
                    <button
                        className="settings-button"
                        disabled={updates.kind === "checking"}
                        onClick={() => checkForUpdates({ manual: true })}
                    >
                        <RefreshCw size={14} className={updates.kind === "checking" ? "settings-spin" : ""} /> {t("updates.check")}
                    </button>
                )}
            </Row>
            <Row title={t("updates.prompt")} description={t(isAndroid ? "updates.promptHintApk" : "updates.promptHint")}>
                <input
                    type="checkbox"
                    className="settings-checkbox"
                    aria-label={t("updates.prompt")}
                    checked={prompt}
                    onChange={(e) => setUpdatePrompt(e.target.checked)}
                />
            </Row>
            <Row title={t("updates.changelog")} description={t("updates.changelogHint")}>
                <button className="settings-button" onClick={openChangelog}>
                    <ScrollText size={14} /> {t("updates.viewChangelog")}
                </button>
            </Row>
        </Rows>
    );

    const content: Record<CategoryId, ReactNode> = {
        appearance,
        window: windowSettings,
        library,
        sync,
        shortcuts,
        about,
    };

    const active = category && visible.some(entry => entry.id === category) ? category : null;
    const activeMeta = visible.find(entry => entry.id === active);

    return (
        <div ref={rootRef} className={`settings-page ${compact ? "phone" : "desktop"}`}>
            {!(compact && active) && <h1 className="settings-title">{t("nav.settings")}</h1>}

            <div className="settings-layout">
                {!(compact && active) && (
                    <nav className="settings-nav" aria-label={t("nav.settings")}>
                        {visible.map(entry => (
                            <button
                                key={entry.id}
                                type="button"
                                className={`settings-nav-item ${active === entry.id ? "active" : ""}`}
                                onClick={() => setCategory(entry.id)}
                            >
                                <span className="settings-nav-icon">{entry.icon}</span>
                                <span className="settings-nav-label">{t(entry.title)}</span>
                                {compact && <ChevronRight size={16} className="settings-nav-chevron" />}
                            </button>
                        ))}
                    </nav>
                )}

                {active && activeMeta && (
                    <div className="settings-panel">
                        {compact && (
                            <button type="button" className="settings-back" onClick={() => setCategory(null)}>
                                <ArrowLeft size={18} />
                                {t(activeMeta.title)}
                            </button>
                        )}
                        {!compact && (
                            <h2 className="settings-panel-title">{t(activeMeta.title)}</h2>
                        )}
                        <div className="settings-panel-body">
                            {content[active]}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
