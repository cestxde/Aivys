import { useEffect, useState, type CSSProperties } from "react";
import { Check, Pipette, X } from "lucide-react";
import type { UserTag } from "../../types";
import { TAG_COLORS } from "../../utils/tags";
import { TagChip } from "../TagChip/TagChip";
import "./TagDialog.css";

interface TagDialogProps {
    /** The tag being edited, or null to create one. */
    tag: UserTag | null;
    initialColor: string;
    /** All tags, to reject a name another tag already has. */
    tags: UserTag[];
    onSave: (name: string, color: string) => void;
    onClose: () => void;
}

/** Create or edit a tag: its name and a color (preset or custom). */
export const TagDialog = ({ tag, initialColor, tags, onSave, onClose }: TagDialogProps) => {
    const [name, setName] = useState(tag?.name ?? "");
    const [color, setColor] = useState(tag?.color ?? initialColor);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const trimmed = name.trim();
    // Smart-playlist rules can match tags by name, so names stay unique.
    const taken = tags.some(t => t.id !== tag?.id && t.name.toLowerCase() === trimmed.toLowerCase());
    const valid = trimmed !== "" && !taken;
    const custom = !TAG_COLORS.includes(color);

    const save = () => {
        if (valid) onSave(trimmed, color);
    };

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="tag-dialog" role="dialog" aria-label={tag ? "Edit tag" : "New tag"}>
                <div className="tag-dialog-header">
                    <h2>{tag ? "Edit tag" : "New tag"}</h2>
                    <button className="add-to-close" title="Close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <label className="editor-field">
                    Name
                    <input
                        className="rule-input editor-name"
                        value={name}
                        autoFocus
                        placeholder="e.g. Chill"
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && save()}
                    />
                    {taken && <span className="tag-dialog-error">A tag with this name already exists.</span>}
                </label>

                <div className="editor-field">
                    Color
                    <div className="tag-swatches" role="radiogroup" aria-label="Color">
                        {TAG_COLORS.map(preset => (
                            <button
                                key={preset}
                                className={`tag-swatch ${preset === color ? "selected" : ""}`}
                                style={{ "--tag-color": preset } as CSSProperties}
                                role="radio"
                                aria-checked={preset === color}
                                title={preset}
                                onClick={() => setColor(preset)}
                            >
                                {preset === color && <Check size={14} />}
                            </button>
                        ))}
                        <label
                            className={`tag-swatch tag-swatch-custom ${custom ? "selected" : ""}`}
                            style={custom ? { "--tag-color": color } as CSSProperties : undefined}
                            title="Custom color"
                        >
                            {custom ? <Check size={14} /> : <Pipette size={14} />}
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value.toLowerCase())}
                            />
                        </label>
                    </div>
                </div>

                <div className="tag-dialog-preview">
                    <TagChip tag={{ id: "", name: trimmed || "Tag", color, createdAt: 0, updatedAt: 0 }} />
                </div>

                <div className="editor-footer">
                    <span className="editor-preview" />
                    <button className="editor-button" onClick={onClose}>Cancel</button>
                    <button className="editor-button primary" disabled={!valid} onClick={save}>
                        {tag ? "Save" : "Create"}
                    </button>
                </div>
            </div>
        </div>
    );
};
