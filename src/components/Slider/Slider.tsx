import { useEffect, useState, useRef } from "react";
import "./Slider.css";

interface SliderProps {
    value: number;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    onChange: (value: number) => void;
    formatTooltip: (value: number) => string;
    className?: string;
    changeOn?: "drag" | "release";
    /** When this changes (e.g. track path), drop any held/drag preview. */
    syncKey?: string | number | null;
}

/** How long a committed seek may paint over the live value before we give up. */
const HOLD_MS = 900;

export const Slider = ({
    value, min, max, step, disabled, onChange, formatTooltip, className,
    changeOn = "drag", syncKey,
}: SliderProps) => {
    const [tooltip, setTooltip] = useState({ text: "", x: 0, visible: false });
    const [localValue, setLocalValue] = useState<number | null>(null);
    const [hoverPercent, setHoverPercent] = useState<number>(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    // A committed value is shown until `value` moves off the one it had then:
    // the owner may take a moment to apply it (a seek), and the bar would
    // flash back to the old position meanwhile.
    const [held, setHeld] = useState<{ value: number; from: number } | null>(null);
    const displayValue = localValue ?? (held && held.from === value ? held.value : value);

    const clearPreview = () => {
        setLocalValue(null);
        setHeld(null);
    };

    // A "release" slider commits when the press ends, wherever the pointer is
    // then: leaving the thin bar while dragging must not lose the new value.
    const commit = () => {
        if (changeOn === "release" && localValue !== null) {
            if (Math.abs(localValue - value) >= step / 2) {
                onChange(localValue);
                setHeld({ value: localValue, from: value });
            }
            setLocalValue(null);
        }
    };
    const commitRef = useRef(commit);
    useEffect(() => {
        commitRef.current = commit;
    });

    useEffect(() => {
        if (!dragging) return;
        const end = () => {
            setDragging(false);
            commitRef.current();
        };
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        return () => {
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
        };
    }, [dragging]);

    // Track change, range change, or disable: never keep a stale preview.
    useEffect(() => {
        clearPreview();
        setDragging(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync signals
    }, [syncKey, max, min, disabled]);

    // Seek applied (or timed out): drop the hold so the bar follows live time.
    useEffect(() => {
        if (!held) return;
        if (Math.abs(value - held.value) <= Math.max(step, 0.35)) {
            setHeld(null);
            return;
        }
        if (value !== held.from) {
            setHeld(null);
            return;
        }
        const timer = window.setTimeout(() => setHeld(null), HOLD_MS);
        return () => window.clearTimeout(timer);
    }, [held, value, step]);

    useEffect(() => () => clearPreview(), []);

    const handlePointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
        if (disabled) return;
        const input = e.currentTarget;
        const rect = input.getBoundingClientRect();
        const wrapperRect = wrapperRef.current?.getBoundingClientRect();
        if (!wrapperRect) return;

        const xInsideInput = e.clientX - rect.left;
        const percent = Math.min(Math.max(xInsideInput / rect.width, 0), 1);
        const val = min + percent * (max - min);

        setHoverPercent(percent * 100);
        setTooltip({
            text: formatTooltip(val),
            x: e.clientX - wrapperRect.left,
            visible: true,
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (changeOn === "drag") {
            onChange(val);
        } else if (e.nativeEvent.type !== "change") {
            // The native change comes after the release, once the commit has
            // shown the old value again (seeking takes a moment): it would
            // hold the bar there. Every value arrives by "input" first anyway.
            setLocalValue(val);
        }
    };

    const progressPercent = max > min ? ((displayValue - min) / (max - min)) * 100 : 0;

    return (
        <div className={`base-slider-wrapper ${className || ""}`} ref={wrapperRef}>
            <div
                className={`slider-tooltip ${tooltip.visible && !disabled ? "visible" : ""}`}
                style={{ left: `${tooltip.x}px` }}
            >
                {tooltip.text}
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={Number.isFinite(displayValue) ? displayValue : min}
                disabled={disabled}
                onChange={handleChange}
                onPointerDown={() => setDragging(true)}
                onKeyUp={commit}
                onPointerMove={handlePointerMove}
                onPointerEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
                onPointerLeave={() => {
                    setTooltip(prev => ({ ...prev, visible: false }));
                    setHoverPercent(0);
                }}
                className="base-slider-input"
                style={{
                    "--slider-progress": `${progressPercent}%`,
                    "--slider-hover-pos": `${hoverPercent}%`,
                } as React.CSSProperties}
            />
        </div>
    );
};
