import { useSyncExternalStore } from "react";

/**
 * Choosing the square of a picture for a cover. `CoverCropDialog` (always
 * mounted) asks which square of it to keep, so the cover can be zoomed in even
 * when the picture is already square. It only reports the square; the actual
 * (slow) crop happens in `cropImage`, after the dialog has closed.
 */

/** The square to keep, in the picture's own pixels. */
export interface CropFrame {
    x: number;
    y: number;
    side: number;
}

interface CropRequest {
    /** The picture to show (revoked when the choice is made). */
    url: string;
    resolve: (frame: CropFrame | null) => void;
}

let request: CropRequest | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** The choice waiting for the user, if any. */
export const useCropRequest = () => useSyncExternalStore(subscribe, () => request);

/**
 * The square of `image` the user chose, in the picture's own pixels, or null
 * when they cancel. Crop it with `cropImage`.
 */
export const cropToSquare = (image: Blob): Promise<CropFrame | null> =>
    new Promise(resolve => {
        request?.resolve(null);
        request = { url: URL.createObjectURL(image), resolve };
        emit();
    });

/** The dialog's answer: the chosen square, or null for none. */
export const finishCrop = (frame: CropFrame | null) => {
    if (!request) return;
    const { url, resolve } = request;
    request = null;
    URL.revokeObjectURL(url);
    emit();
    resolve(frame);
};
