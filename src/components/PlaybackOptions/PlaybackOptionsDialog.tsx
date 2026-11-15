import { useState } from "react";
import { X } from "lucide-react";
import { useBackLayer } from "../../hooks/useBackLayer";
import { useStoredState } from "../../hooks/useRemembered";
import type { EqualizerApi } from "../../hooks/useEqualizer";
import type { SleepTimer } from "../../hooks/useSleepTimer";
import type { TransitionMode } from "../../types";
import {
	clampCrossfadeSec,
	clampDelayMs,
	CROSSFADE_SEC_MAX,
	CROSSFADE_SEC_MIN,
	DELAY_MS_MAX,
	DELAY_MS_MIN,
} from "../../utils/transition";
import { EqualizerPanel } from "../Equalizer/EqualizerPanel";
import {
	CustomSleepDialog,
	formatSleepDuration,
	isPositiveInt,
	SLEEP_PRESETS,
} from "../SleepTimer/sleepMenu";
import { t } from "../../i18n";
import "./PlaybackOptionsDialog.css";

export interface TransitionSettings {
	mode: TransitionMode;
	delayMs: number;
	crossfadeSec: number;
	onModeChange: (mode: TransitionMode) => void;
	onDelayMsChange: (ms: number) => void;
	onCrossfadeSecChange: (sec: number) => void;
}

interface PlaybackOptionsDialogProps {
	timer: SleepTimer;
	onSleepChange: (timer: SleepTimer) => void;
	transition: TransitionSettings;
	eq?: EqualizerApi | null;
	onClose: () => void;
}

/** Unified dialog: sleep, track transition, equalizer (desktop). */
export const PlaybackOptionsDialog = ({
	timer, onSleepChange, transition, eq = null, onClose,
}: PlaybackOptionsDialogProps) => {
	useBackLayer(true, onClose);
	const [customOpen, setCustomOpen] = useState(false);
	const [lastCustom, setLastCustom] = useStoredState("sleep.customMinutes", 20, isPositiveInt);
	const customSelected = timer?.kind === "time" && !SLEEP_PRESETS.includes(timer.minutes);

	const pickMinutes = (minutes: number) =>
		onSleepChange({ kind: "time", endsAt: Date.now() + minutes * 60_000, minutes });

	return (
		<>
			<div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
				<div
					className="playback-options-dialog"
					role="dialog"
					aria-label={t("player.playbackOptions")}
				>
					<div className="playback-options-header">
						<h2>{t("player.playbackOptions")}</h2>
						<button type="button" className="add-to-close" title={t("common.close")} onClick={onClose}>
							<X size={18} />
						</button>
					</div>

					<div className="playback-options-scroll">
						<section className="playback-options-section">
							<h3>{t("sleep.title")}</h3>
							<div className="playback-sleep-choices">
								{SLEEP_PRESETS.map(minutes => {
									const selected = timer?.kind === "time" && timer.minutes === minutes;
									return (
										<button
											key={minutes}
											type="button"
											className={`playback-choice${selected ? " is-selected" : ""}`}
											onClick={() => pickMinutes(minutes)}
										>
											{formatSleepDuration(minutes)}
										</button>
									);
								})}
								<button
									type="button"
									className={`playback-choice${timer?.kind === "track" ? " is-selected" : ""}`}
									onClick={() => onSleepChange({ kind: "track" })}
								>
									{t("sleep.endOfTrack")}
								</button>
								<button
									type="button"
									className={`playback-choice${customSelected ? " is-selected" : ""}`}
									onClick={() => setCustomOpen(true)}
								>
									{t("sleep.custom")}
								</button>
								{timer && (
									<button
										type="button"
										className="playback-choice playback-choice-off"
										onClick={() => onSleepChange(null)}
									>
										{t("sleep.off")}
									</button>
								)}
							</div>
						</section>

						<section className="playback-options-section">
							<h3>{t("player.transition.title")}</h3>
							<div className="playback-sleep-choices">
								<button
									type="button"
									className={`playback-choice${transition.mode === "gapless" ? " is-selected" : ""}`}
									onClick={() => transition.onModeChange("gapless")}
								>
									{t("player.transition.gapless")}
								</button>
								<button
									type="button"
									className={`playback-choice${transition.mode === "crossfade" ? " is-selected" : ""}`}
									onClick={() => transition.onModeChange("crossfade")}
								>
									{t("player.transition.crossfade")}
								</button>
							</div>

							{transition.mode === "gapless" ? (
								<label className="playback-param">
									<span className="playback-param-label">
										{t("player.transition.delay")}
										<span className="playback-param-value">
											{t("player.transition.delayValue", { ms: transition.delayMs })}
										</span>
									</span>
									<input
										type="range"
										min={DELAY_MS_MIN}
										max={DELAY_MS_MAX}
										step={50}
										value={transition.delayMs}
										onChange={(e) => transition.onDelayMsChange(clampDelayMs(Number(e.target.value)))}
									/>
								</label>
							) : (
								<label className="playback-param">
									<span className="playback-param-label">
										{t("player.transition.crossfadeDuration")}
										<span className="playback-param-value">
											{t("player.transition.crossfadeValue", { sec: transition.crossfadeSec })}
										</span>
									</span>
									<input
										type="range"
										min={CROSSFADE_SEC_MIN}
										max={CROSSFADE_SEC_MAX}
										step={0.5}
										value={transition.crossfadeSec}
										onChange={(e) => transition.onCrossfadeSecChange(clampCrossfadeSec(Number(e.target.value)))}
									/>
								</label>
							)}
						</section>

						{eq?.supported && (
							<section className="playback-options-section">
								<h3>{t("eq.title")}</h3>
								<EqualizerPanel eq={eq} />
							</section>
						)}
					</div>
				</div>
			</div>

			{customOpen && (
				<CustomSleepDialog
					initialMinutes={customSelected && timer?.kind === "time" ? timer.minutes : lastCustom}
					onSave={(minutes) => {
						setLastCustom(minutes);
						pickMinutes(minutes);
						setCustomOpen(false);
					}}
					onClose={() => setCustomOpen(false)}
				/>
			)}
		</>
	);
};
