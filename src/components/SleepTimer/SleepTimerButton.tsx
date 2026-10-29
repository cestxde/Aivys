import { useCallback, useEffect, useState } from "react";
import { Check, Moon } from "lucide-react";
import { ContextMenu, type MenuEntry } from "../ContextMenu/ContextMenu";
import type { SleepTimer } from "../../hooks/useSleepTimer";
import { t } from "../../i18n";
import "./SleepTimerButton.css";

const MINUTES = [15, 30, 45, 60, 90];

/** Minutes left until `endsAt`, kept current while it runs. */
const useMinutesLeft = (endsAt: number | null): number | null => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (endsAt === null) return;
        const tick = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => clearInterval(tick);
    }, [endsAt]);
    return endsAt === null ? null : Math.max(1, Math.ceil((endsAt - now) / 60_000));
};

interface SleepTimerButtonProps {
    timer: SleepTimer;
    onChange: (timer: SleepTimer) => void;
    /** The button's look where it sits (the desktop's bar, the phone's player). */
    className: string;
    size: number;
}

/** A moon that sets the sleep timer from its menu, with the minutes left beside it. */
export const SleepTimerButton = ({ timer, onChange, className, size }: SleepTimerButtonProps) => {
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
    const closeMenu = useCallback(() => setMenuAt(null), []);
    const left = useMinutesLeft(timer?.kind === "time" ? timer.endsAt : null);

    const entries: MenuEntry[] = [
        { kind: "label", label: t("sleep.title") },
        ...MINUTES.map((minutes): MenuEntry => ({
            kind: "item",
            label: t("sleep.minutes", { count: minutes }),
            onSelect: () => onChange({ kind: "time", endsAt: Date.now() + minutes * 60_000 }),
        })),
        {
            kind: "item",
            label: t("sleep.endOfTrack"),
            icon: timer?.kind === "track" ? <Check size={16} /> : undefined,
            onSelect: () => onChange({ kind: "track" }),
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
                {left !== null && <span className="sleep-timer-left">{left}</span>}
            </button>
            {menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} entries={entries} onClose={closeMenu} />}
        </>
    );
};
