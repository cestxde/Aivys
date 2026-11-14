import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
import {
	ClipboardPaste, GripVertical, ImagePlus, Minus, Plus, Trash2, X,
} from "lucide-react";
import type { Track } from "../../types";
import { ALBUM_SKIP_ADD_WARN, isBooleanStored } from "../../utils/albumAddWarn";
import {
	albumEditorDefaults,
	initialTrackNumbers,
	sequentialTrackNumbers,
	suggestedTrackTotal,
	trackMatchesAlbumPicker,
	type AlbumEditorSeed,
} from "../../utils/albumEditor";
import { androidStorage } from "../../utils/androidStorage";
import { cropToSquare } from "../../utils/coverCrop";
import { clipboardImage, cropImage, pastedImage } from "../../utils/image";
import { moveItem } from "../TrackList/trackListLayout";
import { displayArtists, displayTitle } from "../../utils/track";
import { CoverArt } from "../CoverArt";
import { SearchInput } from "../SearchInput/SearchInput";
import { useBackLayer } from "../../hooks/useBackLayer";
import { useStoredState } from "../../hooks/useRemembered";
import { notifyError, notifyInfo } from "../../utils/notify";
import { t } from "../../i18n";
import "./AlbumEditorDialog.css";

type Cover = { kind: "keep" } | { kind: "set"; data: string; url: string } | { kind: "remove" };

export interface AlbumEditorSave {
	album: string;
	albumArtist: string | null;
	year: number | null;
	genre: string | null;
	cover?: string | null;
	/** Write trackNumber / trackTotal onto each file. */
	writeNumbers: boolean;
	trackTotal: number | null;
	/** path → track number (when writeNumbers). */
	trackNumbers: Record<string, number>;
	tracks: Track[];
}

interface AlbumEditorDialogProps {
	mode: "create" | "edit";
	initialTracks: Track[];
	/** Prefill from the target album when newcomers would otherwise mix the fields. */
	seed?: AlbumEditorSeed | null;
	/** Full library for the add-tracks picker. */
	libraryTracks: Track[];
	onSave: (payload: AlbumEditorSave) => Promise<void>;
	onClose: () => void;
}

type DropTarget = { key: string; after: boolean };

