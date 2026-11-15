import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Trash2, X } from "lucide-react";
import type { Track } from "../../types";
import { CoverArt } from "../CoverArt";
import { t } from "../../i18n";
import "./MetadataEditor.css";
import { useBackLayer } from "../../hooks/useBackLayer";
import { clipboardImage, cropImage, pastedImage } from "../../utils/image";
import { cropToSquare } from "../../utils/coverCrop";
import {
	coverUrlFromData,
	metadataDraftId,
	readDraft,
	writeDraft,
	type MetadataDraftPayload,
} from "../../utils/editorDrafts";
import { fileNameFromTags } from "../../utils/fileName";
import { notifyError, notifyInfo } from "../../utils/notify";
import { useStoredState } from "../../hooks/useRemembered";
import {
	NUMBER_FIELDS, TEXT_FIELDS, METADATA_LABELS, valueOf, type Cover, type FilePanel, type MetadataEdit, type MetadataField,
} from "./metadataEditorTypes";
import { MetadataEditorFileBlock } from "./MetadataEditorFileBlock";

export type { MetadataEdit } from "./metadataEditorTypes";

interface MetadataEditorProps {
	tracks: Track[];
	onSave: (edit: MetadataEdit) => Promise<void>;
	onRename?: (name: string) => Promise<void>;
	onRenameMany?: () => Promise<void>;
	onFillMany?: () => Promise<void>;
	onClose: () => void;
}

const restoreCover = (cover: MetadataDraftPayload["cover"]): Cover => {
	if (cover.kind === "set") {
		const url = coverUrlFromData(cover.data);
		return url ? { kind: "set", data: cover.data, url } : { kind: "keep" };
	}
	return cover;
};

