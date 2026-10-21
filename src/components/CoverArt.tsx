import { convertFileSrc } from "@tauri-apps/api/core";
import { Music } from "lucide-react";

interface CoverArtProps {
    /** Path to the cover file in the app data cache, or null/undefined if none. */
    path: string | null | undefined;
    /** Rendered size in pixels (square). */
    size: number;
    /** Optional extra class for layout tweaks. */
    className?: string;
}

/**
 * Square cover art with a rounded placeholder (music note icon) when no cover
 * is available. Uses the Tauri asset protocol to load the cached image.
 */
export const CoverArt = ({ path, size, className }: CoverArtProps) => {
    const style = { width: size, height: size };

    return (
        <div className={`cover-art ${className ?? ""}`} style={style}>
            {path ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={convertFileSrc(path)} alt="" loading="lazy" />
            ) : (
                <Music size={Math.round(size * 0.5)} />
            )}
        </div>
    );
};
