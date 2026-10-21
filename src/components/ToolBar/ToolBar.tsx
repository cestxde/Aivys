import "./ToolBar.css"
import type { SortOrder } from "../../types";

interface ToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    sortOrder: SortOrder;
    onSortChange: (order: SortOrder) => void;
    onShuffleAll: () => void;
    onPlayAll: () => void;
}

export const Toolbar = ({
    searchQuery,
    onSearchChange,
    sortOrder,
    onSortChange,
    onShuffleAll,
    onPlayAll
}: ToolbarProps) => {
    return (
        <div className="toolbar">
            <div className="toolbar-section left">
                <select
                    value={sortOrder}
                    onChange={(e) => onSortChange(e.target.value as SortOrder)}
                    className="sort-select"
                >
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
                <button onClick={onShuffleAll} className="toolbar-button shuffle-button">
                    Shuffle
                </button>
                <button onClick={onPlayAll} className="toolbar-button play-button">
                    Play All
                </button>
            </div>
        </div>
    );
};