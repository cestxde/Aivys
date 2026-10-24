import { useEffect, useRef, useState } from "react";
import { Copy, ImagePlus, Trash2, X } from "lucide-react";
import type { Track } from "../../types";
import { CoverArt } from "../CoverArt";
import { t, type MessageKey } from "../../i18n";
import "./MetadataEditor.css";

const TEXT_FIELDS = ["title", "artist", "album", "albumArtist", "genre"] as const;
const NUMBER_FIELDS = ["year", "trackNumber", "trackTotal", "discNumber"] as const;
type TextField = typeof TEXT_FIELDS[number];
type NumberField = typeof NUMBER_FIELDS[number];
type Field = TextField | NumberField;

/**
 * What to change in the tags, as the backend takes it: an absent field is
 * kept, `null` clears it. `cover` is the new image's bytes (base64).
 */
export type MetadataEdit = Partial<Record<TextField, string | null> & Record<NumberField, number | null>> & {
    cover?: string | null;
};

const LABELS: Record<Field, MessageKey> = {
    title: "edit.title",
    artist: "edit.artist",
    album: "edit.album",
    albumArtist: "edit.albumArtist",
    genre: "edit.genre",
    year: "edit.year",
    trackNumber: "edit.trackNumber",
    trackTotal: "edit.trackTotal",
    discNumber: "edit.discNumber",
};

/** A field's value in a track's tags, as the editor shows it. */
const valueOf = (track: Track, field: Field): string => {
    switch (field) {
        case "title": return track.title ?? "";
        case "artist": return track.artistLine;
        case "album": return track.album ?? "";
        case "albumArtist": return track.albumArtist ?? "";
        case "genre": return track.genre.join("; ");
        default: return track[field]?.toString() ?? "";
    }
};

type Cover = { kind: "keep" } | { kind: "set"; data: string; url: string } | { kind: "remove" };

const readBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    // "data:image/png;base64,...": the part after the comma.
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

interface MetadataEditorProps {
    tracks: Track[];
    /** Write the changes; resolves once done (the dialog then closes). */
    onSave: (edit: MetadataEdit) => Promise<void>;
    onClose: () => void;
}

/**
 * Edit the tags of one or more tracks. With several, a field whose value
 * differs between them shows so, and only fields that were changed are
 * written.
 */
