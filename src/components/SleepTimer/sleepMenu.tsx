import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useBackLayer } from "../../hooks/useBackLayer";
import { t } from "../../i18n";
import "./SleepTimerButton.css";

export const SLEEP_PRESETS = [30, 60, 90, 120];

/** Label for a duration in whole minutes ("30 minutes", "1 hour 30 minutes"). */
export const formatSleepDuration = (minutes: number) => {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return t("sleep.minutes", { count: rest });
	if (rest === 0) return t("sleep.hours", { count: hours });
	return `${t("sleep.hours", { count: hours })} ${t("sleep.minutes", { count: rest })}`;
};

/** Compact badge: `45`, `2h`, or `1:30`. */
export const formatSleepBadge = (minutes: number) => {
	if (minutes < 60) return String(minutes);
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}h` : `${hours}:${String(rest).padStart(2, "0")}`;
};

/**
 * Whole minutes left until `endsAt` (ceil, so 14:01 → 15). Refreshes every
 * second and resets when the deadline changes.
 */
export const useMinutesLeft = (endsAt: number | null): number | null => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (endsAt === null) return;
		setNow(Date.now());
		const tick = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(tick);
	}, [endsAt]);
	if (endsAt === null) return null;
	const left = endsAt - now;
	if (left <= 0) return 0;
	return Math.max(1, Math.ceil(left / 60_000));
};

export const isPositiveInt = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value > 0;

interface CustomSleepDialogProps {
	initialMinutes: number;
	onSave: (minutes: number) => void;
	onClose: () => void;
}

/** Hours and minutes for a custom sleep duration. */
export const CustomSleepDialog = ({ initialMinutes, onSave, onClose }: CustomSleepDialogProps) => {
	useBackLayer(true, onClose);
	const [hours, setHours] = useState(String(Math.floor(initialMinutes / 60)));
	const [minutes, setMinutes] = useState(String(initialMinutes % 60));

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const hoursN = Math.max(0, Math.floor(Number(hours)) || 0);
	const minutesN = Math.min(59, Math.max(0, Math.floor(Number(minutes)) || 0));
	const total = hoursN * 60 + minutesN;
	const valid = total > 0 && total <= 24 * 60;

	const save = () => {
		if (valid) onSave(total);
	};

	const onHours = (value: string) => {
		if (value === "" || /^\d{1,2}$/.test(value)) setHours(value);
	};
	const onMins = (value: string) => {
		if (value === "" || /^\d{1,2}$/.test(value)) setMinutes(value);
	};

	return (
		<div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
			<div className="sleep-custom-dialog" role="dialog" aria-label={t("sleep.customTitle")}>
				<div className="sleep-custom-header">
					<h2>{t("sleep.customTitle")}</h2>
					<button type="button" className="sleep-custom-close" title={t("common.close")} onClick={onClose}>
						<X size={18} />
					</button>
				</div>

				<div className="sleep-custom-fields">
					<label className="sleep-custom-field">
						{t("sleep.hoursLabel")}
						<input
							type="text"
							inputMode="numeric"
							value={hours}
							autoFocus
							onFocus={(e) => e.currentTarget.select()}
							onChange={(e) => onHours(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && save()}
						/>
					</label>
					<label className="sleep-custom-field">
						{t("sleep.minutesLabel")}
						<input
							type="text"
							inputMode="numeric"
							value={minutes}
							onFocus={(e) => e.currentTarget.select()}
							onChange={(e) => onMins(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && save()}
						/>
					</label>
				</div>

				<div className="sleep-custom-footer">
					<button type="button" onClick={onClose}>{t("common.cancel")}</button>
					<button type="button" className="primary" disabled={!valid} onClick={save}>
						{t("common.save")}
					</button>
				</div>
			</div>
		</div>
	);
};
