import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, X } from "lucide-react";
import type { Condition, SmartRules, SortSpec } from "../../types";
import "./SmartPlaylistEditor.css";

type FieldType = "text" | "number" | "date" | "boolean" | "tag";

interface FieldDef {
    id: string;
    label: string;
    type: FieldType;
}

/** Rule fields (docs/aivys-format.md §8.4.3) in the order offered. */
const FIELDS: FieldDef[] = [
    { id: "title", label: "Title", type: "text" },
    { id: "artist", label: "Artist", type: "text" },
    { id: "album", label: "Album", type: "text" },
    { id: "albumArtist", label: "Album artist", type: "text" },
    { id: "genre", label: "Genre", type: "text" },
    { id: "year", label: "Year", type: "number" },
    { id: "rating", label: "Rating", type: "number" },
    { id: "playCount", label: "Play count", type: "number" },
    { id: "duration", label: "Duration (seconds)", type: "number" },
    { id: "addedAt", label: "Date added", type: "date" },
    { id: "lastPlayedAt", label: "Last played", type: "date" },
    { id: "favorite", label: "Favorite", type: "boolean" },
    { id: "format", label: "Format", type: "text" },
    { id: "tag", label: "Tag", type: "tag" },
];

const OPS: Record<FieldType, { id: string; label: string }[]> = {
    text: [
        { id: "contains", label: "contains" },
        { id: "eq", label: "is" },
        { id: "neq", label: "is not" },
    ],
    number: [
        { id: "gte", label: "at least" },
        { id: "lte", label: "at most" },
        { id: "eq", label: "is" },
        { id: "neq", label: "is not" },
        { id: "gt", label: "more than" },
        { id: "lt", label: "less than" },
    ],
    date: [
        { id: "gte", label: "on or after" },
        { id: "lt", label: "before" },
    ],
    boolean: [{ id: "eq", label: "is" }],
    tag: [
        { id: "eq", label: "has" },
        { id: "neq", label: "does not have" },
    ],
};

const SORT_FIELDS = [
    { id: "addedAt", label: "Date added" },
    { id: "title", label: "Title" },
    { id: "artist", label: "Artist" },
    { id: "album", label: "Album" },
    { id: "year", label: "Year" },
    { id: "rating", label: "Rating" },
    { id: "playCount", label: "Play count" },
    { id: "lastPlayedAt", label: "Last played" },
    { id: "duration", label: "Duration" },
];

const fieldDef = (id: string): FieldDef => FIELDS.find(f => f.id === id) ?? FIELDS[0];

const defaultValue = (type: FieldType, tags: { id: string }[]): Condition["value"] => {
    switch (type) {
        case "number": return 0;
        case "date": return Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
        case "boolean": return true;
        case "tag": return tags[0]?.id ?? "";
        default: return "";
    }
};

