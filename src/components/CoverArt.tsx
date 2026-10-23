import { convertFileSrc } from "@tauri-apps/api/core";
import { Music } from "lucide-react";

interface CoverArtProps {
    /** Path to the cover file in the app data cache, or null/undefined if none. */
    path: string | null | undefined;
    /** Rendered size in pixels (square). */
    size: number;
    /** Optional extra class for layout tweaks. */
    className?: string;
    /** If set, the cover becomes clickable (e.g. to open a large view). */
    onClick?: () => void;
    /** Changes when the file at `path` is replaced, so the image reloads. */
    version?: number;
}

/**
 * Square cover art with a rounded placeholder (music note icon) when no cover
 * is available. Uses the Tauri asset protocol to load the cached image.
 */
export const CoverArt = ({ path, size, className, onClick, version }: CoverArtProps) => {
    const style = { width: size, height: size };
    const clickable = typeof onClick === "function";

    return (
        <div
            className={`cover-art ${clickable ? "cover-art-clickable" : ""} ${className ?? ""}`}
            style={style}
            onClick={onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); } : undefined}
        >
            {path ? (
                <img src={convertFileSrc(path) + (version ? `?v=${version}` : "")} alt="" loading="lazy" draggable={false} />
            ) : (
                <Music size={Math.round(size * 0.5)} />
            )}
        </div>
    );
};
