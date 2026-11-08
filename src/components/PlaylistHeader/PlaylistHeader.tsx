import { useState } from "react";
import { ArrowLeft, ClipboardPaste, ImagePlus, Images, ListMusic, Pencil, Sparkles, Trash2, SlidersHorizontal } from "lucide-react";
import type { ListRow, Playlist } from "../../types";
import { formatTotalDuration } from "../../utils/format";
import { PlaylistCover } from "../PlaylistCover/PlaylistCover";
import { t } from "../../i18n";
import { cropImage, pickFile } from "../../utils/image";
import { cropToSquare } from "../../utils/coverCrop";
import { notifyError } from "../../utils/notify";
import "./PlaylistHeader.css";

interface PlaylistHeaderProps {
    playlist: Playlist;
    rows: ListRow[];
    missingCount: number;
    /** Open with the name in edit mode (a freshly created playlist). */
    startRenaming?: boolean;
    onBack: () => void;
    onRename: (name: string) => void;
    /** Asks for confirmation itself. */
    onDelete: () => void;
    onEditRules: () => void;
    /** The picked image's bytes, base64; resolves when the cover is written. */
    onSetCover: (data: string) => void | Promise<unknown>;
    onClearCover: () => void;
    /** The clipboard's image as the cover (the desktop only). */
    onPasteCover?: () => void;
    /** Write the playlist's cover into every track's tags; `onBusy` for the spinner. */
    onApplyCoverToTracks?: (onBusy: (busy: boolean) => void) => void | Promise<unknown>;
}

const COVER_SIZE = 120;

export const PlaylistHeader = ({
    playlist,
    rows,
    missingCount,
    startRenaming = false,
    onBack,
    onRename,
    onDelete,
    onEditRules,
    onSetCover,
    onClearCover,
    onPasteCover,
    onApplyCoverToTracks,
}: PlaylistHeaderProps) => {
    const [draft, setDraft] = useState<string | null>(startRenaming ? playlist.name : null);
    // True while the playlist's cover is being written (a spinner shows over it).
    const [settingCover, setSettingCover] = useState(false);
    const editable = !playlist.readOnly;
    const smart = playlist.type === "smart";

    const commitRename = () => {
        const name = draft?.trim();
        setDraft(null);
        if (name && name !== playlist.name) onRename(name);
    };

    const chooseCover = () => {
        pickFile().then(async file => {
            const frame = await cropToSquare(file);
            if (!frame) return;
            // The spinner starts the moment the square is chosen, so it also
            // covers the crop itself, not only the write.
            setSettingCover(true);
            try {
                const { data } = await cropImage(file, frame);
                await onSetCover(data);
            } catch (e) {
                notifyError(t("error.setCover"), e);
            } finally {
                setSettingCover(false);
            }
        });
    };

    const totalSeconds = rows.reduce((sum, row) => sum + row.track.duration, 0);
    const summary = [
        t("common.tracks", { count: rows.length }),
        rows.length > 0 ? formatTotalDuration(totalSeconds) : null,
        missingCount > 0 ? t("playlist.missing", { count: missingCount }) : null,
    ].filter(Boolean).join(" · ");

    return (
        <div className="playlist-header">
            <button className="playlist-back" title={t("playlist.all")} onClick={onBack}>
                <ArrowLeft size={18} />
            </button>
            <div className="playlist-header-cover-wrap">
                <PlaylistCover
                    playlist={playlist}
                    memberCovers={rows.flatMap(row => row.track.coverPath ?? [])}
                    size={COVER_SIZE}
                    className="playlist-header-cover"
                    onClick={editable ? chooseCover : undefined}
                />
                {settingCover && (
                    <div className="playlist-header-cover-loading">
                        <span className="spinner" />
                    </div>
                )}
            </div>

            <div className="playlist-info">
                <span className="playlist-kind">
                    {smart ? <Sparkles size={14} /> : <ListMusic size={14} />}
                    {smart ? t("playlist.kindSmart") : t("playlist.kind")}
                    {playlist.readOnly && t("playlist.readOnly")}
                </span>

                {draft !== null ? (
                    <input
                        className="playlist-name-input"
                        value={draft}
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setDraft(null);
                        }}
                    />
                ) : (
                    <h1
                        className={`playlist-name ${editable ? "editable" : ""}`}
                        title={editable ? t("playlist.clickToRename") : undefined}
                        onClick={editable ? () => setDraft(playlist.name) : undefined}
                    >
                        {playlist.name}
                    </h1>
                )}

                <span className="playlist-summary">{summary}</span>

                {editable && (
                    <div className="playlist-actions">
                        {smart && (
                            <button className="playlist-action" onClick={onEditRules}>
                                <SlidersHorizontal size={14} /> {t("playlist.editRules")}
                            </button>
                        )}
                        <button className="playlist-action" onClick={() => setDraft(playlist.name)}>
                            <Pencil size={14} /> {t("playlist.rename")}
                        </button>
                        <button className="playlist-action" onClick={chooseCover}>
                            <ImagePlus size={14} /> {playlist.coverPath ? t("playlist.changeCover") : t("playlist.setCover")}
                        </button>
                        {onPasteCover && (
                            <button className="playlist-action" title={t("cover.pasteHint")} onClick={onPasteCover}>
                                <ClipboardPaste size={14} /> {t("cover.pasteCover")}
                            </button>
                        )}
                        {playlist.coverPath && (
                            <button className="playlist-action" onClick={onClearCover}>
                                {t("playlist.removeCover")}
                            </button>
                        )}
                        {onApplyCoverToTracks && playlist.coverPath && (
                            <button
                                className="playlist-action"
                                disabled={settingCover}
                                onClick={() => onApplyCoverToTracks(setSettingCover)}
                            >
                                <Images size={14} /> {t("playlist.applyCoverToTracks")}
                            </button>
                        )}
                        <button className="playlist-action danger" onClick={onDelete}>
                            <Trash2 size={14} /> {t("common.delete")}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