export const MetadataEditor = ({ tracks, onSave, onClose }: MetadataEditorProps) => {
    const fields: Field[] = [...TEXT_FIELDS, ...NUMBER_FIELDS];
    const [initial] = useState(() => {
        const values = {} as Record<Field, string>;
        const mixed = new Set<Field>();
        for (const field of fields) {
            const all = new Set(tracks.map(track => valueOf(track, field)));
            values[field] = all.size === 1 ? [...all][0] : "";
            if (all.size > 1) mixed.add(field);
        }
        return { values, mixed };
    });
    const [values, setValues] = useState(initial.values);
    const [changed, setChanged] = useState<Set<Field>>(new Set());
    const [cover, setCover] = useState<Cover>({ kind: "keep" });
    const [saving, setSaving] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !saving) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, saving]);

    // The picked image is shown from memory until the dialog closes.
    useEffect(() => () => {
        if (cover.kind === "set") URL.revokeObjectURL(cover.url);
    }, [cover]);

    const single = tracks.length === 1 ? tracks[0] : null;
    const covers = new Set(tracks.map(track => track.coverPath ?? ""));
    const shownCover = cover.kind === "keep" ? (covers.size === 1 ? tracks[0].coverPath : null) : null;

    const set = (field: Field, value: string) => {
        const next = (NUMBER_FIELDS as readonly string[]).includes(field) ? value.replace(/\D/g, "").slice(0, 4) : value;
        setValues(prev => ({ ...prev, [field]: next }));
        setChanged(prev => new Set(prev).add(field));
    };

    const pickCover = async (file: File | undefined) => {
        if (!file) return;
        const data = await readBase64(file);
        setCover({ kind: "set", data, url: URL.createObjectURL(file) });
    };

    const edit = (): MetadataEdit => {
        const result: MetadataEdit = {};
        for (const field of changed) {
            const value = values[field].trim();
            if ((TEXT_FIELDS as readonly string[]).includes(field)) {
                (result as Record<string, string | null>)[field] = value === "" ? null : value;
            } else {
                (result as Record<string, number | null>)[field] = value === "" ? null : Number(value);
            }
        }
        if (cover.kind === "set") result.cover = cover.data;
        if (cover.kind === "remove") result.cover = null;
        return result;
    };
    const hasChanges = changed.size > 0 || cover.kind !== "keep";

    const save = async () => {
        if (!hasChanges || saving) return;
        setSaving(true);
        try {
            await onSave(edit());
        } finally {
            setSaving(false);
        }
    };

    const input = (field: Field, className = "") => (
        <label key={field} className={`editor-field metadata-field ${className}`}>
            {t(LABELS[field])}
            <input
                className="rule-input"
                value={values[field]}
                inputMode={(NUMBER_FIELDS as readonly string[]).includes(field) ? "numeric" : undefined}
                placeholder={initial.mixed.has(field) && !changed.has(field)
                    ? t("edit.mixed")
                    : field === "title" && single ? single.name : undefined}
                autoFocus={field === "title"}
                disabled={saving}
                onChange={(e) => set(field, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
            />
        </label>
    );

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
            <div className="metadata-editor" role="dialog" aria-label={t("edit.heading")}>
                <div className="tag-dialog-header">
                    <h2>
                        {single ? t("edit.heading") : t("edit.headingMany", { count: tracks.length })}
                    </h2>
                    <button className="add-to-close" title={t("common.close")} disabled={saving} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {single && (
                    // The file name often holds the details: there to copy from.
                    <div className="metadata-file">
                        <span className="metadata-file-label">{t("edit.file")}</span>
                        <span className="metadata-file-name">{single.name}</span>
                        <button
                            className="metadata-file-copy"
                            title={t("edit.copyName")}
                            onClick={() => navigator.clipboard.writeText(single.name).catch(console.error)}
                        >
                            <Copy size={13} />
                        </button>
                    </div>
                )}

                <div className="metadata-body">
                    <div className="metadata-cover">
                        {cover.kind === "set"
                            ? <img src={cover.url} alt="" className="metadata-cover-image" />
                            : <CoverArt path={shownCover} size={120} className="metadata-cover-image" />}
                        {cover.kind === "keep" && covers.size > 1 && (
                            <span className="metadata-cover-note">{t("edit.mixedCovers")}</span>
                        )}
                        {cover.kind === "remove" && <span className="metadata-cover-note">{t("edit.coverRemoved")}</span>}
                        <div className="metadata-cover-actions">
                            <button className="editor-button" disabled={saving} onClick={() => fileInput.current?.click()}>
                                <ImagePlus size={14} /> {t("edit.coverReplace")}
                            </button>
                            <button
                                className="editor-button"
                                disabled={saving || cover.kind === "remove" || (cover.kind === "keep" && covers.size === 1 && !tracks[0].coverPath)}
                                onClick={() => setCover({ kind: "remove" })}
                            >
                                <Trash2 size={14} /> {t("edit.coverRemove")}
                            </button>
                        </div>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/png,image/jpeg,image/gif,image/bmp"
                            hidden
                            onChange={(e) => {
                                pickCover(e.target.files?.[0]);
                                e.target.value = "";
                            }}
                        />
                    </div>

                    <div className="metadata-fields">
                        {TEXT_FIELDS.map(field => input(field))}
                        <div className="metadata-numbers">
                            {NUMBER_FIELDS.map(field => input(field, "metadata-number"))}
                        </div>
                    </div>
                </div>

                <div className="editor-footer">
                    <span className="editor-preview">{t("edit.writesFiles")}</span>
                    <button className="editor-button" disabled={saving} onClick={onClose}>{t("common.cancel")}</button>
                    <button className="editor-button primary" disabled={!hasChanges || saving} onClick={save}>
                        {saving ? t("edit.saving") : t("common.save")}
                    </button>
                </div>
            </div>
        </div>
    );
};
