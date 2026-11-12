import { useEffect, useState } from "react";
import { Check, ClipboardCopy, X } from "lucide-react";
import { t } from "../../i18n";
import { useBackLayer } from "../../hooks/useBackLayer";
import { notifyError } from "../../utils/notify";
import "./M3uMissingDialog.css";

export interface M3uMissingGroup {
    /** Playlist file stem / created name. */
    name: string;
    entries: string[];
}

interface M3uMissingDialogProps {
    groups: M3uMissingGroup[];
    onClose: () => void;
}

const copyText = (groups: M3uMissingGroup[]): string =>
    groups
        .map(group => [`# ${group.name}`, ...group.entries].join("\n"))
        .join("\n\n");

/** Paths from an M3U import that did not match the open library. */
export const M3uMissingDialog = ({ groups, onClose }: M3uMissingDialogProps) => {
    useBackLayer(true, onClose);
    const [copied, setCopied] = useState(false);
    const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const copy = () => {
        navigator.clipboard.writeText(copyText(groups)).then(
            () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            },
            e => notifyError(t("error.copy"), e),
        );
    };

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="m3u-missing-dialog" role="dialog" aria-label={t("import.m3uMissingTitle")}>
                <div className="m3u-missing-header">
                    <div className="m3u-missing-heading">
                        <h2>{t("import.m3uMissingTitle")}</h2>
                        <span className="m3u-missing-subject">
                            {t("import.m3uMissingLead", { count: total })}
                        </span>
                    </div>
                    <button type="button" className="add-to-close" title={t("common.close")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="m3u-missing-list">
                    {groups.map(group => (
                        <section key={group.name} className="m3u-missing-group">
                            <h3 className="m3u-missing-group-title">{group.name}</h3>
                            <ul className="m3u-missing-entries">
                                {group.entries.map((entry, index) => (
                                    <li key={`${group.name}:${index}`}>{entry}</li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>

                <div className="m3u-missing-actions">
                    <button type="button" className="m3u-missing-button" onClick={copy}>
                        {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
                        {copied ? t("common.copied") : t("common.copy")}
                    </button>
                    <button type="button" className="m3u-missing-button primary" onClick={onClose}>
                        {t("common.close")}
                    </button>
                </div>
            </div>
        </div>
    );
};
