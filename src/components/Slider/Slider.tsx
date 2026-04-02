import { useRef, useState } from "react";
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
    changeOn?: 'drag' | 'release';
}

export const Slider = ({
    value, min, max, step, disabled, onChange, formatTooltip, className,
    changeOn = 'drag'
}: SliderProps) => {
    const [tooltip, setTooltip] = useState({ text: "", x: 0, visible: false });
    const [localValue, setLocalValue] = useState<number | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const displayValue = localValue !== null ? localValue : value;

    const handleMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
        if (disabled) return;
        const input = e.currentTarget;
        const rect = input.getBoundingClientRect();
        const wrapperRect = wrapperRef.current?.getBoundingClientRect();
        if (!wrapperRect) return;

        const xInsideInput = e.clientX - rect.left;
        const percent = Math.min(Math.max(xInsideInput / rect.width, 0), 1);
        const val = min + percent * (max - min);

        setTooltip({
            text: formatTooltip(val),
            x: e.clientX - wrapperRect.left,
            visible: true
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (changeOn === 'drag') {
            onChange(val);
        } else {
            setLocalValue(val);
        }
    };

    const handleMouseUp = () => {
        if (changeOn === 'release' && localValue !== null) {
            onChange(localValue);
            setLocalValue(null);
        }
    };

    const progress = max > min ? ((displayValue - min) / (max - min)) * 100 : 0;

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
                value={displayValue}
                disabled={disabled}
                onChange={handleChange}
                onMouseUp={handleMouseUp}
                onKeyUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
                onMouseLeave={() => {
                    setTooltip(prev => ({ ...prev, visible: false }));
                    if (localValue !== null) setLocalValue(null);
                }}
                className="base-slider-input"
                style={{
                    background: !disabled
                        ? `linear-gradient(to right, var(--accent) ${progress}%, var(--border) ${progress}%)`
                        : "var(--border)"
                }}
            />
        </div>
    );
};