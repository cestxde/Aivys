import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { FolderOpen, Info, Palette, RefreshCw, Library, Share2 } from "lucide-react";
import "./SettingsPage.css";

interface SettingsPageProps {
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
const Row = ({ title, description, children, soon = false }: {
    title: string;
    description?: ReactNode;
    children?: ReactNode;
    /** Planned, not available yet. */
    soon?: boolean;
}) => (
    <div className={`settings-row ${soon ? "soon" : ""}`}>
        <div className="settings-row-text">
            <span className="settings-row-title">
                {title}
                {soon && <span className="settings-soon">Coming soon</span>}
            </span>
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
            <h1 className="settings-title">Settings</h1>

            <Section icon={<Palette size={16} />} title="Appearance">
                <Row title="Theme" description="Follow the system, or always use a light or dark look." soon>
                    <Segmented
                        options={[
                            { value: "system", label: "System" },
                            { value: "light", label: "Light" },
                            { value: "dark", label: "Dark" },
                        ]}
                        value="system"
                        onChange={() => {}}
                        disabled
                    />
                </Row>
                <Row title="Language" description="Language of the player's interface." soon>
                    <Segmented
                        options={[
                            { value: "en", label: "English" },
                            { value: "ru", label: "Русский" },
                        ]}
                        value="en"
                        onChange={() => {}}
                        disabled
                    />
                </Row>
            </Section>

            <Section icon={<Library size={16} />} title="Library">
                <Row title="Library folder" description={<span className="settings-path">{libraryPath}</span>}>
                    <button className="settings-button" onClick={onChangeFolder}>
                        <FolderOpen size={14} /> Change
                    </button>
                </Row>
                <Row title="Rescan" description="Read new and changed files now. Unchanged files are taken from the index.">
                    <button className="settings-button" onClick={onRescan}>
                        <RefreshCw size={14} /> Rescan
                    </button>
                </Row>
                <Row
                    title="Recent folders"
                    description={otherRecentCount > 0
                        ? `${otherRecentCount} other ${otherRecentCount === 1 ? "folder is" : "folders are"} remembered on the start screen.`
                        : "No other folders are remembered."}
                >
                    <button className="settings-button" disabled={otherRecentCount === 0} onClick={onClearRecent}>
                        Clear
                    </button>
                </Row>
            </Section>

            <Section icon={<Share2 size={16} />} title="Sync">
                <Row
                    title="Sync conflicts"
                    description={<>
                        Your data lives in the <code>.aivys</code> folder next to the music and can be synced
                        with Syncthing. Conflicting copies are merged when the library opens; check again after
                        a sync while the player is running.
                    </>}
                >
                    <button className="settings-button" disabled={checking} onClick={checkConflicts}>
                        <RefreshCw size={14} className={checking ? "settings-spin" : ""} /> Check now
                    </button>
                </Row>
            </Section>

            <Section icon={<Info size={16} />} title="About">
                <Row title="Aivys" description={version ? `Version ${version}` : undefined} />
            </Section>
        </div>
    );
};
