import { useCallback, useEffect, useState } from "react";
import { Check, Moon, X } from "lucide-react";
import { ContextMenu, type MenuEntry } from "../ContextMenu/ContextMenu";
import type { SleepTimer } from "../../hooks/useSleepTimer";
import { useBackLayer } from "../../hooks/useBackLayer";
import { useStoredState } from "../../hooks/useRemembered";
import { t } from "../../i18n";
import "./SleepTimerButton.css";

const PRESETS = [30, 60, 90, 120];

/** Label for a duration in whole minutes ("30 minutes", "1 hour 30 minutes"). */
const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return t("sleep.minutes", { count: rest });
    if (rest === 0) return t("sleep.hours", { count: hours });
    return `${t("sleep.hours", { count: hours })} ${t("sleep.minutes", { count: rest })}`;
};

/** Compact badge: `45`, `2h`, or `1:30`. */
const formatBadge = (minutes: number) => {
    if (minutes < 60) return String(minutes);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}:${String(rest).padStart(2, "0")}`;
};

/**
 * Whole minutes left until `endsAt` (ceil, so 14:01 → 15). Refreshes every
 * second and resets when the deadline changes — otherwise a stale `now` from
 * mount time makes a fresh timer show the wrong number.
 */
const useMinutesLeft = (endsAt: number | null): number | null => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (endsAt === null) return;
        setNow(Date.now());
        const tick = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(tick);
    }, [endsAt]);
    if (endsAt === null) return null;
    const left = endsAt - now;
    if (left <= 0) return 0;
    return Math.max(1, Math.ceil(left / 60_000));
};

const isPositiveInt = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value > 0;

interface SleepTimerButtonProps {
    timer: SleepTimer;
    onChange: (timer: SleepTimer) => void;
    /** The button's look where it sits (the desktop's bar, the phone's player). */
    className: string;
    size: number;
}

/** A moon that sets the sleep timer from its menu, with time left on the badge. */
export const SleepTimerButton = ({ timer, onChange, className, size }: SleepTimerButtonProps) => {
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
    const [customOpen, setCustomOpen] = useState(false);
    const [lastCustom, setLastCustom] = useStoredState("sleep.customMinutes", 20, isPositiveInt);
    const closeMenu = useCallback(() => setMenuAt(null), []);
    const left = useMinutesLeft(timer?.kind === "time" ? timer.endsAt : null);

    const pickMinutes = (minutes: number) =>
        onChange({ kind: "time", endsAt: Date.now() + minutes * 60_000, minutes });

    const customSelected = timer?.kind === "time" && !PRESETS.includes(timer.minutes);

    const entries: MenuEntry[] = [
        { kind: "label", label: t("sleep.title") },
        ...PRESETS.map((minutes): MenuEntry => ({
            kind: "item",
            label: formatDuration(minutes),
            icon: timer?.kind === "time" && timer.minutes === minutes ? <Check size={16} /> : undefined,
            onSelect: () => pickMinutes(minutes),
        })),
        {
            kind: "item",
            label: t("sleep.endOfTrack"),
            icon: timer?.kind === "track" ? <Check size={16} /> : undefined,
            onSelect: () => onChange({ kind: "track" }),
        },
        {
            kind: "item",
            label: t("sleep.custom"),
            icon: customSelected ? <Check size={16} /> : undefined,
            onSelect: () => setCustomOpen(true),
        },
        ...(timer ? [
            { kind: "separator" as const },
            { kind: "item" as const, label: t("sleep.off"), onSelect: () => onChange(null) },
        ] : []),
    ];

    const title = timer?.kind === "time" ? t("sleep.left", { count: left ?? 0 })
        : timer?.kind === "track" ? t("sleep.endOfTrack")
        : t("sleep.title");

    return (
        <>
            <button
                className={`${className} sleep-timer-button ${timer ? "active" : ""}`}
                title={title}
                aria-label={title}
                aria-haspopup="menu"
                // The open menu closes on outside presses; let this click toggle it instead.
                onPointerDown={(e) => menuAt && e.stopPropagation()}
                onClick={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    setMenuAt(menuAt ? null : { x: box.right - 200, y: box.bottom + 4 });
                }}
            >
                <Moon size={size} fill={timer ? "currentColor" : "none"} />
                {left !== null && left > 0 && (
                    <span className="sleep-timer-left">{formatBadge(left)}</span>
                )}
            </button>
            {menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} entries={entries} onClose={closeMenu} />}
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

interface CustomSleepDialogProps {
    initialMinutes: number;
    onSave: (minutes: number) => void;
    onClose: () => void;
}

/** Hours and minutes for a custom sleep duration. */
const CustomSleepDialog = ({ initialMinutes, onSave, onClose }: CustomSleepDialogProps) => {
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
