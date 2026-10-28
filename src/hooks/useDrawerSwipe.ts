import { useEffect, useRef, type RefObject } from "react";

/** A drag this far (a fraction of the drawer's width), or a quicker flick, opens or closes it. */
const OPEN_FRACTION = 0.3;
const FLICK_SPEED = 0.4;

/** Where a sideways swipe is someone else's: the player, dialogs, menus, reordering. */
const OWN_GESTURES = ".now-playing, .phone-sheet, .dialog-backdrop, .context-menu, .cover-viewer-backdrop, .drag-handle, input, textarea";

/** Whether `element` or a parent of it scrolls sideways (a swipe there scrolls it). */
const scrollsSideways = (element: Element | null): boolean => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 1) {
            const overflow = getComputedStyle(node).overflowX;
            if (overflow === "auto" || overflow === "scroll") return true;
        }
    }
    return false;
};

/**
 * Phones: the drawer (`drawer`, over `backdrop`) follows a finger swiping
 * right anywhere on the page to open it, and left to close it. While
 * dragging it is moved directly, without renders; letting go opens or closes
 * it through `onOpen` / `onClose`. Touch events, not pointer ones: they go
 * on while the page would scroll, and a sideways drag stops that scroll.
 */
export const useDrawerSwipe = (
    enabled: boolean,
    open: boolean,
    drawer: RefObject<HTMLElement | null>,
    backdrop: RefObject<HTMLElement | null>,
    onOpen: () => void,
    onClose: () => void,
) => {
    const latest = useRef({ open, onOpen, onClose });
    useEffect(() => {
        latest.current = { open, onOpen, onClose };
    });

    useEffect(() => {
        if (!enabled) return;
        let start: { x: number; y: number; horizontal: boolean | null } | null = null;
        let last = { x: 0, time: 0, speed: 0 };
        let progress = 0;

        const place = (shown: number | null) => {
            const nav = drawer.current;
            const shade = backdrop.current;
            if (!nav || !shade) return;
            if (shown === null) {
                nav.style.transform = "";
                nav.style.transition = "";
                shade.style.opacity = "";
                shade.style.transition = "";
                return;
            }
            nav.style.transition = "none";
            shade.style.transition = "none";
            nav.style.transform = `translateX(${(shown - 1) * 100}%)`;
            shade.style.opacity = String(shown);
        };

        const onStart = (e: TouchEvent) => {
            start = null;
            if (e.touches.length !== 1) return;
            const target = e.target as Element | null;
            if (target?.closest(OWN_GESTURES) || (!latest.current.open && scrollsSideways(target))) return;
            const touch = e.touches[0];
            start = { x: touch.clientX, y: touch.clientY, horizontal: null };
            last = { x: touch.clientX, time: e.timeStamp, speed: 0 };
        };

        const onMove = (e: TouchEvent) => {
            if (!start) return;
            const touch = e.touches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            const { open } = latest.current;
            if (start.horizontal === null) {
                if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
                // Right to open, left to close; anything else is the page's.
                start.horizontal = Math.abs(dx) > Math.abs(dy) * 1.5 && (open ? dx < 0 : dx > 0);
                if (!start.horizontal) {
                    start = null;
                    return;
                }
            }
            e.preventDefault();
            const width = drawer.current?.offsetWidth || 1;
            progress = Math.min(1, Math.max(0, (open ? 1 : 0) + dx / width));
            const elapsed = e.timeStamp - last.time;
            if (elapsed > 0) last = { x: touch.clientX, time: e.timeStamp, speed: (touch.clientX - last.x) / elapsed };
            place(progress);
        };

        const onEnd = () => {
            if (!start?.horizontal) {
                start = null;
                return;
            }
            start = null;
            const { open, onOpen, onClose } = latest.current;
            const flick = Math.abs(last.speed) >= FLICK_SPEED;
            const shouldOpen = flick ? last.speed > 0 : open ? progress > 1 - OPEN_FRACTION : progress > OPEN_FRACTION;
            if (shouldOpen !== open) (shouldOpen ? onOpen : onClose)();
            // Then (opened or closed by now) back to the stylesheet's place,
            // animated from where the finger left it.
            requestAnimationFrame(() => place(null));
        };

        window.addEventListener("touchstart", onStart, { passive: true });
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("touchend", onEnd);
        window.addEventListener("touchcancel", onEnd);
        return () => {
            window.removeEventListener("touchstart", onStart);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
            window.removeEventListener("touchcancel", onEnd);
            place(null);
        };
    }, [enabled, drawer, backdrop]);
};
