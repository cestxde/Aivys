import { useEffect, useRef } from "react";

/**
 * Layers Back closes, the topmost first: dialogs, menus, the cover viewer,
 * and on phones the drawer, the full-screen player, the queue over it, a view
 * other than the library. The desktop's Back (a mouse button, Alt+Left) and
 * Android's (MainActivity.kt, through `window.aivysBack`) both call
 * `closeTopLayer`; with no layer open, the desktop goes to the previous view
 * and Android puts the app in the background.
 */
const layers: (() => void)[] = [];

/** Close the topmost layer, if there is one; false when none is open. */
export const closeTopLayer = (): boolean => {
    const close = layers.pop();
    if (!close) return false;
    close();
    return true;
};

// Android's Back asks the page first (MainActivity.kt).
(window as unknown as { aivysBack?: () => boolean }).aivysBack = closeTopLayer;

/** While `open`, Back calls `onClose` (when this is the topmost layer). */
export const useBackLayer = (open: boolean, onClose: () => void) => {
    const latest = useRef(onClose);
    useEffect(() => {
        latest.current = onClose;
    });

    useEffect(() => {
        if (!open) return;
        const close = () => latest.current();
        layers.push(close);
        return () => {
            // Closed otherwise (or already taken off by Back): off the stack.
            const index = layers.lastIndexOf(close);
            if (index >= 0) layers.splice(index, 1);
        };
    }, [open]);
};
