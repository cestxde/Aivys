/** The file's bytes as base64 (what the backend takes for an image). */
export const readBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    // "data:image/png;base64,...": the part after the comma.
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

/**
 * Ask for an image file (jpg, png, webp) the way the platform does (the
 * system's picker on Android too); resolves with its bytes as base64. Never
 * settles when the picker is closed without one.
 */
export const pickImage = () => new Promise<string>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = () => {
        const file = input.files?.[0];
        if (file) readBase64(file).then(resolve, reject);
    };
    input.click();
});

/** Image types the covers are kept in as they are; others become PNG. */
const KEPT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** An image (from the clipboard: often a BMP on Windows) as PNG. */
const toPng = async (image: Blob): Promise<Blob> => {
    const bitmap = await createImageBitmap(image);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise((resolve, reject) =>
        canvas.toBlob(png => (png ? resolve(png) : reject(new Error("cannot convert the image"))), "image/png"));
};

/** An image's bytes as base64, as a JPEG, PNG or WebP. */
const imageBase64 = async (image: Blob): Promise<{ data: string; blob: Blob }> => {
    const blob = KEPT_TYPES.includes(image.type) ? image : await toPng(image);
    return { data: await readBase64(blob), blob };
};

/** The image in the clipboard (base64, and as a blob to show), or null when it holds none. */
export const clipboardImage = async (): Promise<{ data: string; blob: Blob } | null> => {
    for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(type => type.startsWith("image/"));
        if (type) return imageBase64(await item.getType(type));
    }
    return null;
};

/** The image pasted (Ctrl+V), or null when the paste holds none. */
export const pastedImage = (e: ClipboardEvent): Promise<{ data: string; blob: Blob }> | null => {
    const file = [...(e.clipboardData?.files ?? [])].find(file => file.type.startsWith("image/"));
    return file ? imageBase64(file) : null;
};
