import { useEffect, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import type { Track, TrackStats, UserTag } from "../../types";
import { displayTitle } from "../../utils/track";
import { TagDot } from "../TagChip/TagChip";
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

/**
 * "Tags…" for one or more tracks: a filterable checklist, where every click
 * is saved at once. Typing a name no tag has offers to create it.
 */
export const TagPicker = ({ tracks, tags, stats, onToggle, onCreate, onClose }: TagPickerProps) => {
    const [filter, setFilter] = useState("");

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const query = filter.trim();
    const lower = query.toLowerCase();
    const shown = tags.filter(tag => !lower || tag.name.toLowerCase().includes(lower));
    const canCreate = query !== "" && !tags.some(tag => tag.name.toLowerCase() === lower);

    /** How many of the tracks have the tag. */
    const countOf = (tag: UserTag) =>
        tracks.filter(track => stats[track.relPath]?.tags.includes(tag.id)).length;

    const subject = tracks.length === 1 ? displayTitle(tracks[0]) : `${tracks.length} tracks`;

    const create = () => {
        if (!canCreate) return;
        onCreate(query);
        setFilter("");
    };

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="add-to-dialog" role="dialog" aria-label="Tags">
                <div className="add-to-header">
                    <div className="add-to-heading">
                        <h2>Tags</h2>
                        <span className="add-to-subject">{subject}</span>
                    </div>
                    <button className="add-to-close" title="Close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <input
                    className="search-input"
                    placeholder={tags.length > 0 ? "Find or create a tag..." : "Name a new tag..."}
                    value={filter}
                    autoFocus
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (canCreate) create();
                        else if (shown.length === 1) onToggle(shown[0], countOf(shown[0]) < tracks.length);
                    }}
                />

                <div className="add-to-list tag-picker-list">
                    {canCreate && (
                        <button className="add-to-row tag-picker-row" onClick={create}>
                            <span className="tag-picker-check"><Plus size={14} /></span>
                            <span className="add-to-row-name">Create tag “{query}”</span>
                        </button>
                    )}

                    {shown.map(tag => {
                        const count = countOf(tag);
                        const all = count > 0 && count === tracks.length;
                        const state = all ? "on" : count > 0 ? "mixed" : "off";
                        return (
                            <button
                                key={tag.id}
                                className={`add-to-row tag-picker-row ${state}`}
                                role="checkbox"
                                aria-checked={all ? true : count > 0 ? "mixed" : false}
                                onClick={() => onToggle(tag, !all)}
                            >
                                <span className="tag-picker-check">
                                    {all && <Check size={14} />}
                                    {state === "mixed" && <Minus size={14} />}
                                </span>
                                <TagDot color={tag.color} size={12} />
                                <span className="add-to-row-name">{tag.name}</span>
                                {state === "mixed" && (
                                    <span className="add-to-row-meta">{count} of {tracks.length}</span>
                                )}
                            </button>
                        );
                    })}

                    {tags.length === 0 && !canCreate && (
                        <div className="add-to-empty">No tags yet. Type a name to create one.</div>
                    )}
                    {tags.length > 0 && shown.length === 0 && !canCreate && (
                        <div className="add-to-empty">No tags match.</div>
                    )}
                </div>

                <div className="tag-picker-footer">
                    <button className="editor-button primary" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};
