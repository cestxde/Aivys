import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, X } from "lucide-react";
import { t } from "../../i18n";
import "./CoverViewer.css";
import { useBackLayer } from "../../hooks/useBackLayer";

interface CoverViewerProps {
    /** Cover file path, or null for the placeholder. */
    path: string | null;
    /** Called when the viewer should close. */
    onClose: () => void;
}

/** How far the cover zooms in, times its size. */
const MAX_ZOOM = 6;

/** Zoom of a double click or double tap. */
const DOUBLE_ZOOM = 2.5;

/** Two taps within this long (ms) are a double tap. */
const DOUBLE_TAP_MS = 350;

/** A finger that moves less than this (px) still taps: it never rests quite still. */
const TAP_SLOP = 10;

interface View {
    scale: number;
    x: number;
    y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };

/**
 * `view` zoomed to `scale` around the point (`px`, `py`), relative to the
 * cover's center: that point stays where it is.
 */
const zoomAt = (view: View, scale: number, px: number, py: number): View => {
    const next = Math.min(MAX_ZOOM, Math.max(1, scale));
    if (next === 1) return FIT;
    const ratio = next / view.scale;
    return { scale: next, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
};

/**
 * Full-screen overlay showing a cover at a large size. It zooms with the
 * wheel, a pinch, or a double click / tap, and pans by dragging while zoomed.
 */
export const CoverViewer = ({ path, onClose }: CoverViewerProps) => {
    useBackLayer(true, onClose);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const [view, setView] = useState<View>(FIT);
    const [gesture, setGesture] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    // The pointers down on the cover, and where each was last.
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    // A drag or a pinch is no click: the click after it does not close.
    const moved = useRef(false);
    const downAt = useRef({ x: 0, y: 0 });
    const lastTap = useRef(0);

    /** The point (`clientX`, `clientY`) relative to the cover's center, unzoomed. */
    const fromCenter = (clientX: number, clientY: number) => {
        const rect = box.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
    };

    const onWheel = (e: WheelEvent) => {
        if (!path) return;
        const point = fromCenter(e.clientX, e.clientY);
        setView(view => zoomAt(view, view.scale * Math.exp(-e.deltaY * 0.002), point.x, point.y));
    };

    const toggleZoom = (clientX: number, clientY: number) => {
        const point = fromCenter(clientX, clientY);
        setView(view => (view.scale > 1 ? FIT : zoomAt(view, DOUBLE_ZOOM, point.x, point.y)));
    };

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (!path) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 1) {
            moved.current = false;
            downAt.current = { x: e.clientX, y: e.clientY };
        } else {
            moved.current = true;
        }
        setGesture(true);
    };

    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        const before = pointers.current.get(e.pointerId);
        if (!before) return;
        const others = [...pointers.current].filter(([id]) => id !== e.pointerId).map(([, at]) => at);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) > TAP_SLOP) moved.current = true;

        if (others.length === 1) {
            // A pinch: the zoom follows the fingers' distance, around their middle.
            const other = others[0];
            const was = Math.hypot(before.x - other.x, before.y - other.y);
            const now = Math.hypot(e.clientX - other.x, e.clientY - other.y);
            if (was === 0) return;
            const middle = fromCenter((e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
            const shiftX = (e.clientX - before.x) / 2;
            const shiftY = (e.clientY - before.y) / 2;
            setView(view => {
                const zoomed = zoomAt(view, view.scale * (now / was), middle.x, middle.y);
                return zoomed.scale === 1 ? zoomed : { ...zoomed, x: zoomed.x + shiftX, y: zoomed.y + shiftY };
            });
        } else if (others.length === 0) {
            // A drag pans the zoomed cover.
            setView(view => (view.scale === 1 ? view
                : { ...view, x: view.x + e.clientX - before.x, y: view.y + e.clientY - before.y }));
        }
    };

    const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
        if (!pointers.current.delete(e.pointerId)) return;
        if (pointers.current.size > 0) return;
        setGesture(false);
        if (moved.current) return;
        // A double tap (or click) zooms in, or back out.
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
            lastTap.current = 0;
            toggleZoom(e.clientX, e.clientY);
        } else {
            lastTap.current = now;
        }
    };

    return (
        <div className="cover-viewer-backdrop" onClick={onClose} onWheel={onWheel}>
            <button className="cover-viewer-close" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}>
                <X size={22} />
            </button>
            <div
                ref={box}
                className={`cover-viewer-image ${view.scale > 1 ? "zoomed" : ""}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {path ? (
                    <img
                        src={convertFileSrc(path)}
                        alt=""
                        draggable={false}
                        style={{
                            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                            transition: gesture ? "none" : undefined,
                        }}
                    />
                ) : (
                    <Music size={72} />
                )}
            </div>
        </div>
    );
};