/** Unix seconds <-> the yyyy-mm-dd value of a date input (local time). */
const toDateInput = (unix: number): string => {
    const date = new Date(unix * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const fromDateInput = (value: string): number => Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000);

export interface TagOption {
    id: string;
    name: string;
}

interface SmartPlaylistEditorProps {
    title: string;
    initialName: string;
    initialRules?: SmartRules;
    tags: TagOption[];
    onSave: (name: string, rules: SmartRules) => void;
    onClose: () => void;
}

/** Modal editor for a smart playlist's name and rules, with a live match count. */
export const SmartPlaylistEditor = ({ title, initialName, initialRules, tags, onSave, onClose }: SmartPlaylistEditorProps) => {
    const [name, setName] = useState(initialName);
    const [match, setMatch] = useState<SmartRules["match"]>(initialRules?.match ?? "all");
    const [conditions, setConditions] = useState<Condition[]>(
        initialRules?.conditions ?? [{ field: "genre", op: "contains", value: "" }]
    );
    const [sort, setSort] = useState<SortSpec>(initialRules?.sort ?? { field: "addedAt", dir: "desc" });
    const [limit, setLimit] = useState<number | null>(initialRules?.limit ?? null);
    const [preview, setPreview] = useState<{ key: string; count: number } | null>(null);

    const rules: SmartRules = { match, conditions, sort, limit };
    const rulesKey = JSON.stringify(rules);

    // Live preview of how many tracks match, debounced while editing.
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            invoke<string[]>("preview_smart_playlist", { rules: JSON.parse(rulesKey) })
                .then(paths => {
                    if (!cancelled) setPreview({ key: rulesKey, count: paths.length });
                })
                .catch(() => {
                    if (!cancelled) setPreview(null);
                });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [rulesKey]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const updateCondition = (index: number, change: Partial<Condition>) =>
        setConditions(prev => prev.map((c, i) => (i === index ? { ...c, ...change } : c)));

    const changeField = (index: number, fieldId: string) => {
        const type = fieldDef(fieldId).type;
        updateCondition(index, { field: fieldId, op: OPS[type][0].id, value: defaultValue(type, tags) });
    };

    const renderValue = (condition: Condition, index: number) => {
        const type = fieldDef(condition.field).type;
        switch (type) {
            case "number":
                return (
                    <input
                        type="number"
                        className="rule-input"
                        value={Number(condition.value)}
                        min={0}
                        max={condition.field === "rating" ? 5 : undefined}
                        onChange={(e) => updateCondition(index, { value: Number(e.target.value) })}
                    />
                );
            case "date":
                return (
                    <input
                        type="date"
                        className="rule-input"
                        value={toDateInput(Number(condition.value))}
                        onChange={(e) => e.target.value && updateCondition(index, { value: fromDateInput(e.target.value) })}
                    />
                );
            case "boolean":
                return (
                    <select
                        className="rule-input"
                        value={condition.value ? "yes" : "no"}
                        onChange={(e) => updateCondition(index, { value: e.target.value === "yes" })}
                    >
                        <option value="yes">yes</option>
                        <option value="no">no</option>
                    </select>
                );
            case "tag":
                return (
                    <select
                        className="rule-input"
                        value={String(condition.value)}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                    >
                        {tags.length === 0 && <option value="">No tags yet</option>}
                        {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                    </select>
                );
            default:
                return (
                    <input
                        type="text"
                        className="rule-input"
                        value={String(condition.value)}
                        placeholder="text"
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                    />
                );
        }
    };

    const canSave = name.trim() !== "";
    const count = preview && preview.key === rulesKey ? preview.count : null;

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="editor" role="dialog" aria-label={title}>
                <h2 className="editor-title">{title}</h2>

                <label className="editor-field">
                    <span>Name</span>
                    <input
                        className="rule-input editor-name"
                        value={name}
                        autoFocus
                        onChange={(e) => setName(e.target.value)}
                    />
                </label>

                <div className="editor-match">
                    Match
                    <select className="rule-input" value={match} onChange={(e) => setMatch(e.target.value as SmartRules["match"])}>
                        <option value="all">all</option>
                        <option value="any">any</option>
                    </select>
                    of the following rules:
                </div>

                <div className="editor-rules">
                    {conditions.map((condition, index) => (
                        <div key={index} className="rule-row">
                            <select
                                className="rule-input"
                                value={condition.field}
                                onChange={(e) => changeField(index, e.target.value)}
                            >
                                {FIELDS.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
                            </select>
                            <select
                                className="rule-input"
                                value={condition.op}
                                onChange={(e) => updateCondition(index, { op: e.target.value })}
                            >
                                {OPS[fieldDef(condition.field).type].map(op => (
                                    <option key={op.id} value={op.id}>{op.label}</option>
                                ))}
                            </select>
                            {renderValue(condition, index)}
                            <button
                                className="rule-remove"
                                title="Remove rule"
                                onClick={() => setConditions(prev => prev.filter((_, i) => i !== index))}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    {conditions.length === 0 && <div className="editor-hint">No rules: every track matches.</div>}
                    <button
                        className="editor-add"
                        onClick={() => setConditions(prev => [...prev, { field: "title", op: "contains", value: "" }])}
                    >
                        <Plus size={14} /> Add rule
                    </button>
                </div>

                <div className="editor-sort">
                    <span>Sort by</span>
                    <select className="rule-input" value={sort.field} onChange={(e) => setSort({ ...sort, field: e.target.value })}>
                        {SORT_FIELDS.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
                    </select>
                    <select className="rule-input" value={sort.dir} onChange={(e) => setSort({ ...sort, dir: e.target.value as SortSpec["dir"] })}>
                        <option value="desc">descending</option>
                        <option value="asc">ascending</option>
                    </select>
                    <label className="editor-limit">
                        <input
                            type="checkbox"
                            checked={limit !== null}
                            onChange={(e) => setLimit(e.target.checked ? 100 : null)}
                        />
                        Limit to
                        <input
                            type="number"
                            className="rule-input limit-input"
                            min={1}
                            disabled={limit === null}
                            value={limit ?? 100}
                            onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
                        />
                        tracks
                    </label>
                </div>

                <div className="editor-footer">
                    <span className="editor-preview">
                        {count === null ? "Counting…" : `${count} ${count === 1 ? "track matches" : "tracks match"}`}
                    </span>
                    <button className="editor-button" onClick={onClose}>Cancel</button>
                    <button
                        className="editor-button primary"
                        disabled={!canSave}
                        onClick={() => onSave(name.trim(), rules)}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
