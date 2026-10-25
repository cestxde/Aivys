import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import type { Track, TrackStats, UserTag } from "../../types";
import { displayTitle } from "../../utils/track";
import { TagDot } from "../TagChip/TagChip";
import { t } from "../../i18n";
import "./TagPicker.css";

interface TagPickerProps {
    tracks: Track[];
    tags: UserTag[];
    stats: Record<string, TrackStats>;
    /** Assign the tag to all `tracks`, or remove it from all of them. */
    onToggle: (tag: UserTag, assigned: boolean) => void;
    /** Create a tag named `name` and assign it. */
    onCreate: (name: string) => void;
    onClose: () => void;
}

/** How well `name` matches the typed `query` (lower case): lower is closer. */
const closeness = (name: string, query: string) => {
    const lower = name.toLowerCase();
    if (lower === query) return 0;
    if (lower.startsWith(query)) return 1;
    if (lower.split(/\s+/).some(word => word.startsWith(query))) return 2;
    return 3;
};

/**
 * "Tags…" for one or more tracks: a filterable checklist, where every click
 * is saved at once. Typing filters the tags, closest first, and highlights
 * the closest one; with no tag found, "Create" (always first) is highlighted
 * instead. Enter applies the highlighted row and clears the field for the
 * next name; the arrow keys move the highlight.
 */
export const TagPicker = ({ tracks, tags, stats, onToggle, onCreate, onClose }: TagPickerProps) => {
    const [filter, setFilter] = useState("");
    // The highlighted row, for the query it was chosen at: a new query
    // highlights its closest row again.
    const [picked, setPicked] = useState<{ query: string; index: number } | null>(null);
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const query = filter.trim();
    const lower = query.toLowerCase();
    const shown = lower
        ? tags
            .filter(tag => tag.name.toLowerCase().includes(lower))
            .map(tag => ({ tag, rank: closeness(tag.name, lower) }))
            .sort((a, b) => a.rank - b.rank)
            .map(({ tag }) => tag)
        : tags;
    const canCreate = query !== "" && !tags.some(tag => tag.name.toLowerCase() === lower);

    /** How many of the tracks have the tag. */
    const countOf = (tag: UserTag) =>
        tracks.filter(track => stats[track.relPath]?.tags.includes(tag.id)).length;

    // The rows Enter and the arrows go through: "Create" first, then the tags.
    const rowCount = (canCreate ? 1 : 0) + shown.length;
    const closest = query === "" ? -1 : canCreate && shown.length > 0 ? 1 : 0;
    const highlighted = picked?.query === query ? Math.min(picked.index, rowCount - 1) : closest;
    const tagAt = (index: number) => shown[index - (canCreate ? 1 : 0)];

    const subject = tracks.length === 1 ? displayTitle(tracks[0]) : t("common.tracks", { count: tracks.length });

    const create = () => {
        if (!canCreate) return;
        onCreate(query);
        setFilter("");
    };

    const toggle = (tag: UserTag) => onToggle(tag, countOf(tag) < tracks.length);

    const apply = () => {
        if (highlighted < 0) return;
        if (canCreate && highlighted === 0) {
            create();
            return;
        }
        toggle(tagAt(highlighted));
        setFilter("");
    };

    const move = (step: number) => {
        if (rowCount === 0) return;
        const from = highlighted < 0 ? (step > 0 ? -1 : rowCount) : highlighted;
        setPicked({ query, index: (from + step + rowCount) % rowCount });
    };

    useLayoutEffect(() => {
        list.current?.querySelector(".highlighted")?.scrollIntoView({ block: "nearest" });
    }, [highlighted, query]);

    const rowProps = (index: number) => ({
        onPointerMove: () => {
            if (highlighted !== index) setPicked({ query, index });
        },
    });

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="add-to-dialog" role="dialog" aria-label={t("tagPicker.title")}>
                <div className="add-to-header">
                    <div className="add-to-heading">
                        <h2>{t("tagPicker.title")}</h2>
                        <span className="add-to-subject">{subject}</span>
                    </div>
                    <button className="add-to-close" title={t("common.close")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <input
                    className="search-input"
                    placeholder={tags.length > 0 ? t("tagPicker.find") : t("tagPicker.nameNew")}
                    value={filter}
                    autoFocus
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") apply();
                        else if (e.key === "ArrowDown") move(1);
                        else if (e.key === "ArrowUp") move(-1);
                        else return;
                        e.preventDefault();
                    }}
                />

                <div className="add-to-list tag-picker-list" ref={list}>
                    {canCreate && (
                        <button
                            className={`add-to-row tag-picker-row ${highlighted === 0 ? "highlighted" : ""}`}
                            onClick={create}
                            {...rowProps(0)}
                        >
                            <span className="tag-picker-check"><Plus size={14} /></span>
                            <span className="add-to-row-name">{t("tagPicker.create", { name: query })}</span>
                        </button>
                    )}

                    {shown.map((tag, i) => {
                        const index = i + (canCreate ? 1 : 0);
                        const count = countOf(tag);
                        const all = count > 0 && count === tracks.length;
                        const state = all ? "on" : count > 0 ? "mixed" : "off";
                        return (
                            <button
                                key={tag.id}
                                className={`add-to-row tag-picker-row ${state} ${highlighted === index ? "highlighted" : ""}`}
                                role="checkbox"
                                aria-checked={all ? true : count > 0 ? "mixed" : false}
                                onClick={() => toggle(tag)}
                                {...rowProps(index)}
                            >
                                <span className="tag-picker-check">
                                    {all && <Check size={14} />}
                                    {state === "mixed" && <Minus size={14} />}
                                </span>
                                <TagDot color={tag.color} size={12} />
                                <span className="add-to-row-name">{tag.name}</span>
                                {state === "mixed" && (
                                    <span className="add-to-row-meta">{t("tagPicker.partial", { count, total: tracks.length })}</span>
                                )}
                            </button>
                        );
                    })}

                    {tags.length === 0 && !canCreate && (
                        <div className="add-to-empty">{t("tagPicker.empty")}</div>
                    )}
                    {tags.length > 0 && shown.length === 0 && !canCreate && (
                        <div className="add-to-empty">{t("tagPicker.noMatch")}</div>
                    )}
                </div>
            </div>
        </div>
    );
};
