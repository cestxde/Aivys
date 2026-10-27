import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, X } from "lucide-react";
import { t } from "../../i18n";
import "./CoverViewer.css";
import { useBackLayer } from "../../hooks/useBackLayer";

interface CoverViewerProps {
    /** Cover file path, or null for the placeholder. */
    path: string | null;
    /** Called when the viewer should close. */
    onClose: () => void;
}

/** Full-screen overlay showing the current cover art at a large size. */
export const CoverViewer = ({ path, onClose }: CoverViewerProps) => {
    useBackLayer(true, onClose);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="cover-viewer-backdrop" onClick={onClose}>
            <button className="cover-viewer-close" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
                <X size={22} />
            </button>
            <div className="cover-viewer-image" onClick={(e) => e.stopPropagation()}>
                {path ? (
                    <img src={convertFileSrc(path)} alt="" />
                ) : (
                    <Music size={72} />
                )}
            </div>
        </div>
    );
};
