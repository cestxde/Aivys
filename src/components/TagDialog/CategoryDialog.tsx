import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { TagCategory } from "../../types";
import { t } from "../../i18n";
import "./TagDialog.css";

interface CategoryDialogProps {
    /** The category being renamed, or null to create one. */
    category: TagCategory | null;
    /** All categories, to reject a name another one already has. */
    categories: TagCategory[];
    onSave: (name: string) => void;
    onClose: () => void;
}

/** Create or rename a tag category. */
export const CategoryDialog = ({ category, categories, onSave, onClose }: CategoryDialogProps) => {
    const [name, setName] = useState(category?.name ?? "");

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const trimmed = name.trim();
    const taken = categories.some(c => c.id !== category?.id && c.name.toLowerCase() === trimmed.toLowerCase());
    const valid = trimmed !== "" && !taken;
    const heading = category ? t("categoryDialog.rename") : t("categoryDialog.new");

    const save = () => {
        if (valid) onSave(trimmed);
    };

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="tag-dialog" role="dialog" aria-label={heading}>
                <div className="tag-dialog-header">
                    <h2>{heading}</h2>
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
                        placeholder={t("categoryDialog.namePlaceholder")}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && save()}
                    />
                    {taken && <span className="tag-dialog-error">{t("categoryDialog.nameTaken")}</span>}
                </label>

                <div className="editor-footer">
                    <span className="editor-preview" />
                    <button className="editor-button" onClick={onClose}>{t("common.cancel")}</button>
                    <button className="editor-button primary" disabled={!valid} onClick={save}>
                        {category ? t("common.save") : t("common.create")}
                    </button>
                </div>
            </div>
        </div>
    );
};
