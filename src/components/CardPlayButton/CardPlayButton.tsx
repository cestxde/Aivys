import { Play } from "lucide-react";
import "./CardPlayButton.css";

/**
 * "Play all" on a card or row of a collection (playlist, artist, tag, ...),
 * next to its ⋮ button. Shown while the parent with `card-hover` is hovered,
 * always on touch screens.
 */
export const CardPlayButton = ({ onPlay }: { onPlay: () => void }) => (
    <button
        className="card-play-button"
        title="Play all"
        aria-label="Play all"
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
