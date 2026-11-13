import { Copy, FilePenLine, TextCursorInput } from "lucide-react";
import type { Track } from "../../types";
import { t } from "../../i18n";
import { parseFileNameVariants, type NameVariant } from "../../utils/fileName";
import type { FilePanel } from "./metadataEditorTypes";

interface MetadataEditorFileBlockProps {
	tracks: Track[];
	single: Track | null;
	saving: boolean;
	renaming: boolean;
	filePanel: FilePanel;
	setFilePanel: (panel: FilePanel) => void;
	renameName: string;
	setRenameName: (name: string) => void;
	fillPick: number;
	setFillPick: (index: number) => void;
	dontShowAgain: boolean;
	setDontShowAgain: (value: boolean) => void;
	onRename?: (name: string) => Promise<void>;
	onRenameMany?: () => Promise<void>;
	onFillMany?: () => Promise<void>;
	openRename: () => void;
	openFill: () => void;
	confirmBulk: (kind: "rename" | "fill") => void;
	applyRename: () => void;
	applyVariant: (variant: NameVariant) => void;
}

export const MetadataEditorFileBlock = ({
	tracks,
	single,
	saving,
	renaming,
	filePanel,
	setFilePanel,
	renameName,
	setRenameName,
	fillPick,
	setFillPick,
	dontShowAgain,
	setDontShowAgain,
	onRename,
	onRenameMany,
	onFillMany,
	openRename,
	openFill,
	confirmBulk,
	applyRename,
	applyVariant,
}: MetadataEditorFileBlockProps) => (
	<div className="metadata-file-block">
		<div className="metadata-file">
			<span className="metadata-file-label">{t("edit.file")}</span>
			<span className="metadata-file-name">
				{single ? single.name : t("common.tracks", { count: tracks.length })}
			</span>
			{single && (
				<button
					className="metadata-file-copy"
					title={t("edit.copyName")}
					disabled={saving || renaming}
					onClick={() => navigator.clipboard.writeText(single.name).catch(console.error)}
				>
					<Copy size={13} />
				</button>
			)}
		</div>
		{filePanel === null && (
			<div className="metadata-file-actions">
				{(single ? onRename : onRenameMany) && (
					<button className="editor-button" disabled={saving || renaming} onClick={openRename}>
						<FilePenLine size={14} /> {t("edit.renameFile")}
					</button>
				)}
				<button className="editor-button" disabled={saving || renaming || (!single && !onFillMany)} onClick={openFill}>
					<TextCursorInput size={14} /> {t("edit.fillFromName")}
				</button>
			</div>
		)}
		{(filePanel === "warn-rename" || filePanel === "warn-fill") && (
			<div className="metadata-file-panel">
				<span className="metadata-file-panel-hint">
					{filePanel === "warn-rename" ? t("edit.multiRenameWarn") : t("edit.multiFillWarn")}
				</span>
				<label className="metadata-file-dont-show">
					<input
						type="checkbox"
						checked={dontShowAgain}
						onChange={(e) => setDontShowAgain(e.target.checked)}
					/>
					{t("edit.dontShowAgain")}
				</label>
				<div className="metadata-file-panel-actions">
					<button className="editor-button" disabled={renaming} onClick={() => setFilePanel(null)}>
						{t("common.cancel")}
					</button>
					<button
						className="editor-button primary"
						disabled={renaming}
						onClick={() => void confirmBulk(filePanel === "warn-rename" ? "rename" : "fill")}
					>
						{t("common.continue")}
					</button>
				</div>
			</div>
		)}
		{filePanel === "rename" && single && (
			<div className="metadata-file-panel">
				<span className="metadata-file-panel-hint">{t("edit.renameHint")}</span>
				<input
					className="rule-input"
					value={renameName}
					disabled={renaming}
					autoFocus
					onChange={(e) => setRenameName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") applyRename();
						if (e.key === "Escape") setFilePanel(null);
					}}
				/>
				<div className="metadata-file-panel-actions">
					<button className="editor-button" disabled={renaming} onClick={() => setFilePanel(null)}>
						{t("common.cancel")}
					</button>
					<button
						className="editor-button primary"
						disabled={renaming || !renameName.trim()}
						onClick={applyRename}
					>
						{t("edit.renameApply")}
					</button>
				</div>
			</div>
		)}
		{filePanel === "fill" && single && (() => {
			const variants = parseFileNameVariants(single);
			return (
				<div className="metadata-file-panel">
					<span className="metadata-file-panel-hint">
						{variants.length > 0 ? t("edit.nameVariants") : t("edit.noVariants")}
					</span>
					{variants.length > 0 && (
						<div className="metadata-name-variants" role="radiogroup">
							{variants.map((variant, index) => (
								<label key={`${variant.artist}\0${variant.title}\0${index}`} className="metadata-name-variant">
									<input
										type="radio"
										name="name-variant"
										checked={fillPick === index}
										onChange={() => setFillPick(index)}
									/>
									<span>
										{variant.trackNumber !== undefined && (
											<span className="metadata-name-variant-num">{variant.trackNumber}. </span>
										)}
										{variant.artist} — {variant.title}
									</span>
								</label>
							))}
						</div>
					)}
					<div className="metadata-file-panel-actions">
						<button className="editor-button" onClick={() => setFilePanel(null)}>
							{t("common.cancel")}
						</button>
						{variants.length > 0 && (
							<button
								className="editor-button primary"
								onClick={() => applyVariant(variants[fillPick] ?? variants[0])}
							>
								{t("edit.useVariant")}
							</button>
						)}
					</div>
				</div>
			);
		})()}
	</div>
);
