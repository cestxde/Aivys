import { useEffect, useRef } from "react";

/**
 * Layers Back closes, the topmost first: dialogs, menus, the cover viewer,
 * and on phones the drawer, the full-screen player, the queue over it. Each
 * open one has a history entry: the system's Back (Android) goes back in the
 * WebView's history, and the desktop's Back (a mouse button, Alt+Left) does
 * the same through `closeTopLayer`. A layer closed otherwise takes its entry
 * back off.
 */
const layers: (() => void)[] = [];
// History steps taken by closing layers ourselves: not Back.
let ownSteps = 0;

window.addEventListener("popstate", () => {
    if (ownSteps > 0) {
        ownSteps--;
        return;
    }
    layers.pop()?.();
});

/** Close the topmost layer, if there is one; false when none is open. */
export const closeTopLayer = (): boolean => {
    if (layers.length === 0) return false;
    history.back();
    return true;
};

/** While `open`, Back calls `onClose` (if this is the topmost layer). */
export const useBackLayer = (open: boolean, onClose: () => void) => {
    const latest = useRef(onClose);
    useEffect(() => {
        latest.current = onClose;
    });

    useEffect(() => {
        if (!open) return;
        let closedByBack = false;
        const close = () => {
            closedByBack = true;
            latest.current();
        };
        history.pushState({ layer: layers.length + 1 }, "");
        layers.push(close);
        return () => {
            if (closedByBack) return;
            const index = layers.lastIndexOf(close);
            if (index >= 0) layers.splice(index, 1);
            ownSteps++;
            history.back();
        };
    }, [open]);
};
