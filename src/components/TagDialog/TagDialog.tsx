import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Pipette, Plus, X } from "lucide-react";
import type { TagCategory, UserTag } from "../../types";
import { TAG_COLORS } from "../../utils/tags";
import { TagChip } from "../TagChip/TagChip";
import { t } from "../../i18n";
import "./TagDialog.css";

interface TagDialogProps {
    /** The tag being edited, or null to create one. */
    tag: UserTag | null;
    initialColor: string;
    /** The categories a new tag starts in. */
    initialCategoryIds?: string[];
    /** The name a new tag starts with (typed in the tag picker). */
    initialName?: string;
    /** All tags, to reject a name another tag already has. */
    tags: UserTag[];
    categories: TagCategory[];
    onSave: (name: string, color: string, categoryIds: string[]) => void;
    /** Create a category from the dialog (it is then selected). */
    onCreateCategory: (name: string) => Promise<TagCategory | null>;
    onClose: () => void;
}

/** Create or edit a tag: its name, a color (preset or custom) and its categories. */
export const TagDialog = ({ tag, initialColor, initialCategoryIds = [], initialName = "", tags, categories, onSave, onCreateCategory, onClose }: TagDialogProps) => {
    const [name, setName] = useState(tag?.name ?? initialName);
    const [color, setColor] = useState(tag?.color ?? initialColor);
    const [categoryIds, setCategoryIds] = useState(tag?.categoryIds ?? initialCategoryIds);
    // The name of a category being created here, or null.
    const [newCategory, setNewCategory] = useState<string | null>(null);
    // Escape leaves the new category's field without creating it.
    const discardCategory = useRef(false);

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
        if (valid) onSave(trimmed, color, categories.flatMap(c => (categoryIds.includes(c.id) ? [c.id] : [])));
    };

    const toggleCategory = (id: string) =>
        setCategoryIds(ids => (ids.includes(id) ? ids.filter(other => other !== id) : [...ids, id]));

    // Leaving the field creates the category (Enter leaves it too).
    const createCategory = async () => {
        const name = discardCategory.current ? "" : newCategory?.trim() ?? "";
        discardCategory.current = false;
        setNewCategory(null);
        if (!name) return;
        const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
        const category = existing ?? await onCreateCategory(name);
        if (category) setCategoryIds(ids => (ids.includes(category.id) ? ids : [...ids, category.id]));
    };

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="tag-dialog" role="dialog" aria-label={tag ? t("tagDialog.edit") : t("tagDialog.new")}>
                <div className="tag-dialog-header">
                    <h2>{tag ? t("tagDialog.edit") : t("tagDialog.new")}</h2>
                    <button className="add-to-close" title={t("common.close")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <label className="editor-field">
                    {t("tagDialog.name")}
                    <input
                        className="rule-input editor-name"
                        value={name}
                        autoFocus
                        placeholder={t("tagDialog.namePlaceholder")}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && save()}
                    />
                    {taken && <span className="tag-dialog-error">{t("tagDialog.nameTaken")}</span>}
                </label>

                <div className="editor-field">
                    {t("tagDialog.color")}
                    <div className="tag-swatches" role="radiogroup" aria-label={t("tagDialog.color")}>
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
                            title={t("tagDialog.customColor")}
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

                <div className="editor-field">
                    {t("tagDialog.categories")}
                    <div className="tag-category-options" role="group" aria-label={t("tagDialog.categories")}>
                        {categories.map(category => {
                            const on = categoryIds.includes(category.id);
                            return (
                                <button
                                    key={category.id}
                                    className={`tag-category-option ${on ? "selected" : ""}`}
                                    role="checkbox"
                                    aria-checked={on}
                                    onClick={() => toggleCategory(category.id)}
                                >
                                    {on && <Check size={13} />}
                                    {category.name}
                                </button>
                            );
                        })}
                        {newCategory === null ? (
                            <button className="tag-category-option add" onClick={() => setNewCategory("")}>
                                <Plus size={13} /> {t("tagDialog.newCategory")}
                            </button>
                        ) : (
                            <input
                                className="tag-category-input"
                                value={newCategory}
                                autoFocus
                                placeholder={t("categoryDialog.namePlaceholder")}
                                onChange={(e) => setNewCategory(e.target.value)}
                                onBlur={createCategory}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") discardCategory.current = true;
                                    else if (e.key !== "Enter") return;
                                    e.currentTarget.blur();
                                    // Not the dialog's Enter (save) and Escape (close).
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                            />
                        )}
                    </div>
                </div>

                <div className="tag-dialog-preview">
                    <TagChip tag={{ id: "", name: trimmed || t("tagDialog.previewName"), color, createdAt: 0, updatedAt: 0 }} />
                </div>

                <div className="editor-footer">
                    <span className="editor-preview" />
                    <button className="editor-button" onClick={onClose}>{t("common.cancel")}</button>
                    <button className="editor-button primary" disabled={!valid} onClick={save}>
                        {tag ? t("common.save") : t("common.create")}
                    </button>
                </div>
            </div>
        </div>
    );
};
