import { useEffect, useState } from "react";
import { Check, Heart, ListEnd, ListStart, MicVocal, Plus, X } from "lucide-react";
import type { Playlist, Track } from "../../types";
import { artistKey, UNKNOWN_ARTIST_KEY, type TrackGroup } from "../../utils/groups";
import { displayTitle } from "../../utils/track";
import { PlaylistCover } from "../PlaylistCover/PlaylistCover";
import { t } from "../../i18n";
import "./AddToDialog.css";
import { useBackLayer } from "../../hooks/useBackLayer";
import { SearchInput } from "../SearchInput/SearchInput";

type AddToMode = "playlists" | "artists";

interface AddToDialogProps {
    tracks: Track[];
    /** Manual playlists that can be added to. */
    playlists: Playlist[];
    tracksByPath: Map<string, Track>;
    /** Library artists (for the Artists mode). */
    artists: TrackGroup[];
    /** Manual links already on these tracks, keyed by relPath. */
    linkedByPath: Record<string, string[]>;
    /** Every one of the tracks is a favorite already. */
    allFavorite: boolean;
    onPlayNext: () => void;
    onAddToQueue: () => void;
    onAddToFavorites: () => void;
    onAddToPlaylist: (playlist: Playlist) => void;
    /** Create a playlist with the tracks, named `name`. */
    onCreatePlaylist: (name: string) => void;
    /** Link the tracks to an artist by hand. */
    onLinkArtist: (name: string) => void;
    onClose: () => void;
}

