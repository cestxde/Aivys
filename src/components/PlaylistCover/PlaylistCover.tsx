import type { ComponentType } from "react";
import { ListMusic, Sparkles } from "lucide-react";
import type { Playlist } from "../../types";
import { CoverArt } from "../CoverArt";
import "./PlaylistCover.css";

interface CoverMosaicProps {
    /** Cover paths to show; duplicates are ignored. */
    covers: string[];
    size: number;
    /** Shown when there is no cover at all. */
    icon: ComponentType<{ size?: number }>;
    className?: string;
    onClick?: () => void;
}

/** A 2×2 mosaic of covers, a single cover, or an icon. */
export const CoverMosaic = ({ covers, size, icon: Icon, className = "", onClick }: CoverMosaicProps) => {
    const distinct = [...new Set(covers)].slice(0, 4);
    const clickable = onClick ? "cover-art-clickable" : "";

    if (distinct.length === 4) {
        return (
            <div
                className={`playlist-cover playlist-mosaic ${clickable} ${className}`}
                style={{ width: size, height: size }}
                onClick={onClick}
                role={onClick ? "button" : undefined}
            >
                {distinct.map(path => <CoverArt key={path} path={path} size={size / 2} />)}
            </div>
        );
    }
    if (distinct.length > 0) {
        return <CoverArt path={distinct[0]} size={size} className={`playlist-cover ${className}`} onClick={onClick} />;
    }
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

interface PlaylistCoverProps {
    playlist: Playlist;
    /** Cover paths of member tracks, for the fallback mosaic. */
    memberCovers: string[];
    size: number;
    className?: string;
    onClick?: () => void;
}

/** A playlist's custom cover; otherwise a mosaic of member covers. */
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
    return (
        <CoverMosaic
            covers={memberCovers}
            size={size}
            icon={playlist.type === "smart" ? Sparkles : ListMusic}
            className={className}
            onClick={onClick}
        />
    );
};
