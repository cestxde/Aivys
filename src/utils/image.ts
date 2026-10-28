/** The file's bytes as base64 (what the backend takes for an image). */
export const readBase64 = (file: File) => new Promise<string>((resolve, reject) => {
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
