import { useEffect, useState } from "react";
import { Check, Heart, ListEnd, ListStart, Plus, X } from "lucide-react";
import type { Playlist, Track } from "../../types";
import { displayTitle } from "../../utils/track";
import { PlaylistCover } from "../PlaylistCover/PlaylistCover";
import "./AddToDialog.css";

interface AddToDialogProps {
    tracks: Track[];
    /** Manual playlists that can be added to. */
    playlists: Playlist[];
    tracksByPath: Map<string, Track>;
    /** Every one of the tracks is a favorite already. */
    allFavorite: boolean;
    onPlayNext: () => void;
    onAddToQueue: () => void;
    onAddToFavorites: () => void;
    onAddToPlaylist: (playlist: Playlist) => void;
    /** Create a playlist with the tracks, named `name`. */
    onCreatePlaylist: (name: string) => void;
    onClose: () => void;
}

/** "Add to…": the play queue or a playlist (filterable, or a new one). */
export const AddToDialog = ({
    tracks,
    playlists,
    tracksByPath,
    allFavorite,
    onPlayNext,
    onAddToQueue,
    onAddToFavorites,
    onAddToPlaylist,
    onCreatePlaylist,
    onClose,
}: AddToDialogProps) => {
    const [filter, setFilter] = useState("");
    const [newName, setNewName] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const query = filter.trim().toLowerCase();
    const shown = playlists
        .filter(p => !query || p.name.toLowerCase().includes(query))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    const paths = new Set(tracks.map(t => t.relPath));
    const containsAll = (playlist: Playlist) =>
        tracks.length > 0 && [...paths].every(path => playlist.items?.some(item => item.path === path));

    // Favorites is listed like a playlist, so the filter applies to it too.
    const showFavorites = !query || "favorites".includes(query);

    const subject = tracks.length === 1
        ? displayTitle(tracks[0])
        : `${tracks.length} tracks`;

    const createNew = () => {
        const name = newName?.trim();
        if (name) onCreatePlaylist(name);
    };

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="add-to-dialog" role="dialog" aria-label="Add to">
                <div className="add-to-header">
                    <div className="add-to-heading">
                        <h2>Add to…</h2>
                        <span className="add-to-subject">{subject}</span>
                    </div>
                    <button className="add-to-close" title="Close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="add-to-section-label">Queue</div>
                <div className="add-to-queue">
                    <button className="add-to-option" onClick={onPlayNext}>
                        <ListStart size={18} /> Play next
                    </button>
                    <button className="add-to-option" onClick={onAddToQueue}>
                        <ListEnd size={18} /> Add to queue
                    </button>
                </div>

                <div className="add-to-section-label">Playlist</div>
                <input
                    className="search-input"
                    placeholder="Find a playlist..."
                    value={filter}
                    autoFocus
                    onChange={(e) => setFilter(e.target.value)}
                />

                <div className="add-to-list">
                    {newName === null ? (
                        <button
                            className="add-to-row"
                            onClick={() => setNewName(filter.trim() || "New playlist")}
                        >
                            <span className="add-to-row-icon"><Plus size={18} /></span>
                            <span className="add-to-row-name">New playlist</span>
                        </button>
                    ) : (
                        <div className="add-to-row add-to-new">
                            <span className="add-to-row-icon"><Plus size={18} /></span>
                            <input
                                className="rule-input add-to-new-input"
                                value={newName}
                                autoFocus
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") createNew();
                                    if (e.key === "Escape") {
                                        e.stopPropagation();
                                        setNewName(null);
                                    }
                                }}
                            />
                            <button className="editor-button primary" disabled={!newName.trim()} onClick={createNew}>
                                Create
                            </button>
                        </div>
                    )}

                    {showFavorites && (
                        <button className="add-to-row" onClick={onAddToFavorites}>
                            <span className="add-to-row-icon add-to-favorites-icon"><Heart size={18} fill="currentColor" /></span>
                            <span className="add-to-row-text">
                                <span className="add-to-row-name">Favorites</span>
                            </span>
                            {allFavorite && (
                                <span className="add-to-row-already" title="Already in favorites">
                                    <Check size={14} /> added
                                </span>
                            )}
                        </button>
                    )}

                    {shown.map(playlist => {
                        const already = containsAll(playlist);
                        return (
                            <button
                                key={playlist.id}
                                className="add-to-row"
                                onClick={() => onAddToPlaylist(playlist)}
                            >
                                <PlaylistCover
                                    playlist={playlist}
                                    memberCovers={(playlist.items ?? []).flatMap(item => tracksByPath.get(item.path)?.coverPath ?? [])}
                                    size={40}
                                />
                                <span className="add-to-row-text">
                                    <span className="add-to-row-name">{playlist.name}</span>
                                    <span className="add-to-row-meta">
                                        {playlist.items?.length ?? 0} tracks
                                    </span>
                                </span>
                                {already && (
                                    <span className="add-to-row-already" title="Already in this playlist">
                                        <Check size={14} /> added
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    {shown.length === 0 && playlists.length > 0 && !showFavorites && (
                        <div className="add-to-empty">No playlists match.</div>
                    )}
                </div>
            </div>
        </div>
    );
};
