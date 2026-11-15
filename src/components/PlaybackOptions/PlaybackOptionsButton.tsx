import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { EqualizerApi } from "../../hooks/useEqualizer";
import type { SleepTimer } from "../../hooks/useSleepTimer";
import { formatSleepBadge, useMinutesLeft } from "../SleepTimer/sleepMenu";
import { PlaybackOptionsDialog } from "./PlaybackOptionsDialog";
import { t } from "../../i18n";
import "./PlaybackOptionsButton.css";

interface PlaybackOptionsButtonProps {
	timer: SleepTimer;
	onSleepChange: (timer: SleepTimer) => void;
	/** Desktop equalizer; omit or unsupported on Android. */
	eq?: EqualizerApi | null;
	className: string;
	size: number;
}

/**
 * One player-bar control for extras: equalizer (desktop), sleep timer, and
 * room for gapless / crossfade / delay later.
 */
export const PlaybackOptionsButton = ({
	timer, onSleepChange, eq = null, className, size,
}: PlaybackOptionsButtonProps) => {
	const [open, setOpen] = useState(false);
	const left = useMinutesLeft(timer?.kind === "time" ? timer.endsAt : null);
	const eqOn = !!eq?.supported && eq.state.enabled;
	const active = !!timer || eqOn;

	const title = timer?.kind === "time" ? t("sleep.left", { count: left ?? 0 })
		: timer?.kind === "track" ? t("sleep.endOfTrack")
		: t("player.playbackOptions");

	return (
		<>
			<button
				className={`${className} playback-options-button${active ? " active" : ""}`}
				title={title}
				aria-label={t("player.playbackOptions")}
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen(true)}
			>
				<Settings2 size={size} />
				{left !== null && left > 0 && (
					<span className="playback-options-badge">{formatSleepBadge(left)}</span>
				)}
			</button>
			{open && (
				<PlaybackOptionsDialog
					timer={timer}
					onSleepChange={onSleepChange}
					eq={eq}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
};
