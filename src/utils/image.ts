import { convertFileSrc } from "@tauri-apps/api/core";
import { cropToSquare, type CropFrame } from "./coverCrop";

/** The longest side of a saved cover, in pixels. */
const MAX_SIDE = 1200;

/** The file's bytes as base64 (what the backend takes for an image). */
export const readBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    // "data:image/png;base64,...": the part after the comma.
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

/** A cover file on disk (playlist / album / track cache) as base64 for `edit_tracks`. */
export const readCoverBase64 = async (path: string): Promise<string> => {
    const response = await fetch(convertFileSrc(path));
    if (!response.ok) throw new Error(`could not read cover (${response.status})`);
    return readBase64(await response.blob());
};

/**
 * The square `frame` of `image` as a JPEG (or a PNG for a PNG), with its bytes
 * as base64. This is the slow part; it runs after the crop dialog has closed.
 */
export const cropImage = async (image: Blob, frame: CropFrame): Promise<{ blob: Blob; data: string }> => {
    const bitmap = await createImageBitmap(image);
    const side = Math.min(Math.round(frame.side), MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    canvas.getContext("2d")?.drawImage(bitmap, frame.x, frame.y, frame.side, frame.side, 0, 0, side, side);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(encoded => (encoded ? resolve(encoded) : reject(new Error("cannot encode the image"))),
            image.type === "image/png" ? "image/png" : "image/jpeg", 0.92));
    return { blob, data: await readBase64(blob) };
};

/**
 * Ask for an image file (jpg, png, webp) the way the platform does (the
 * system's picker on Android too). Never settles when the picker is closed
 * without a file.
 */
export const pickFile = () => new Promise<File>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = () => {
        const file = input.files?.[0];
        if (file) resolve(file);
    };
    input.click();
});

/**
 * An image as a cover: the square the user chose, as base64 and as a blob to
 * show. Never settles when the choice is cancelled.
 */
const coverImage = (image: Blob) => new Promise<{ data: string; blob: Blob }>((resolve, reject) => {
    cropToSquare(image).then(frame => {
        if (frame) cropImage(image, frame).then(resolve, reject);
    }, reject);
});

/** The image in the clipboard (as `coverImage`), or null when it holds none. */
export const clipboardImage = async (): Promise<{ data: string; blob: Blob } | null> => {
    for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(type => type.startsWith("image/"));
        if (type) return coverImage(await item.getType(type));
    }
    return null;
};

/** The image pasted (Ctrl+V), as `coverImage`, or null when the paste holds none. */
export const pastedImage = (e: ClipboardEvent): Promise<{ data: string; blob: Blob }> | null => {
    const file = [...(e.clipboardData?.files ?? [])].find(file => file.type.startsWith("image/"));
    return file ? coverImage(file) : null;
};
