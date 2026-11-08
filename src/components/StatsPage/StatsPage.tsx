import { useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BarChart3, ChevronDown, ChevronUp, Heart, Music2, Tag } from "lucide-react";
import type { Track, TrackStats, View } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import {
    libraryOverview, sinceOf, STATS_PERIODS, STATS_PREVIEW, type RankedArtist, type RankedTrack, type StatsPeriod,
} from "../../utils/libraryStats";
import { UNTAGGED_KEY } from "../../utils/views";
import { useRememberedScroll } from "../../hooks/useRemembered";
import { notifyError } from "../../utils/notify";
import { CoverArt } from "../CoverArt";
import { t, type MessageKey } from "../../i18n";
import "./StatsPage.css";

interface StatsPageProps {
    files: Track[];
    stats: Record<string, TrackStats>;
    /** Cover path for an artist group key, if any. */
    artistCover: (key: string) => string | null | undefined;
    /** Play this track, using the ranked list as the queue when it came from one. */
    onPlayTrack: (track: Track, queue: Track[]) => void;
    onOpenArtist: (key: string) => void;
    onOpenView: (view: View) => void;
}

const PERIOD_LABEL: Record<StatsPeriod, MessageKey> = {
    day: "stats.periodDay",
    month: "stats.periodMonth",
    year: "stats.periodYear",
    all: "stats.periodAll",
};

const Metric = ({
    icon, label, value, onClick,
}: {
    icon: ReactNode;
    label: string;
    value: number;
    onClick?: () => void;
}) => {
    const body = (
        <>
            <span className="stats-metric-label">{icon}{label}</span>
            <span className="stats-metric-value">{value.toLocaleString()}</span>
        </>
    );
    return onClick ? (
        <button type="button" className="stats-metric" onClick={onClick}>{body}</button>
    ) : (
        <div className="stats-metric">{body}</div>
    );
};

const RankList = <T,>({
    title, empty, rows, preview = STATS_PREVIEW, renderRow,
}: {
    title: string;
    empty: string;
    rows: T[];
    preview?: number;
    renderRow: (row: T, index: number) => ReactNode;
}) => {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? rows : rows.slice(0, preview);
    const canExpand = rows.length > preview;

    return (
        <section className="stats-section">
            <h2 className="stats-section-title">{title}</h2>
            <div className="stats-rank-list">
                {rows.length === 0 ? (
                    <p className="stats-empty">{empty}</p>
                ) : (
                    visible.map((row, index) => renderRow(row, index))
                )}
                {canExpand && (
                    <button
                        type="button"
                        className="stats-expand"
                        onClick={() => setExpanded(open => !open)}
                    >
                        {expanded ? (
                            <><ChevronUp size={14} />{t("stats.showLess")}</>
                        ) : (
                            <><ChevronDown size={14} />{t("stats.showAll", { count: rows.length })}</>
                        )}
                    </button>
                )}
            </div>
        </section>
    );
};

const TrackRow = ({
    rank, row, onPlay,
}: {
    rank: number;
    row: RankedTrack;
    onPlay: () => void;
}) => (
    <button type="button" className="stats-rank-row" onClick={onPlay}>
        <span className="stats-rank-n">{rank}</span>
        <CoverArt path={row.track.coverPath} size={36} className="stats-rank-cover" />
        <span className="stats-rank-text">
            <span className="stats-rank-title">{displayTitle(row.track)}</span>
            {displayArtists(row.track) && (
                <span className="stats-rank-sub">{displayArtists(row.track)}</span>
            )}
        </span>
        <span className="stats-rank-count">{t("detail.playCount", { count: row.plays })}</span>
    </button>
);

const ArtistRow = ({
    rank, row, cover, onOpen,
}: {
    rank: number;
    row: RankedArtist;
    cover: string | null | undefined;
    onOpen: () => void;
}) => (
    <button type="button" className="stats-rank-row" onClick={onOpen}>
        <span className="stats-rank-n">{rank}</span>
        <CoverArt path={cover} size={36} className="stats-rank-cover round" />
        <span className="stats-rank-text">
            <span className="stats-rank-title">{row.name}</span>
            <span className="stats-rank-sub">{t("common.tracks", { count: row.tracks })}</span>
        </span>
        <span className="stats-rank-count">{t("detail.playCount", { count: row.plays })}</span>
    </button>
);

