import { useSyncExternalStore } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { dismissNotice, getNotices, subscribeNotices } from "../../utils/notify";
import "./Notices.css";

/** Notices in the bottom-right corner, above the player bar. */
export const Notices = () => {
    const notices = useSyncExternalStore(subscribeNotices, getNotices);
    if (notices.length === 0) return null;

    return (
        <div className="notices" role="status" aria-live="polite">
            {notices.map(notice => (
                <div key={notice.id} className={`notice notice-${notice.kind}`}>
                    {notice.kind === "error"
                        ? <AlertCircle size={16} className="notice-icon" />
                        : <CheckCircle2 size={16} className="notice-icon" />}
                    <span className="notice-message">{notice.message}</span>
                    <button
                        className="notice-close"
                        title="Dismiss"
                        onClick={() => dismissNotice(notice.id)}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};
