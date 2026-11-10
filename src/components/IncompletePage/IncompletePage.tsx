import { useMemo, type ReactNode } from "react";
import { Disc3, ImageOff, MicVocal, Tag, Type } from "lucide-react";
import type { IncompleteGap, Track, TrackStats } from "../../types";
import { INCOMPLETE_GAPS, incompleteCounts } from "../../utils/incomplete";
import { useRememberedScroll } from "../../hooks/useRemembered";
import { t, type MessageKey } from "../../i18n";
import "./IncompletePage.css";

const GAP_LABEL: Record<IncompleteGap, MessageKey> = {
    noArtist: "incomplete.noArtist",
    noTitle: "incomplete.noTitle",
    noAlbum: "incomplete.noAlbum",
    noCover: "incomplete.noCover",
    noTags: "incomplete.noTags",
};

const GAP_HINT: Record<IncompleteGap, MessageKey> = {
    noArtist: "incomplete.noArtistHint",
    noTitle: "incomplete.noTitleHint",
    noAlbum: "incomplete.noAlbumHint",
    noCover: "incomplete.noCoverHint",
    noTags: "incomplete.noTagsHint",
};

const GAP_ICON: Record<IncompleteGap, ReactNode> = {
    noArtist: <MicVocal size={18} />,
    noTitle: <Type size={18} />,
    noAlbum: <Disc3 size={18} />,
    noCover: <ImageOff size={18} />,
    noTags: <Tag size={18} />,
};

interface IncompletePageProps {
    files: Track[];
    stats: Record<string, TrackStats>;
    onOpenGap: (gap: IncompleteGap) => void;
}

/** Hub of metadata gaps: counts per kind, each opens its track list. */
export const IncompletePage = ({ files, stats, onOpenGap }: IncompletePageProps) => {
    const { ref: scrollRef, onScroll } = useRememberedScroll("incomplete");
    const counts = useMemo(() => incompleteCounts(files, stats), [files, stats]);

    return (
        <div className="incomplete-page" ref={scrollRef} onScroll={onScroll}>
            <div className="incomplete-header">
                <h1 className="incomplete-title">{t("nav.incomplete")}</h1>
                <p className="incomplete-lead">{t("incomplete.lead")}</p>
            </div>

            <div className="incomplete-gaps">
                {INCOMPLETE_GAPS.map(gap => {
                    const count = counts[gap];
                    const body = (
                        <>
                            <span className="incomplete-gap-icon">{GAP_ICON[gap]}</span>
                            <span className="incomplete-gap-text">
                                <span className="incomplete-gap-title">{t(GAP_LABEL[gap])}</span>
                                <span className="incomplete-gap-hint">
                                    {count === 0 ? t("incomplete.allFilled") : t(GAP_HINT[gap])}
                                </span>
                            </span>
                            <span className="incomplete-gap-count">{count.toLocaleString()}</span>
                        </>
                    );
                    return count > 0 ? (
                        <button
                            key={gap}
                            type="button"
                            className="incomplete-gap"
                            onClick={() => onOpenGap(gap)}
                        >
                            {body}
                        </button>
                    ) : (
                        <div key={gap} className="incomplete-gap is-empty">
                            {body}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