/** "Add to…": the play queue, then playlists or artist links (toggle). */
export const AddToDialog = ({
    tracks,
    playlists,
    tracksByPath,
    artists,
    linkedByPath,
    allFavorite,
    onPlayNext,
    onAddToQueue,
    onAddToFavorites,
    onAddToPlaylist,
    onCreatePlaylist,
    onLinkArtist,
    onClose,
}: AddToDialogProps) => {
    useBackLayer(true, onClose);
    const [mode, setMode] = useState<AddToMode>("playlists");
    const [filter, setFilter] = useState("");
    const [newName, setNewName] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const switchMode = (next: AddToMode) => {
        if (next === mode) return;
        setMode(next);
        setFilter("");
        setNewName(null);
    };

    const query = filter.trim().toLowerCase();
    const shownPlaylists = playlists
        .filter(p => !query || p.name.toLowerCase().includes(query))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    const shownArtists = artists
        .filter(group => group.key !== UNKNOWN_ARTIST_KEY)
        .filter(group => !query || group.name.toLowerCase().includes(query))
        .sort((a, b) =>
            b.tracks.length - a.tracks.length
            || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const paths = new Set(tracks.map(t => t.relPath));
    const containsAll = (playlist: Playlist) =>
        tracks.length > 0 && [...paths].every(path => playlist.items?.some(item => item.path === path));

    const hasArtist = (name: string) => {
        const key = artistKey(name);
        if (!key || tracks.length === 0) return false;
        return tracks.every(track => {
            if (track.artists.some(tag => artistKey(tag) === key)) return true;
            return (linkedByPath[track.relPath] ?? []).some(linked => artistKey(linked) === key);
        });
    };

    const exactArtist = filter.trim()
        && !shownArtists.some(group => artistKey(group.name) === artistKey(filter));

    // Favorites is listed like a playlist, so the filter applies to it too.
    const showFavorites = !query || t("nav.favorites").toLowerCase().includes(query);

    const subject = tracks.length === 1
        ? displayTitle(tracks[0])
        : t("common.tracks", { count: tracks.length });

    const createNew = () => {
        const name = newName?.trim();
        if (name) onCreatePlaylist(name);
    };

    return (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="add-to-dialog" role="dialog" aria-label={t("common.addTo")}>
                <div className="add-to-header">
                    <div className="add-to-heading">
                        <h2>{t("common.addTo")}</h2>
                        <span className="add-to-subject">{subject}</span>
                    </div>
                    <button className="add-to-close" title={t("common.close")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="add-to-section-label">{t("addTo.queue")}</div>
                <div className="add-to-queue">
                    <button className="add-to-option" onClick={onPlayNext}>
                        <ListStart size={18} /> {t("addTo.playNext")}
                    </button>
                    <button className="add-to-option" onClick={onAddToQueue}>
                        <ListEnd size={18} /> {t("addTo.addToQueue")}
                    </button>
                </div>

                <div className="add-to-mode" role="radiogroup" aria-label={t("common.addTo")}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={mode === "playlists"}
                        className={mode === "playlists" ? "active" : undefined}
                        onClick={() => switchMode("playlists")}
                    >
                        {t("addTo.playlist")}
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={mode === "artists"}
                        className={mode === "artists" ? "active" : undefined}
                        onClick={() => switchMode("artists")}
                    >
                        {t("addTo.artists")}
                    </button>
                </div>

                <SearchInput
                    placeholder={mode === "playlists" ? t("addTo.findPlaylist") : t("addTo.findArtist")}
                    value={filter}
                    autoFocus
                    onChange={setFilter}
                />

                {mode === "playlists" ? (
                    <div className="add-to-list">
                        {newName === null ? (
                            <button
                                className="add-to-row"
                                onClick={() => setNewName(filter.trim() || t("playlists.defaultName"))}
                            >
                                <span className="add-to-row-icon"><Plus size={18} /></span>
                                <span className="add-to-row-name">{t("playlists.new")}</span>
                            </button>
                        ) : (
                            <div className="add-to-row add-to-new">
                                <span className="add-to-row-icon"><Plus size={18} /></span>
                                <input
                                    className="rule-input add-to-new-input"
                                    value={newName}
                                    autoFocus
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") createNew();
                                        if (e.key === "Escape") {
                                            e.stopPropagation();
                                            setNewName(null);
                                        }
                                    }}
                                />
                                <button className="editor-button primary" disabled={!newName.trim()} onClick={createNew}>
                                    {t("common.create")}
                                </button>
                            </div>
                        )}

                        {showFavorites && (
                            <button className="add-to-row" onClick={onAddToFavorites}>
                                <span className="add-to-row-icon add-to-favorites-icon"><Heart size={18} fill="currentColor" /></span>
                                <span className="add-to-row-text">
                                    <span className="add-to-row-name">{t("nav.favorites")}</span>
                                </span>
                                {allFavorite && (
                                    <span className="add-to-row-already" title={t("addTo.alreadyFavorite")}>
                                        <Check size={14} /> {t("common.added")}
                                    </span>
                                )}
                            </button>
                        )}

                        {shownPlaylists.map(playlist => {
                            const already = containsAll(playlist);
                            return (
                                <button
                                    key={playlist.id}
                                    className="add-to-row"
                                    onClick={() => onAddToPlaylist(playlist)}
                                >
                                    <PlaylistCover
                                        playlist={playlist}
                                        memberCovers={(playlist.items ?? []).flatMap(item => tracksByPath.get(item.path)?.coverPath ?? [])}
                                        size={40}
                                    />
                                    <span className="add-to-row-text">
                                        <span className="add-to-row-name">{playlist.name}</span>
                                        <span className="add-to-row-meta">
                                            {t("common.tracks", { count: playlist.items?.length ?? 0 })}
                                        </span>
                                    </span>
                                    {already && (
                                        <span className="add-to-row-already" title={t("addTo.alreadyInPlaylist")}>
                                            <Check size={14} /> {t("common.added")}
                                        </span>
                                    )}
                                </button>
                            );
                        })}

                        {shownPlaylists.length === 0 && playlists.length > 0 && !showFavorites && (
                            <div className="add-to-empty">{t("addTo.noMatch")}</div>
                        )}
                    </div>
                ) : (
                    <div className="add-to-list">
                        {exactArtist && (
                            <button className="add-to-row" onClick={() => onLinkArtist(filter.trim())}>
                                <span className="add-to-row-icon"><Plus size={18} /></span>
                                <span className="add-to-row-name">{t("addTo.linkArtist", { name: filter.trim() })}</span>
                            </button>
                        )}
                        {shownArtists.map(group => {
                            const already = hasArtist(group.name);
                            return (
                                <button
                                    key={group.key}
                                    className="add-to-row"
                                    onClick={() => onLinkArtist(group.name)}
                                >
                                    <span className="add-to-row-icon"><MicVocal size={18} /></span>
                                    <span className="add-to-row-text">
                                        <span className="add-to-row-name">{group.name}</span>
                                        <span className="add-to-row-meta">
                                            {t("common.tracks", { count: group.tracks.length })}
                                        </span>
                                    </span>
                                    {already && (
                                        <span className="add-to-row-already" title={t("addTo.alreadyLinked")}>
                                            <Check size={14} /> {t("common.added")}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                        {shownArtists.length === 0 && !exactArtist && (
                            <div className="add-to-empty">{t("addTo.noArtistMatch")}</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
