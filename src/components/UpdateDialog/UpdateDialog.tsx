import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import {
    closeUpdateDialog, installUpdate, setUpdatePrompt, useUpdatePrompt, useUpdateStatus,
} from "../../utils/updates";
import { formatFileSize } from "../../utils/format";
import { t } from "../../i18n";
import "./UpdateDialog.css";

/**
 * Release notes, as the release workflow writes them: "### " headings and
 * "- " items; anything else is a paragraph.
 */
const ReleaseNotes = ({ text }: { text: string }) => {
    const blocks: ReactNode[] = [];
    let items: string[] = [];
    const flush = () => {
        if (items.length === 0) return;
        blocks.push(<ul key={blocks.length}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>);
        items = [];
    };
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith("- ") || line.startsWith("* ")) {
            items.push(line.slice(2));
            continue;
        }
        flush();
        if (line.startsWith("#")) blocks.push(<h3 key={blocks.length}>{line.replace(/^#+\s*/, "")}</h3>);
        else if (line) blocks.push(<p key={blocks.length}>{line}</p>);
    }
    flush();
    return <div className="update-notes">{blocks}</div>;
};

interface UpdateDialogProps {
    /** Called just before the installer takes over (the app is ended). */
    onBeforeInstall: () => void;
}

/** "A new version is available": its notes, install now or later. */
export const UpdateDialog = ({ onBeforeInstall }: UpdateDialogProps) => {
    const status = useUpdateStatus();
    const prompt = useUpdatePrompt();
    const update = "update" in status ? status.update : null;
    const busy = status.kind === "downloading";

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) closeUpdateDialog();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [busy]);

    if (!update) return null;

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && closeUpdateDialog()}>
            <div className="update-dialog" role="dialog" aria-label={t("updates.available", { version: update.version })}>
                <div className="tag-dialog-header">
                    <h2>{t("updates.available", { version: update.version })}</h2>
                    <button className="add-to-close" title={t("common.close")} disabled={busy} onClick={closeUpdateDialog}>
                        <X size={18} />
                    </button>
                </div>
                <span className="update-current">{t("updates.current", { version: update.currentVersion })}</span>

                {update.body?.trim()
                    ? <ReleaseNotes text={update.body} />
                    : <p className="update-current">{t("updates.noNotes")}</p>}

                {status.kind === "downloading" && (
                    <div className="update-progress">
                        <div className="update-progress-track">
                            <div
                                className="update-progress-bar"
                                style={{ width: status.total ? `${Math.min(100, (status.done / status.total) * 100)}%` : "30%" }}
                            />
                        </div>
                        <span>
                            {status.total
                                ? t("updates.downloading", { done: formatFileSize(status.done), total: formatFileSize(status.total) })
                                : t("updates.downloadingUnknown", { done: formatFileSize(status.done) })}
                        </span>
                    </div>
                )}
                {status.kind === "error" && <p className="update-error">{t("updates.installFailed", { message: status.message })}</p>}

                <div className="editor-footer">
                    <label className="settings-check update-dont-show">
                        <input
                            type="checkbox"
                            checked={!prompt}
                            disabled={busy}
                            onChange={(e) => setUpdatePrompt(!e.target.checked)}
                        />
                        {t("updates.dontShow")}
                    </label>
                    <button className="editor-button" disabled={busy} onClick={closeUpdateDialog}>{t("updates.later")}</button>
                    <button className="editor-button primary" disabled={busy} onClick={() => installUpdate(update, onBeforeInstall)}>
                        {busy ? t("updates.installing") : t("updates.install")}
                    </button>
                </div>
            </div>
        </div>
    );
};
