import { useLayoutEffect, useRef } from "react";
import type { ListRow, Track } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { CoverArt } from "../CoverArt";
import { TrackList } from "../TrackList/TrackList";
import { t } from "../../i18n";
import "./QueuePanel.css";

interface QueuePanelProps {
    /** The play queue in play order, and the position playing now. */
    order: Track[];
    index: number;
    /** Play the track at queue position `index`. */
    onPlayAt: (index: number) => void;
    /** A row's `itemId` is its queue position. */
    onOpenMenu: (row: ListRow, x: number, y: number) => void;
    /** What comes after the current track, in its new order. */
    onSetUpcoming: (tracks: Track[]) => void;
}

/** "Up next": what was played, the track playing now and what follows (reorderable). */
export const QueuePanel = ({ order, index, onPlayAt, onOpenMenu, onSetUpcoming }: QueuePanelProps) => {
    const current = order[index] ?? null;
    // Rows are keyed by position: a track can be queued more than once.
    const rowAt = (position: number): ListRow => ({ key: `q${position}`, track: order[position], itemId: String(position) });
    const played = order.slice(0, Math.max(0, index)).map((_, position) => rowAt(position));
    const upcoming = order.slice(index + 1).map((_, i) => rowAt(index + 1 + i));
    const onPlay = (_: Track, row: ListRow) => onPlayAt(Number(row.itemId));

    // The played tracks are above, out of sight: the panel opens on the current one.
    const scrollerRef = useRef<HTMLDivElement>(null);
    const nowRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const scroller = scrollerRef.current;
        const now = nowRef.current;
        if (!scroller || !now) return;
        scroller.scrollTop += now.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    }, []);

    return (
        <div className="queue-panel track-list-wrapper queue-list" ref={scrollerRef}>
            {played.length > 0 && (
                <section className="queue-played">
                    <span className="queue-heading">
                        {t("queue.played")} <span className="queue-count">{played.length}</span>
                    </span>
                    <TrackList
                        rows={played}
                        activePath={null}
                        onPlay={onPlay}
                        onOpenMenu={onOpenMenu}
                    />
                </section>
            )}

            <div className="queue-rest" ref={nowRef}>
                {current && (
                    <section className="queue-now">
                        <span className="queue-heading">{t("queue.nowPlaying")}</span>
                        <div className="queue-current">
                            <CoverArt path={current.coverPath} size={40} />
                            <div className="queue-current-text">
                                <span className="queue-current-title">{displayTitle(current)}</span>
                                <span className="queue-current-artist">{displayArtists(current) ?? t("common.unknownArtist")}</span>
                            </div>
                        </div>
                    </section>
                )}

                <div className="queue-next-header">
                    <span className="queue-heading">
                        {t("queue.next")} <span className="queue-count">{upcoming.length}</span>
                    </span>
                    {upcoming.length > 0 && (
                        <button className="queue-clear" onClick={() => onSetUpcoming([])}>
                            {t("queue.clear")}
                        </button>
                    )}
                </div>

                <TrackList
                    rows={upcoming}
                    activePath={null}
                    emptyText={t(current ? "queue.empty" : "queue.nothing")}
                    onPlay={onPlay}
                    onOpenMenu={onOpenMenu}
                    onReorder={(itemIds) => onSetUpcoming(itemIds.map(id => order[Number(id)]))}
                />
            </div>
        </div>
    );
};
