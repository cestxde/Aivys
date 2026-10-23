import { ListMusic, Sparkles } from "lucide-react";
import type { Playlist } from "../../types";
import { CoverArt } from "../CoverArt";
import "./PlaylistCover.css";

interface PlaylistCoverProps {
    playlist: Playlist;
    /** Cover paths of member tracks, for the fallback mosaic. */
    memberCovers: string[];
    size: number;
    className?: string;
    onClick?: () => void;
}

/**
 * A playlist's custom cover; otherwise a 2×2 mosaic of member covers, a single
 * member cover, or an icon.
 */
export const PlaylistCover = ({ playlist, memberCovers, size, className = "", onClick }: PlaylistCoverProps) => {
    if (playlist.coverPath) {
        return (
            <CoverArt
                path={playlist.coverPath}
                size={size}
                version={playlist.updatedAt}
                className={`playlist-cover ${className}`}
                onClick={onClick}
            />
        );
    }

    const covers = [...new Set(memberCovers)].slice(0, 4);
    const clickable = onClick ? "cover-art-clickable" : "";

    if (covers.length === 4) {
        return (
            <div
                className={`playlist-cover playlist-mosaic ${clickable} ${className}`}
                style={{ width: size, height: size }}
                onClick={onClick}
                role={onClick ? "button" : undefined}
            >
                {covers.map(path => <CoverArt key={path} path={path} size={size / 2} />)}
            </div>
        );
    }
    if (covers.length > 0) {
        return <CoverArt path={covers[0]} size={size} className={`playlist-cover ${className}`} onClick={onClick} />;
    }

    const Icon = playlist.type === "smart" ? Sparkles : ListMusic;
    return (
        <div
            className={`cover-art playlist-cover playlist-cover-icon ${clickable} ${className}`}
            style={{ width: size, height: size }}
            onClick={onClick}
            role={onClick ? "button" : undefined}
        >
            <Icon size={Math.round(size * 0.4)} />
        </div>
    );
};
