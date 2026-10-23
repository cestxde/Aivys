import "./ToolBar.css"
import { Play, Shuffle } from "lucide-react";
import type { SortOrder } from "../../types";

interface ToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    /** Null for views with their own order (favorites, history, smart playlists). */
    sortOrder: SortOrder | null;
    onSortChange: (order: SortOrder) => void;
    sortDisabled?: boolean;
    /** Offer "Playlist order" (manual playlists). */
    showManualOrder?: boolean;
    onShuffleAll: () => void;
    onPlayAll: () => void;
}

export const Toolbar = ({
    searchQuery,
    onSearchChange,
    sortOrder,
    onSortChange,
    sortDisabled = false,
    showManualOrder = false,
    onShuffleAll,
    onPlayAll
}: ToolbarProps) => {
    return (
        <div className="toolbar">
            <div className="toolbar-section left">
                <select
                    value={sortOrder ?? ""}
                    onChange={(e) => onSortChange(e.target.value as SortOrder)}
                    className="sort-select"
                    disabled={sortDisabled || sortOrder === null}
                >
                    {sortOrder === null && <option value="">Default order</option>}
                    {showManualOrder && <option value="manual">Playlist order</option>}
                    <option value="date">Newest</option>
                    <option value="name">Title</option>
                    <option value="artist">Artist</option>
                    <option value="album">Album</option>
                    <option value="duration">Duration</option>
                </select>
            </div>

            <div className="toolbar-section center">
                <input
                    type="text"
                    placeholder="Search tracks..."
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="toolbar-section right">
                <button
                    onClick={onShuffleAll}
                    className="toolbar-button toolbar-icon-button shuffle-button"
                    title="Shuffle all"
                    aria-label="Shuffle all"
                >
                    <Shuffle size={18} />
                </button>
                <button
                    onClick={onPlayAll}
                    className="toolbar-button toolbar-icon-button play-button"
                    title="Play all"
                    aria-label="Play all"
                >
                    <Play size={18} fill="currentColor" />
                </button>
            </div>
        </div>
    );
};