/** Package album tags onto a set of tracks: shared fields, order, optional 1…N. */
export const AlbumEditorDialog = ({
	mode, initialTracks, seed = null, libraryTracks, onSave, onClose,
}: AlbumEditorDialogProps) => {
	useBackLayer(true, onClose);
	const defaults = useMemo(() => albumEditorDefaults(initialTracks, seed), [initialTracks, seed]);
	const [tracks, setTracks] = useState(defaults.tracks);
	const [album, setAlbum] = useState(defaults.album);
	const [albumArtist, setAlbumArtist] = useState(defaults.albumArtist);
	const [year, setYear] = useState(defaults.year);
	const [genre, setGenre] = useState(defaults.genre);
	const [seedCover] = useState(defaults.coverPath);
	const [writeNumbers, setWriteNumbers] = useState(true);
	/** When on, list order drives 1…N; editing a digit turns this off. */
	const [autoOrder, setAutoOrder] = useState(mode === "create");
	const [trackTotal, setTrackTotal] = useState(() => String(suggestedTrackTotal(defaults.tracks)));
	const [numbers, setNumbers] = useState(() => (
		mode === "create"
			? sequentialTrackNumbers(defaults.tracks)
			: initialTrackNumbers(defaults.tracks)
	));
	const [cover, setCover] = useState<Cover>({ kind: "keep" });
	const [picking, setPicking] = useState(false);
	const [saving, setSaving] = useState(false);
	const [adding, setAdding] = useState(initialTracks.length === 0);
	const [addFilter, setAddFilter] = useState("");
	const [pendingTrack, setPendingTrack] = useState<Track | null>(null);
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const [skipAddWarn, setSkipAddWarn] = useStoredState(ALBUM_SKIP_ADD_WARN, false, isBooleanStored);
	const [dragging, setDragging] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const dropRef = useRef<DropTarget | null>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const syncNumbersFromOrder = (list: Track[]) => {
		setNumbers(sequentialTrackNumbers(list));
		setTrackTotal(prev => {
			const n = Number(prev);
			if (!Number.isFinite(n) || n < list.length) return String(list.length);
			return prev;
		});
	};

	const appendTrack = (track: Track) => {
		setTracks(prev => {
			if (prev.some(item => item.path === track.path)) return prev;
			const next = [...prev, track];
			if (autoOrder) {
				setNumbers(sequentialTrackNumbers(next));
			} else {
				setNumbers(map => {
					const used = Object.values(map).map(Number).filter(n => Number.isFinite(n) && n > 0);
					const nextNum = (used.length ? Math.max(...used) : prev.length) + 1;
					return { ...map, [track.path]: String(nextNum) };
				});
			}
			setTrackTotal(total => {
				const n = Number(total);
				const min = next.length;
				if (!Number.isFinite(n) || n < min) return String(min);
				return total;
			});
			return next;
		});
	};

	const requestAddTrack = (track: Track) => {
		if (skipAddWarn) {
			appendTrack(track);
			return;
		}
		setDontShowAgain(false);
		setPendingTrack(track);
	};

	const confirmAddTrack = () => {
		if (!pendingTrack) return;
		if (dontShowAgain) setSkipAddWarn(true);
		appendTrack(pendingTrack);
		setPendingTrack(null);
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	useEffect(() => () => {
		if (cover.kind === "set") URL.revokeObjectURL(cover.url);
	}, [cover]);

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

	const present = useMemo(() => new Set(tracks.map(track => track.path)), [tracks]);
	const candidates = useMemo(() => {
		const query = addFilter.trim().toLowerCase();
		return libraryTracks
			.filter(track => !present.has(track.path) && trackMatchesAlbumPicker(track, query))
			.slice(0, 80);
	}, [libraryTracks, present, addFilter]);

	const covers = new Set(tracks.map(track => track.coverPath ?? ""));
	const shownCover = cover.kind === "keep"
		? (covers.size === 1 ? (tracks[0]?.coverPath ?? null) : seedCover)
		: null;
	const hasKeepCover = !!shownCover;

	const startDrag = (e: ReactPointerEvent<HTMLElement>, key: string) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		setDragging(key);
	};

	const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
		if (!dragging) return;
		const scroller = listRef.current;
		if (scroller) {
			const box = scroller.getBoundingClientRect();
			if (e.clientY < box.top + 28) scroller.scrollBy(0, -10);
			else if (e.clientY > box.bottom - 28) scroller.scrollBy(0, 10);
		}
		const row = document
			.elementFromPoint(e.clientX, e.clientY)
			?.closest<HTMLElement>("[data-album-track]");
		const key = row?.dataset.albumTrack;
		if (!row || !key) return;
		const box = row.getBoundingClientRect();
		const next = { key, after: e.clientY > box.top + box.height / 2 };
		if (dropRef.current?.key !== next.key || dropRef.current.after !== next.after) {
			dropRef.current = next;
			setDropTarget(next);
		}
	};

	const endDrag = (commit: boolean) => {
		const target = dropRef.current;
		const moved = dragging;
		setDragging(null);
		setDropTarget(null);
		dropRef.current = null;
		if (!commit || !moved || !target || moved === target.key) return;
		const ids = tracks.map(track => track.path);
		const nextIds = moveItem(ids, moved, target.key, target.after);
		const byPath = new Map(tracks.map(track => [track.path, track]));
		const next = nextIds.flatMap(path => {
			const track = byPath.get(path);
			return track ? [track] : [];
		});
		setTracks(next);
		if (autoOrder) syncNumbersFromOrder(next);
	};

	const setTrackNumber = (path: string, value: string) => {
		const digits = value.replace(/\D/g, "").slice(0, 4);
		setAutoOrder(false);
		setNumbers(map => ({ ...map, [path]: digits }));
		const n = Number(digits);
		if (Number.isFinite(n) && n > 0) {
			setTrackTotal(prev => {
				const total = Number(prev);
				if (!Number.isFinite(total) || total < n) return String(n);
				return prev;
			});
		}
	};

	const numberOf = (track: Track, index: number): string =>
		autoOrder ? String(index + 1) : (numbers[track.path] ?? "");

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

	const canSave = album.trim().length > 0 && tracks.length > 0 && !saving;

	const save = async () => {
		if (!canSave) return;
		const yearTrim = year.trim();
		const yearNum = yearTrim === "" ? null : Number(yearTrim);
		if (yearTrim !== "" && (!Number.isFinite(yearNum) || yearNum === null)) {
			notifyError(t("album.invalidYear"));
			return;
		}
		const totalTrim = trackTotal.trim();
		const totalNum = totalTrim === "" ? null : Number(totalTrim);
		if (writeNumbers) {
			if (totalTrim === "" || !Number.isFinite(totalNum) || totalNum === null || totalNum < 1) {
				notifyError(t("album.invalidTotal"));
				return;
			}
			if (totalNum < tracks.length) {
				notifyError(t("album.totalTooSmall", { count: tracks.length }));
				return;
			}
		}
		const trackNumbers: Record<string, number> = {};
		if (writeNumbers && totalNum != null) {
			for (let index = 0; index < tracks.length; index++) {
				const track = tracks[index];
				const raw = (autoOrder ? String(index + 1) : (numbers[track.path] ?? "")).trim();
				const n = Number(raw);
				if (!Number.isFinite(n) || n < 1 || n > totalNum) {
					notifyError(t("album.invalidNumber", { title: displayTitle(track) }));
					return;
				}
				trackNumbers[track.path] = n;
			}
		}
		setSaving(true);
		try {
			const payload: AlbumEditorSave = {
				album: album.trim(),
				albumArtist: albumArtist.trim() === "" ? null : albumArtist.trim(),
				year: yearNum,
				genre: genre.trim() === "" ? null : genre.trim(),
				writeNumbers,
				trackTotal: writeNumbers ? totalNum : null,
				trackNumbers,
				tracks,
			};
			if (cover.kind === "set") payload.cover = cover.data;
			if (cover.kind === "remove") payload.cover = null;
			await onSave(payload);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
			<div
				className="album-editor-dialog"
				role="dialog"
				aria-label={mode === "edit" ? t("album.editTitle") : t("album.createTitle")}
			>
				<div className="album-editor-header">
					<h2>{mode === "edit" ? t("album.editTitle") : t("album.createTitle")}</h2>
					<button type="button" className="add-to-close" title={t("common.close")} disabled={saving} onClick={onClose}>
						<X size={18} />
					</button>
				</div>

				<div className="album-editor-scroll">
					<p className="album-editor-hint">{t("album.hint")}</p>

					{pendingTrack && (
						<div className="album-editor-warn">
							<p className="album-editor-warn-text">
								{t("album.addTrackWarn", { title: displayTitle(pendingTrack) })}
							</p>
							<label className="album-editor-check">
								<input
									type="checkbox"
									checked={dontShowAgain}
									onChange={(e) => setDontShowAgain(e.target.checked)}
								/>
								<span>{t("edit.dontShowAgain")}</span>
							</label>
							<div className="album-editor-warn-actions">
								<button type="button" className="editor-button" onClick={() => setPendingTrack(null)}>
									{t("common.cancel")}
								</button>
								<button type="button" className="editor-button primary" onClick={confirmAddTrack}>
									{t("common.continue")}
								</button>
							</div>
						</div>
					)}

					<div className="album-editor-body">
						<div className="album-editor-fields">
							<div className="album-editor-cover">
								{cover.kind === "set"
									? <img src={cover.url} alt="" className="album-editor-cover-image" />
									: <CoverArt path={shownCover} size={96} className="album-editor-cover-image" />}
								{picking && (
									<div className="album-editor-cover-loading"><span className="spinner" /></div>
								)}
								{cover.kind === "keep" && covers.size > 1 && !seedCover && (
									<span className="album-editor-cover-note">{t("edit.mixedCovers")}</span>
								)}
								{cover.kind === "keep" && covers.size > 1 && seedCover && (
									<span className="album-editor-cover-note">{t("album.coverFromAlbum")}</span>
								)}
								{cover.kind === "remove" && (
									<span className="album-editor-cover-note">{t("edit.coverRemoved")}</span>
								)}
								<div className="album-editor-cover-actions">
									<button type="button" className="editor-button" disabled={saving || picking} onClick={() => fileInput.current?.click()}>
										<ImagePlus size={14} /> {t("edit.coverReplace")}
									</button>
									{!androidStorage && (
										<button type="button" className="editor-button" disabled={saving || picking} title={t("cover.pasteHint")} onClick={pasteCover}>
											<ClipboardPaste size={14} /> {t("cover.paste")}
										</button>
									)}
									<button
										type="button"
										className="editor-button"
										disabled={saving || cover.kind === "remove" || (cover.kind === "keep" && !hasKeepCover)}
										onClick={() => setCover({ kind: "remove" })}
									>
										<Trash2 size={14} /> {t("edit.coverRemove")}
									</button>
								</div>
								<input
									ref={fileInput}
									type="file"
									accept="image/*"
									hidden
									onChange={(e) => {
										const file = e.target.files?.[0];
										e.target.value = "";
										void pickCover(file);
									}}
								/>
							</div>

							<label className="editor-field">
								{t("edit.album")}
								<input
									className="rule-input"
									value={album}
									autoFocus
									disabled={saving}
									onChange={(e) => setAlbum(e.target.value)}
								/>
							</label>
							<label className="editor-field">
								{t("edit.albumArtist")}
								<input
									className="rule-input"
									value={albumArtist}
									disabled={saving}
									placeholder={t("album.albumArtistHint")}
									onChange={(e) => setAlbumArtist(e.target.value)}
								/>
							</label>
							<div className="album-editor-row">
								<label className="editor-field">
									{t("edit.year")}
									<input
										className="rule-input"
										value={year}
										disabled={saving}
										inputMode="numeric"
										onChange={(e) => setYear(e.target.value)}
									/>
								</label>
								<label className="editor-field">
									{t("edit.genre")}
									<input
										className="rule-input"
										value={genre}
										disabled={saving}
										onChange={(e) => setGenre(e.target.value)}
									/>
								</label>
							</div>
						<label className="album-editor-check">
							<input
								type="checkbox"
								checked={writeNumbers}
								disabled={saving}
								onChange={(e) => setWriteNumbers(e.target.checked)}
							/>
							<span>{t("album.writeNumbers")}</span>
						</label>
						{writeNumbers && (
							<>
								<label className="album-editor-check">
									<input
										type="checkbox"
										checked={autoOrder}
										disabled={saving}
										onChange={(e) => {
											const on = e.target.checked;
											setAutoOrder(on);
											if (on) syncNumbersFromOrder(tracks);
										}}
									/>
									<span>{t("album.autoOrder")}</span>
								</label>
								<label className="editor-field">
									{t("album.trackTotal")}
									<input
										className="rule-input"
										value={trackTotal}
										disabled={saving}
										inputMode="numeric"
										onChange={(e) => setTrackTotal(e.target.value.replace(/\D/g, "").slice(0, 4))}
									/>
									<span className="album-editor-field-hint">{t("album.trackTotalHint")}</span>
								</label>
							</>
						)}
					</div>

						<div className={`album-editor-tracks${adding ? " is-adding" : ""}`}>
							<div className="album-editor-tracks-head">
								<span>{t("album.tracks", { count: tracks.length })}</span>
								<button
									type="button"
									className="editor-button"
									disabled={saving || !!pendingTrack}
									aria-expanded={adding}
									onClick={() => setAdding(open => !open)}
								>
									{adding ? <Minus size={14} /> : <Plus size={14} />}
									{adding ? t("album.hideTracks") : t("album.addTracks")}
								</button>
							</div>

							{adding && (
								<div className="album-editor-picker">
									<SearchInput
										value={addFilter}
										placeholder={t("album.findTracks")}
										autoFocus
										onChange={setAddFilter}
									/>
									<div className="album-editor-picker-list">
										{candidates.map(track => (
											<button
												key={track.path}
												type="button"
												className="album-editor-picker-row"
												disabled={saving || !!pendingTrack}
												onClick={() => requestAddTrack(track)}
											>
												<CoverArt path={track.coverPath} size={32} />
												<span className="album-editor-picker-text">
													<span className="album-editor-picker-title">{displayTitle(track)}</span>
													<span className="album-editor-picker-meta">
														{[displayArtists(track), track.album].filter(Boolean).join(" · ")}
													</span>
												</span>
											</button>
										))}
										{candidates.length === 0 && (
											<div className="album-editor-empty">{t("album.noTrackMatch")}</div>
										)}
									</div>
								</div>
							)}

							<ul
								ref={listRef}
								className={`album-editor-track-list${dragging ? " is-reordering" : ""}`}
							>
								{tracks.map((track, index) => {
									const drop = dropTarget?.key === track.path && dragging !== track.path
										? (dropTarget.after ? " drop-after" : " drop-before")
										: "";
									return (
										<li
											key={track.path}
											data-album-track={track.path}
											className={`album-editor-track-row${dragging === track.path ? " dragging" : ""}${drop}`}
										>
											<span
												className="album-editor-drag"
												title={t("list.dragToReorder")}
												onClick={(e) => e.stopPropagation()}
												onPointerDown={(e) => startDrag(e, track.path)}
												onPointerMove={moveDrag}
												onPointerUp={() => endDrag(true)}
												onPointerCancel={() => endDrag(false)}
											>
												<GripVertical size={14} />
											</span>
										<input
											className="album-editor-track-num"
											value={writeNumbers ? numberOf(track, index) : ""}
											disabled={saving || !writeNumbers}
											inputMode="numeric"
											aria-label={t("edit.trackNumber")}
											title={t("edit.trackNumber")}
											onChange={(e) => setTrackNumber(track.path, e.target.value)}
										/>
										<CoverArt path={track.coverPath} size={36} />
										<span className="album-editor-track-text">
											<span className="album-editor-track-title">{displayTitle(track)}</span>
											<span className="album-editor-track-meta">{displayArtists(track)}</span>
										</span>
										<button
											type="button"
											className="album-editor-remove"
											title={t("album.removeTrack")}
											disabled={saving}
											onClick={() => {
												const next = tracks.filter(item => item.path !== track.path);
												setTracks(next);
												if (autoOrder) syncNumbersFromOrder(next);
												else {
													setNumbers(map => {
														const copy = { ...map };
														delete copy[track.path];
														return copy;
													});
												}
											}}
										>
											<X size={14} />
										</button>
										</li>
									);
								})}
								{tracks.length === 0 && (
									<li className="album-editor-empty">{t("album.needTracks")}</li>
								)}
							</ul>
						</div>
					</div>
				</div>

				<div className="album-editor-footer">
					<button type="button" className="editor-button" disabled={saving} onClick={onClose}>
						{t("common.cancel")}
					</button>
					<button type="button" className="editor-button primary" disabled={!canSave} onClick={save}>
						{saving ? t("album.saving") : t("common.save")}
					</button>
				</div>
			</div>
		</div>
	);
};
