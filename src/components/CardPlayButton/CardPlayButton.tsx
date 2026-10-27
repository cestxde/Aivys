import { AudioLines, Pin, Play } from "lucide-react";
import { t } from "../../i18n";
import "./CardPlayButton.css";

/**
 * "Play all" on a card or row of a collection (playlist, artist, tag, ...),
 * next to its ⋮ button. Shown while the parent with `card-hover` is hovered,
 * always on touch screens.
 */
export const CardPlayButton = ({ onPlay }: { onPlay: () => void }) => (
    <button
        className="card-play-button"
        title={t("common.playAll")}
        aria-label={t("common.playAll")}
        onClick={(e) => {
            e.stopPropagation();
            onPlay();
        }}
        // Enter on the button plays; it must not also open the card.
        onKeyDown={(e) => e.stopPropagation()}
    >
        <Play size={14} fill="currentColor" />
    </button>
);

/** Marks the card or row that playback was started from. */
export const PlayingMark = () => (
    <span className="playing-mark" title={t("common.playingFrom")}>
        <AudioLines size={13} />
    </span>
);

/** Marks a card or row pinned to the top of its list. */
export const PinnedMark = () => (
    <span className="pinned-mark" title={t("pin.pinned")}>
        <Pin size={12} />
    </span>
);