export const MetadataEditor = ({
	tracks, onSave, onRename, onRenameMany, onFillMany, onClose,
}: MetadataEditorProps) => {
	useBackLayer(true, onClose);
	const fields: MetadataField[] = [...TEXT_FIELDS, ...NUMBER_FIELDS];
	const draftId = metadataDraftId(tracks.map(track => track.path));
	const boot = useMemo(() => {
		const values = {} as Record<MetadataField, string>;
		const mixed = new Set<MetadataField>();
		for (const field of fields) {
			const all = new Set(tracks.map(track => valueOf(track, field)));
			values[field] = all.size === 1 ? [...all][0] : "";
			if (all.size > 1) mixed.add(field);
		}
		const draft = readDraft<MetadataDraftPayload>("metadata", draftId);
		if (!draft) {
			return { restored: false as const, values, mixed, changed: new Set<MetadataField>(), cover: { kind: "keep" } as Cover };
		}
		const nextValues = { ...values };
		for (const field of fields) {
			if (draft.values[field] !== undefined) nextValues[field] = draft.values[field];
		}
		const changed = new Set(
			draft.changed.filter((field): field is MetadataField =>
				(fields as string[]).includes(field),
			),
		);
		return {
			restored: true as const,
			values: nextValues,
			mixed,
			changed,
			cover: restoreCover(draft.cover),
		};
	}, [draftId, tracks]);

	const [values, setValues] = useState(boot.values);
	const [changed, setChanged] = useState(boot.changed);
	const [cover, setCover] = useState<Cover>(boot.cover);
	const mixed = boot.mixed;
	const [saving, setSaving] = useState(false);
	const [picking, setPicking] = useState(false);
	const [filePanel, setFilePanel] = useState<FilePanel>(null);
	const [renameName, setRenameName] = useState("");
	const [renaming, setRenaming] = useState(false);
	const [fillPick, setFillPick] = useState(0);
	const [skipMultiWarn, setSkipMultiWarn] = useStoredState(
		"edit.skipMultiFileWarn",
		false,
		(value): value is boolean => typeof value === "boolean",
	);
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const restoredToast = useRef(boot.restored);

	useEffect(() => {
		if (!restoredToast.current) return;
		restoredToast.current = false;
		notifyInfo(t("draft.restored"));
	}, []);

	useEffect(() => {
		if (saving) return;
		const timer = window.setTimeout(() => {
			const payload: MetadataDraftPayload = {
				values,
				changed: [...changed],
				cover: cover.kind === "set"
					? { kind: "set", data: cover.data }
					: cover.kind === "remove"
						? { kind: "remove" }
						: { kind: "keep" },
			};
			writeDraft("metadata", draftId, payload);
		}, 400);
		return () => window.clearTimeout(timer);
	}, [saving, draftId, values, changed, cover]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !saving) onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose, saving]);

	useEffect(() => () => {
		if (cover.kind === "set") URL.revokeObjectURL(cover.url);
	}, [cover]);

	const single = tracks.length === 1 ? tracks[0] : null;
	const covers = new Set(tracks.map(track => track.coverPath ?? ""));
	const shownCover = cover.kind === "keep" ? (covers.size === 1 ? tracks[0].coverPath : null) : null;

	const set = (field: MetadataField, value: string) => {
		const next = (NUMBER_FIELDS as readonly string[]).includes(field) ? value.replace(/\D/g, "").slice(0, 4) : value;
		setValues(prev => ({ ...prev, [field]: next }));
		setChanged(prev => new Set(prev).add(field));
	};

	const openRename = () => {
		if (single) {
			setRenameName(fileNameFromTags(single) ?? single.name);
			setFilePanel("rename");
			return;
		}
		if (!onRenameMany) return;
		if (skipMultiWarn) void runBulk("rename");
		else {
			setDontShowAgain(false);
			setFilePanel("warn-rename");
		}
	};

	const openFill = () => {
		if (single) {
			setFillPick(0);
			setFilePanel("fill");
			return;
		}
		if (!onFillMany) return;
		if (skipMultiWarn) void runBulk("fill");
		else {
			setDontShowAgain(false);
			setFilePanel("warn-fill");
		}
	};

	const runBulk = async (kind: "rename" | "fill") => {
		if (renaming) return;
		setRenaming(true);
		try {
			if (kind === "rename") await onRenameMany?.();
			else await onFillMany?.();
			setFilePanel(null);
		} finally {
			setRenaming(false);
		}
	};

	const confirmBulk = async (kind: "rename" | "fill") => {
		if (dontShowAgain) setSkipMultiWarn(true);
		await runBulk(kind);
	};

	const applyRename = async () => {
		if (!onRename || renaming) return;
		const name = renameName.trim();
		if (!name || (single && name === single.name)) {
			setFilePanel(null);
			return;
		}
		setRenaming(true);
		try {
			await onRename(name);
			setFilePanel(null);
		} finally {
			setRenaming(false);
		}
	};

	const applyVariant = (variant: import("../../utils/fileName").NameVariant) => {
		set("artist", variant.artist);
		set("title", variant.title);
		if (variant.trackNumber !== undefined) set("trackNumber", String(variant.trackNumber));
		setFilePanel(null);
	};

	const pickCover = async (file: File | undefined) => {
		if (!file) return;
		const frame = await cropToSquare(file);
		if (!frame) return;
		setPicking(true);
		try {
			const { blob, data } = await cropImage(file, frame);
			setCover({ kind: "set", data, url: URL.createObjectURL(blob) });
		} catch (e) {
			notifyError(t("cover.cropFailed"), e);
		} finally {
			setPicking(false);
		}
	};

	const pasteCover = async () => {
		try {
			const image = await clipboardImage();
			if (!image) {
				notifyInfo(t("cover.noImageInClipboard"));
				return;
			}
			setCover({ kind: "set", data: image.data, url: URL.createObjectURL(image.blob) });
		} catch (e) {
			notifyError(t("cover.pasteFailed"), e);
		}
	};

	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const image = pastedImage(e);
			if (!image) return;
			e.preventDefault();
			image.then(
				({ data, blob }) => setCover({ kind: "set", data, url: URL.createObjectURL(blob) }),
				error => notifyError(t("cover.pasteFailed"), error),
			);
		};
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, []);

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

	const input = (field: MetadataField, className = "") => (
		<label key={field} className={`editor-field metadata-field ${className}`}>
			{t(METADATA_LABELS[field])}
			<input
				className="rule-input"
				value={values[field]}
				inputMode={(NUMBER_FIELDS as readonly string[]).includes(field) ? "numeric" : undefined}
				placeholder={mixed.has(field) && !changed.has(field)
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

				<MetadataEditorFileBlock
					tracks={tracks}
					single={single}
					saving={saving}
					renaming={renaming}
					filePanel={filePanel}
					setFilePanel={setFilePanel}
					renameName={renameName}
					setRenameName={setRenameName}
					fillPick={fillPick}
					setFillPick={setFillPick}
					dontShowAgain={dontShowAgain}
					setDontShowAgain={setDontShowAgain}
					onRename={onRename}
					onRenameMany={onRenameMany}
					onFillMany={onFillMany}
					openRename={openRename}
					openFill={openFill}
					confirmBulk={confirmBulk}
					applyRename={applyRename}
					applyVariant={applyVariant}
				/>

				<div className="metadata-body">
					<div className="metadata-cover">
						{cover.kind === "set"
							? <img src={cover.url} alt="" className="metadata-cover-image" />
							: <CoverArt path={shownCover} size={120} className="metadata-cover-image" />}
						{picking && (
							<div className="metadata-cover-loading">
								<span className="spinner" />
							</div>
						)}
						{cover.kind === "keep" && covers.size > 1 && (
							<span className="metadata-cover-note">{t("edit.mixedCovers")}</span>
						)}
						{cover.kind === "remove" && <span className="metadata-cover-note">{t("edit.coverRemoved")}</span>}
						<div className="metadata-cover-actions">
							<button className="editor-button" disabled={saving} onClick={() => fileInput.current?.click()}>
								<ImagePlus size={14} /> {t("edit.coverReplace")}
							</button>
							<button className="editor-button" disabled={saving} title={t("cover.pasteHint")} onClick={pasteCover}>
								<ClipboardPaste size={14} /> {t("cover.paste")}
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
