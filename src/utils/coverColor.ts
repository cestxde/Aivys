import { convertFileSrc } from "@tauri-apps/api/core";

export type Rgb = { r: number; g: number; b: number };

const cache = new Map<string, Rgb | null>();

/** Average of the cover's pixels, skewed toward saturated colors. */
const sample = (image: HTMLImageElement | ImageBitmap): Rgb | null => {
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    try {
        ctx.drawImage(image, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, weight = 0;
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3] / 255;
            if (a < 0.5) continue;
            const pr = data[i], pg = data[i + 1], pb = data[i + 2];
            const max = Math.max(pr, pg, pb);
            const min = Math.min(pr, pg, pb);
            const sat = max === 0 ? 0 : (max - min) / max;
            const lum = (pr + pg + pb) / (3 * 255);
            // Skip near-black and grayish near-white; keep bright saturated colors.
            if (lum < 0.06) continue;
            if (lum > 0.94 && sat < 0.12) continue;
            const w = (0.35 + sat) * a;
            r += pr * w;
            g += pg * w;
            b += pb * w;
            weight += w;
        }
        if (weight < 0.001) return null;
        return { r: Math.round(r / weight), g: Math.round(g / weight), b: Math.round(b / weight) };
    } catch {
        return null;
    }
};

const keyOf = (path: string, version?: number) => `${path}\0${version ?? 0}`;

/**
 * Dominant-ish RGB from a cover file. Cached; `null` when missing or unreadable.
 * Loads via fetch+blob so the canvas is not tainted by the asset protocol.
 */
export const coverColor = (path: string | null | undefined, version?: number): Promise<Rgb | null> => {
    if (!path) return Promise.resolve(null);
    const key = keyOf(path, version);
    if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);

    return (async () => {
        try {
            const url = convertFileSrc(path) + (version ? `?v=${version}` : "");
            const response = await fetch(url);
            if (!response.ok) {
                cache.set(key, null);
                return null;
            }
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            const color = sample(bitmap);
            bitmap.close();
            cache.set(key, color);
            return color;
        } catch {
            cache.set(key, null);
            return null;
        }
    })();
};

export const rgbCss = (color: Rgb, alpha = 1) =>
    alpha >= 1 ? `rgb(${color.r}, ${color.g}, ${color.b})` : `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
