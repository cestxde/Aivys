import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, ImagePlus, ListMusic, Pencil, Sparkles, Trash2, SlidersHorizontal } from "lucide-react";
import type { ListRow, Playlist } from "../../types";
import { formatDuration } from "../../utils/format";
import { PlaylistCover } from "../PlaylistCover/PlaylistCover";
import "./PlaylistHeader.css";

interface PlaylistHeaderProps {
    playlist: Playlist;
    rows: ListRow[];
    missingCount: number;
    /** Open with the name in edit mode (a freshly created playlist). */
    startRenaming?: boolean;
    onBack: () => void;
    onRename: (name: string) => void;
    /** Asks for confirmation itself. */
    onDelete: () => void;
    onEditRules: () => void;
    onSetCover: (sourcePath: string) => void;
    onClearCover: () => void;
}

const COVER_SIZE = 120;

export const PlaylistHeader = ({
    playlist,
    rows,
    missingCount,
    startRenaming = false,
    onBack,
    onRename,
    onDelete,
    onEditRules,
    onSetCover,
    onClearCover,
}: PlaylistHeaderProps) => {
    const [draft, setDraft] = useState<string | null>(startRenaming ? playlist.name : null);
    const editable = !playlist.readOnly;
    const smart = playlist.type === "smart";

    const commitRename = () => {
        const name = draft?.trim();
        setDraft(null);
        if (name && name !== playlist.name) onRename(name);
    };

    const chooseCover = async () => {
        const path = await open({
            multiple: false,
            filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
        });
        if (typeof path === "string") onSetCover(path);
    };

    const totalSeconds = rows.reduce((sum, row) => sum + row.track.duration, 0);
    const summary = [
        `${rows.length} ${rows.length === 1 ? "track" : "tracks"}`,
        rows.length > 0 ? formatDuration(totalSeconds) : null,
        missingCount > 0 ? `${missingCount} missing` : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="playlist-header">
            <button className="playlist-back" title="All playlists" onClick={onBack}>
                <ArrowLeft size={18} />
            </button>
            <PlaylistCover
                playlist={playlist}
                memberCovers={rows.flatMap(row => row.track.coverPath ?? [])}
                size={COVER_SIZE}
                className="playlist-header-cover"
                onClick={editable ? chooseCover : undefined}
            />

            <div className="playlist-info">
                <span className="playlist-kind">
                    {smart ? <Sparkles size={14} /> : <ListMusic size={14} />}
                    {smart ? "Smart playlist" : "Playlist"}
                    {playlist.readOnly && " · read-only (made by a newer app version)"}
                </span>

                {draft !== null ? (
                    <input
                        className="playlist-name-input"
                        value={draft}
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setDraft(null);
                        }}
                    />
                ) : (
                    <h1
                        className={`playlist-name ${editable ? "editable" : ""}`}
                        title={editable ? "Click to rename" : undefined}
                        onClick={editable ? () => setDraft(playlist.name) : undefined}
                    >
                        {playlist.name}
                    </h1>
                )}

                <span className="playlist-summary">{summary}</span>

                {editable && (
                    <div className="playlist-actions">
                        {smart && (
                            <button className="playlist-action" onClick={onEditRules}>
                                <SlidersHorizontal size={14} /> Edit rules
                            </button>
                        )}
                        <button className="playlist-action" onClick={() => setDraft(playlist.name)}>
                            <Pencil size={14} /> Rename
                        </button>
                        <button className="playlist-action" onClick={chooseCover}>
                            <ImagePlus size={14} /> {playlist.coverPath ? "Change cover" : "Set cover"}
                        </button>
                        {playlist.coverPath && (
                            <button className="playlist-action" onClick={onClearCover}>
                                Remove cover
                            </button>
                        )}
                        <button className="playlist-action danger" onClick={onDelete}>
                            <Trash2 size={14} /> Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
