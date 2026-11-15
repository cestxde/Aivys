import { X } from "lucide-react";
import { useBackLayer } from "../../hooks/useBackLayer";
import type { EqualizerApi } from "../../hooks/useEqualizer";
import {
	EQ_BANDS, EQ_GAIN_MAX, EQ_GAIN_MIN, EQ_PRESETS, formatBandHz,
} from "../../utils/equalizer";
import { t } from "../../i18n";
import "./EqualizerDialog.css";

interface EqualizerDialogProps {
	eq: EqualizerApi;
	onClose: () => void;
}

/** Desktop graphic equalizer: enable, preamp, 10 bands, presets. */
export const EqualizerDialog = ({ eq, onClose }: EqualizerDialogProps) => {
	useBackLayer(true, onClose);
	const { state, setEnabled, setPreamp, setBand, setPreset } = eq;

	return (
		<div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
			<div className="eq-dialog" role="dialog" aria-label={t("eq.title")}>
				<div className="eq-header">
					<h2>{t("eq.title")}</h2>
					<button type="button" className="add-to-close" title={t("common.close")} onClick={onClose}>
						<X size={18} />
					</button>
				</div>

				<div className="eq-toolbar">
					<label className="eq-toggle">
						<input
							type="checkbox"
							checked={state.enabled}
							onChange={(e) => setEnabled(e.target.checked)}
						/>
						<span>{t("eq.enabled")}</span>
					</label>

					<label className="eq-preset">
						<span className="eq-preset-label">{t("eq.preset")}</span>
						<select
							className="rule-input"
							value={state.presetId === "custom" ? "custom" : state.presetId}
							onChange={(e) => {
								const id = e.target.value;
								if (id === "custom") return;
								setPreset(id);
							}}
						>
							{EQ_PRESETS.map(preset => (
								<option key={preset.id} value={preset.id}>
									{t(preset.labelKey)}
								</option>
							))}
							<option value="custom">{t("eq.preset.custom")}</option>
						</select>
					</label>
				</div>

				<label className="eq-preamp">
					<span className="eq-preamp-label">
						{t("eq.preamp")}
						<span className="eq-preamp-value">
							{state.preamp > 0 ? "+" : ""}{state.preamp.toFixed(0)} dB
						</span>
					</span>
					<input
						type="range"
						min={EQ_GAIN_MIN}
						max={EQ_GAIN_MAX}
						step={1}
						value={state.preamp}
						disabled={!state.enabled}
						onChange={(e) => setPreamp(Number(e.target.value))}
					/>
				</label>

				<div className={`eq-bands${state.enabled ? "" : " is-disabled"}`}>
					{EQ_BANDS.map((hz, index) => (
						<label key={hz} className="eq-band">
							<span className="eq-band-gain">
								{state.gains[index] > 0 ? "+" : ""}{state.gains[index].toFixed(0)}
							</span>
							<input
								type="range"
								min={EQ_GAIN_MIN}
								max={EQ_GAIN_MAX}
								step={1}
								value={state.gains[index]}
								disabled={!state.enabled}
								aria-label={t("eq.band", { hz: formatBandHz(hz) })}
								onChange={(e) => setBand(index, Number(e.target.value))}
							/>
							<span className="eq-band-hz">{formatBandHz(hz)}</span>
						</label>
					))}
				</div>
			</div>
		</div>
	);
};
