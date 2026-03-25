import "./ToolBar.css"

interface ToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    sortOrder: 'name' | 'date' | 'duration';
    onSortChange: (order: 'name' | 'date' | 'duration') => void;
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
                    onChange={(e) => onSortChange(e.target.value as any)}
                    className="sort-select"
                >
                    <option value="date">Newest</option>
                    <option value="name">A-Z</option>
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