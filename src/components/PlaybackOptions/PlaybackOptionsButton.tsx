import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { EqualizerApi } from "../../hooks/useEqualizer";
import type { SleepTimer } from "../../hooks/useSleepTimer";
import type { TransitionMode } from "../../types";
import { formatSleepBadge, useMinutesLeft } from "../SleepTimer/sleepMenu";
import { PlaybackOptionsDialog, type TransitionSettings } from "./PlaybackOptionsDialog";
import { t } from "../../i18n";
import "./PlaybackOptionsButton.css";

interface PlaybackOptionsButtonProps {
	timer: SleepTimer;
	onSleepChange: (timer: SleepTimer) => void;
	transitionMode: TransitionMode;
	delayMs: number;
	crossfadeSec: number;
	onTransitionModeChange: (mode: TransitionMode) => void;
	onDelayMsChange: (ms: number) => void;
	onCrossfadeSecChange: (sec: number) => void;
	/** Desktop equalizer; omit or unsupported on Android. */
	eq?: EqualizerApi | null;
	className: string;
	size: number;
}

/** One player-bar control for sleep, transitions, and equalizer (desktop). */
export const PlaybackOptionsButton = ({
	timer, onSleepChange,
	transitionMode, delayMs, crossfadeSec,
	onTransitionModeChange, onDelayMsChange, onCrossfadeSecChange,
	eq = null, className, size,
}: PlaybackOptionsButtonProps) => {
	const [open, setOpen] = useState(false);
	const left = useMinutesLeft(timer?.kind === "time" ? timer.endsAt : null);
	const eqOn = !!eq?.supported && eq.state.enabled;
	const transitionOn = transitionMode === "crossfade" || delayMs > 0;
	const active = !!timer || eqOn || transitionOn;

	const title = timer?.kind === "time" ? t("sleep.left", { count: left ?? 0 })
		: timer?.kind === "track" ? t("sleep.endOfTrack")
		: t("player.playbackOptions");

	const transition: TransitionSettings = {
		mode: transitionMode,
		delayMs,
		crossfadeSec,
		onModeChange: onTransitionModeChange,
		onDelayMsChange,
		onCrossfadeSecChange,
	};

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
					transition={transition}
					eq={eq}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
};