/** Library overview from play journals, with a period switch. */
export const StatsPage = ({
    files, stats, artistCover, onPlayTrack, onOpenArtist, onOpenView,
}: StatsPageProps) => {
    const { ref: scrollRef, onScroll } = useRememberedScroll("stats");
    const [period, setPeriod] = useState<StatsPeriod>("month");
    const [loaded, setLoaded] = useState<{ period: StatsPeriod; counts: Record<string, number> } | null>(null);

    useEffect(() => {
        if (period === "all") return;
        let cancelled = false;
        const since = sinceOf(period);
        invoke<Record<string, number>>("get_play_counts", { since })
            .then(counts => {
                if (!cancelled) setLoaded({ period, counts });
            })
            .catch(e => {
                if (!cancelled) notifyError(t("error.loadPlayCounts"), e);
            });
        return () => {
            cancelled = true;
        };
    }, [period, files]);

    const periodPlays = period === "all"
        ? null
        : loaded?.period === period ? loaded.counts : {};

    const overview = useMemo(
        () => libraryOverview(files, stats, periodPlays),
        [files, stats, periodPlays],
    );

    const trackQueue = (rows: RankedTrack[]) => rows.map(row => row.track);
    const waiting = period !== "all" && loaded?.period !== period;

    return (
        <div className="stats-page" ref={scrollRef} onScroll={onScroll}>
            <div className="stats-header">
                <h1 className="stats-title">{t("nav.stats")}</h1>
                <div className="stats-periods" role="radiogroup" aria-label={t("stats.period")}>
                    {STATS_PERIODS.map(option => (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={period === option}
                            className={period === option ? "active" : ""}
                            onClick={() => setPeriod(option)}
                        >
                            {t(PERIOD_LABEL[option])}
                        </button>
                    ))}
                </div>
            </div>

            <div className={`stats-body ${waiting ? "waiting" : ""}`}>
                <div className="stats-metrics">
                    <Metric
                        icon={<Music2 size={14} />}
                        label={t("stats.tracks")}
                        value={overview.tracks}
                        onClick={() => onOpenView({ kind: "system", id: "library" })}
                    />
                    <Metric
                        icon={<BarChart3 size={14} />}
                        label={t("stats.plays")}
                        value={overview.plays}
                        onClick={() => onOpenView({ kind: "system", id: "mostPlayed" })}
                    />
                    <Metric
                        icon={<Heart size={14} />}
                        label={t("stats.favorites")}
                        value={overview.favorites}
                        onClick={() => onOpenView({ kind: "system", id: "favorites" })}
                    />
                    <Metric
                        icon={<Tag size={14} />}
                        label={t("stats.untagged")}
                        value={overview.untagged}
                        onClick={() => onOpenView({ kind: "tag", id: UNTAGGED_KEY })}
                    />
                </div>

                <RankList
                    title={t("stats.topTracks")}
                    empty={t("stats.noPlays")}
                    rows={overview.topTracks}
                    renderRow={(row, i) => (
                        <TrackRow
                            key={row.track.relPath}
                            rank={i + 1}
                            row={row}
                            onPlay={() => onPlayTrack(row.track, trackQueue(overview.topTracks))}
                        />
                    )}
                />

                <RankList
                    title={t("stats.topArtists")}
                    empty={t("stats.noPlays")}
                    rows={overview.topArtists}
                    renderRow={(row, i) => (
                        <ArtistRow
                            key={row.key}
                            rank={i + 1}
                            row={row}
                            cover={artistCover(row.key)}
                            onOpen={() => onOpenArtist(row.key)}
                        />
                    )}
                />

                <RankList
                    title={t("stats.forgotten")}
                    empty={t("stats.noForgotten")}
                    rows={overview.forgotten}
                    renderRow={(row, i) => (
                        <TrackRow
                            key={row.track.relPath}
                            rank={i + 1}
                            row={row}
                            onPlay={() => onPlayTrack(row.track, trackQueue(overview.forgotten))}
                        />
                    )}
                />
            </div>
        </div>
    );
};
