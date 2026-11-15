import { useState } from "react";
import { X } from "lucide-react";
import { useBackLayer } from "../../hooks/useBackLayer";
import { useStoredState } from "../../hooks/useRemembered";
import type { EqualizerApi } from "../../hooks/useEqualizer";
import type { SleepTimer } from "../../hooks/useSleepTimer";
import { EqualizerPanel } from "../Equalizer/EqualizerPanel";
import {
	CustomSleepDialog,
	formatSleepDuration,
	isPositiveInt,
	SLEEP_PRESETS,
} from "../SleepTimer/sleepMenu";
import { t } from "../../i18n";
import "./PlaybackOptionsDialog.css";

interface PlaybackOptionsDialogProps {
	timer: SleepTimer;
	onSleepChange: (timer: SleepTimer) => void;
	eq?: EqualizerApi | null;
	onClose: () => void;
}

/** Unified dialog: sleep timer first, equalizer last (desktop). */
export const PlaybackOptionsDialog = ({
	timer, onSleepChange, eq = null, onClose,
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
