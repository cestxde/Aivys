import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { X } from "lucide-react";
import {
    closeChangelog, fetchReleases, isNewer, sameVersion, type ReleaseInfo,
} from "../../utils/updates";
import { t } from "../../i18n";
import { useBackLayer } from "../../hooks/useBackLayer";
import { ReleaseNotes } from "./ReleaseNotes";
import "./UpdateDialog.css";

/** Full release history from GitHub, with marks on the installed and latest versions. */
export const ChangelogDialog = () => {
    useBackLayer(true, closeChangelog);
    const [current, setCurrent] = useState<string | null>(null);
    const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getVersion().then(version => {
            if (!cancelled) setCurrent(version);
        }).catch(() => {
            if (!cancelled) setCurrent(null);
        });
        fetchReleases({ force: true })
            .then(items => {
                if (!cancelled) setReleases(items);
            })
            .catch(e => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeChangelog();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const latest = releases?.[0]?.version ?? null;
    const currentListed = current !== null && releases?.some(release => sameVersion(release.version, current));

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && closeChangelog()}>
            <div className="update-dialog changelog-dialog" role="dialog" aria-label={t("updates.changelog")}>
                <div className="tag-dialog-header">
                    <h2>{t("updates.changelog")}</h2>
                    <button className="add-to-close" title={t("common.close")} onClick={closeChangelog}>
                        <X size={18} />
                    </button>
                </div>
                {current && (
                    <span className="update-current">{t("updates.current", { version: current })}</span>
                )}

                {error && <p className="update-error">{t("updates.changelogFailed", { message: error })}</p>}
                {!error && releases === null && <p className="update-current">{t("updates.changelogLoading")}</p>}
                {releases && releases.length === 0 && <p className="update-current">{t("updates.noNotes")}</p>}

                {releases && releases.length > 0 && (
                    <div className="changelog-list">
                        {current && !currentListed && (
                            <section className="changelog-entry">
                                <div className="changelog-heading">
                                    <h2>{current}</h2>
                                    <span className="changelog-badge current">{t("updates.badgeCurrent")}</span>
                                    {latest && isNewer(latest, current) && (
                                        <span className="changelog-badge behind">{t("updates.badgeBehind")}</span>
                                    )}
                                </div>
                                <p className="update-current">{t("updates.currentNotOnGithub")}</p>
                            </section>
                        )}
                        {releases.map(release => {
                            const isLatest = latest !== null && sameVersion(release.version, latest);
                            const isCurrent = current !== null && sameVersion(release.version, current);
                            return (
                                <section key={release.version} className="changelog-entry">
                                    <div className="changelog-heading">
                                        <h2>{release.version}</h2>
                                        {isLatest && <span className="changelog-badge latest">{t("updates.badgeLatest")}</span>}
                                        {isCurrent && <span className="changelog-badge current">{t("updates.badgeCurrent")}</span>}
                                    </div>
                                    {release.body
                                        ? <ReleaseNotes text={release.body} />
                                        : <p className="update-current">{t("updates.noNotes")}</p>}
                                </section>
                            );
                        })}
                    </div>
                )}

                <div className="editor-footer">
                    <button className="editor-button" onClick={closeChangelog}>{t("common.close")}</button>
                </div>
            </div>
        </div>
    );
};
