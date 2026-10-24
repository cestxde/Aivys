import "./ToolBar.css"
import { useCallback, useState } from "react";
import {
    ArrowDown, ArrowDown01, ArrowDown10, ArrowDownAZ, ArrowDownZA, ArrowUp, ArrowUpDown, Check, ChevronDown, Play, Shuffle,
} from "lucide-react";
import { ContextMenu, type MenuEntry } from "../ContextMenu/ContextMenu";
import {
    SORT_FIELDS, directionLabel, sortBy, sortLabel, type ListDisplay, type SortField, type ViewSort,
} from "../../utils/sort";
import { t } from "../../i18n";

interface ToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    sort: ViewSort;
    /** Name of the view's own order ("Playlist order", ...); null if it has none. */
    defaultLabel: string | null;
    onSortChange: (sort: ViewSort) => void;
    display: ListDisplay;
    onDisplayChange: (display: ListDisplay) => void;
    /** The current order can be split into sections. */
    canGroup: boolean;
    /** While searching, results are in relevance order. */
    sortDisabled?: boolean;
    onShuffleAll: () => void;
    onPlayAll: () => void;
}

const check = (on: boolean) => (on ? <Check size={16} /> : undefined);

/** Icon of the direction button: A–Z for text, 0–9 for numbers and dates, an arrow for a view's own order. */
const DirectionIcon = ({ sort }: { sort: ViewSort }) => {
    const info = SORT_FIELDS.find(info => info.field === sort.field);
    const asc = sort.dir === "asc";
    const Icon = !info ? (asc ? ArrowDown : ArrowUp)
        : info.text ? (asc ? ArrowDownAZ : ArrowDownZA)
        : asc ? ArrowDown01 : ArrowDown10;
    return <Icon size={17} />;
};

export const Toolbar = ({
    searchQuery,
    onSearchChange,
    sort,
    defaultLabel,
    onSortChange,
    display,
    onDisplayChange,
    canGroup,
    sortDisabled = false,
    onShuffleAll,
    onPlayAll
}: ToolbarProps) => {
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
    const closeMenu = useCallback(() => setMenuAt(null), []);

    const reverse = () => onSortChange({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" });

    // The current field shows its direction; choosing it again reverses it.
    const option = (field: SortField, label: string): MenuEntry => {
        const current = sort.field === field;
        return {
            kind: "item",
            label,
            icon: check(current),
            detail: current ? directionLabel(sort, label) : undefined,
            onSelect: () => (current ? reverse() : onSortChange(sortBy(field))),
        };
    };

    const entries: MenuEntry[] = [
        { kind: "label", label: t("toolbar.sortBy") },
        ...(defaultLabel ? [option("default", defaultLabel)] : []),
        ...SORT_FIELDS.map(info => option(info.field, t(info.label))),
        { kind: "separator" },
        {
            kind: "item",
            label: t("toolbar.groupSections"),
            icon: check(canGroup && display === "sections"),
            disabled: !canGroup,
            onSelect: () => onDisplayChange(display === "sections" ? "inline" : "sections"),
        },
    ];
    const direction = directionLabel(sort, defaultLabel ?? "");

    return (
        <div className="toolbar">
            <div className="toolbar-section left">
                <button
                    className="sort-button"
                    disabled={sortDisabled}
                    aria-haspopup="menu"
                    title={sortDisabled ? t("toolbar.relevanceHint") : t("toolbar.sortAndDisplay")}
                    // The open menu closes on outside presses; let this click toggle it instead.
                    onPointerDown={(e) => menuAt && e.stopPropagation()}
                    onClick={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        setMenuAt(menuAt ? null : { x: box.left, y: box.bottom + 4 });
                    }}
                >
                    <ArrowUpDown size={15} />
                    <span className="sort-button-label">
                        {sortDisabled ? t("toolbar.relevance") : sortLabel(sort, defaultLabel ?? "")}
                    </span>
                    <ChevronDown size={14} />
                </button>
                <button
                    className="sort-button sort-direction"
                    disabled={sortDisabled}
                    title={sortDisabled ? undefined : t("toolbar.reverseHint", { direction })}
                    aria-label={t("toolbar.direction", { direction })}
                    onClick={reverse}
                >
                    <DirectionIcon sort={sort} />
                </button>
            </div>

            <div className="toolbar-section center">
                <input
                    type="text"
                    placeholder={t("toolbar.search")}
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="toolbar-section right">
                <button
                    onClick={onShuffleAll}
                    className="toolbar-button toolbar-icon-button shuffle-button"
                    title={t("toolbar.shuffleAll")}
                    aria-label={t("toolbar.shuffleAll")}
                >
                    <Shuffle size={18} />
                </button>
                <button
                    onClick={onPlayAll}
                    className="toolbar-button toolbar-icon-button play-button"
                    title={t("common.playAll")}
                    aria-label={t("common.playAll")}
                >
                    <Play size={18} fill="currentColor" />
                </button>
            </div>

            {menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} entries={entries} onClose={closeMenu} />}
        </div>
    );
};
