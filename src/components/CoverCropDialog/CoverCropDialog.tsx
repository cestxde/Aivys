import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { finishCrop, useCropRequest } from "../../utils/coverCrop";
import { useBackLayer } from "../../hooks/useBackLayer";
import { t } from "../../i18n";
import { notifyError } from "../../utils/notify";
import "./CoverCropDialog.css";

/** The smallest frame, as a share of the picture's shorter side. */
const MIN_SHARE = 0.15;

/** The square to keep, in the picture's own pixels. */
interface Frame {
    x: number;
    y: number;
    side: number;
}

/** Which corner of the frame is being dragged to resize it. */
type Corner = "nw" | "ne" | "sw" | "se";

/** What the pointer is dragging: the frame itself, or one of its corners. */
type Drag =
    | { kind: "move"; x: number; y: number; frame: Frame }
    | { kind: "resize"; corner: Corner; x: number; y: number; frame: Frame; px: number; py: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** "Which square of this picture is the cover?": a frame to move and resize over it. */
export const CoverCropDialog = () => {
    const request = useCropRequest();
    if (!request) return null;
    return <CropStage key={request.url} url={request.url} />;
};

const CropStage = ({ url }: { url: string }) => {
    useBackLayer(true, () => finishCrop(null));
    const picture = useRef<HTMLImageElement>(null);
    // The picture's size in its own pixels, and how many shown pixels one of them is.
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    const [scale, setScale] = useState(1);
    const [frame, setFrame] = useState<Frame | null>(null);
    const drag = useRef<Drag | null>(null);

    const measure = useCallback(() => {
        const element = picture.current;
        if (element && element.naturalWidth) setScale(element.clientWidth / element.naturalWidth);
    }, []);

    // The frame starts as the biggest square, in the middle.
    const onLoad = () => {
        const element = picture.current;
        if (!element) return;
        const { naturalWidth: width, naturalHeight: height } = element;
        const side = Math.min(width, height);
        setSize({ width, height });
        setFrame({ x: (width - side) / 2, y: (height - side) / 2, side });
        measure();
    };

    // The picture's shown size follows the window.
    useEffect(() => {
        const element = picture.current;
        if (!element) return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [measure]);

    const shortest = size ? Math.min(size.width, size.height) : 1;

    /** `next`, kept inside the picture and within the sizes allowed. */
    const fit = (next: Frame): Frame => {
        if (!size) return next;
        const side = clamp(next.side, shortest * MIN_SHARE, shortest);
        return { side, x: clamp(next.x, 0, size.width - side), y: clamp(next.y, 0, size.height - side) };
    };

    /** A resized square: `corner` follows the pointer, its opposite corner stays. */
    const resizeFrame = (base: Frame, corner: Corner, px: number, py: number): Frame => {
        const { x, y, side } = base;
        let next: Frame;
        if (corner === "nw") {
            const fx = x + side;
            const fy = y + side;
            const s = (fx - px + fy - py) / 2;
            next = { side: s, x: fx - s, y: fy - s };
        } else if (corner === "ne") {
            const fx = x;
            const fy = y + side;
            const s = (px - fx + fy - py) / 2;
            next = { side: s, x: fx, y: fy - s };
        } else if (corner === "sw") {
            const fx = x + side;
            const fy = y;
            const s = (fx - px + py - fy) / 2;
            next = { side: s, x: fx - s, y: fy };
        } else {
            const fx = x;
            const fy = y;
            const s = (px - fx + py - fy) / 2;
            next = { side: s, x: fx, y: fy };
        }
        return fit(next);
    };

    const confirm = () => {
        // Only the square is reported; the (slow) crop happens after this
        // window closes, in `cropImage`, with a spinner on the cover.
        if (frame) finishCrop(frame);
    };

    // Escape cancels and Enter keeps the frame; the dialogs below do not hear them.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" && e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") finishCrop(null);
            else confirm();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    /** Where the pointer is in the picture's own pixels (for corner resize). */
    const pointerInImage = (e: ReactPointerEvent) => {
        const element = picture.current;
        if (!element) return { x: 0, y: 0 };
        const rect = element.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
    };

    const onPicturePointerDown = (e: ReactPointerEvent) => {
        if (!frame) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { kind: "move", x: e.clientX, y: e.clientY, frame };
    };

    const onHandlePointerDown = (corner: Corner) => (e: ReactPointerEvent) => {
        if (!frame) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const pointer = pointerInImage(e);
        drag.current = { kind: "resize", corner, x: e.clientX, y: e.clientY, frame, px: pointer.x, py: pointer.y };
    };

    const onPointerMove = (e: ReactPointerEvent) => {
        const start = drag.current;
        if (!start) return;
        if (start.kind === "move") {
            setFrame(fit({
                ...start.frame,
                x: start.frame.x + (e.clientX - start.x) / scale,
                y: start.frame.y + (e.clientY - start.y) / scale,
            }));
        } else {
            const px = start.px + (e.clientX - start.x) / scale;
            const py = start.py + (e.clientY - start.y) / scale;
            setFrame(resizeFrame(start.frame, start.corner, px, py));
        }
    };

    const endDrag = () => { drag.current = null; };

    return (
        <div className="crop-backdrop" onPointerDown={(e) => e.target === e.currentTarget && finishCrop(null)}>
            <div className="crop-dialog" role="dialog" aria-label={t("cover.cropTitle")}>
                <h2>{t("cover.cropTitle")}</h2>
                <p className="crop-hint">{t("cover.cropHint")}</p>
                <div className="crop-stage">
                    <div
                        className="crop-picture-box"
                        onPointerDown={onPicturePointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                    >
                        <img
                            ref={picture}
                            src={url}
                            alt=""
                            className="crop-picture"
                            draggable={false}
                            onLoad={onLoad}
                            onError={() => { notifyError(t("cover.cropFailed")); finishCrop(null); }}
                        />
                        {!frame && <div className="crop-loading">{t("cover.cropLoading")}</div>}
                        {frame && (
                            <div
                                className="crop-frame"
                                style={{
                                    left: frame.x * scale,
                                    top: frame.y * scale,
                                    width: frame.side * scale,
                                    height: frame.side * scale,
                                }}
                            >
                                <div className="crop-handle crop-handle-nw" onPointerDown={onHandlePointerDown("nw")} />
                                <div className="crop-handle crop-handle-ne" onPointerDown={onHandlePointerDown("ne")} />
                                <div className="crop-handle crop-handle-sw" onPointerDown={onHandlePointerDown("sw")} />
                                <div className="crop-handle crop-handle-se" onPointerDown={onHandlePointerDown("se")} />
                            </div>
                        )}
                    </div>
                </div>
                <div className="editor-footer">
                    <button className="editor-button" onClick={() => finishCrop(null)}>{t("common.cancel")}</button>
                    <button className="editor-button primary" disabled={!frame} onClick={confirm}>{t("cover.cropUse")}</button>
                </div>
            </div>
        </div>
    );
};
