import { ArrowDownAZ, ArrowDownWideNarrow } from "lucide-react";
import type { TagSort } from "../../utils/tags";
import { t } from "../../i18n";

interface TagSortButtonProps {
    sort: TagSort;
    onChange: (sort: TagSort) => void;
}

/** Switches the order of tags: by how many tracks have them, or by name. */
export const TagSortButton = ({ sort, onChange }: TagSortButtonProps) => (
    <button
        className="sort-button"
        title={t("tags.sortHint")}
        onClick={() => onChange(sort === "count" ? "name" : "count")}
    >
        {sort === "count" ? <ArrowDownWideNarrow size={15} /> : <ArrowDownAZ size={15} />}
        <span className="sort-button-label">{sort === "count" ? t("tags.sortCount") : t("tags.sortName")}</span>
    </button>
);
