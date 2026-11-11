import { useEffect, useState } from "react";
import { coverColor, type Rgb } from "../utils/coverColor";

/**
 * Cover tint for the current track. Keeps the previous color while the next
 * cover loads so CSS can crossfade `--cover-tint` instead of flashing clear.
 */
export const useCoverColor = (path: string | null | undefined, version?: number) => {
    const [color, setColor] = useState<Rgb | null>(null);

    useEffect(() => {
        let alive = true;
        if (!path) {
            setColor(null);
            return;
        }
        coverColor(path, version).then(next => {
            if (alive) setColor(next);
        });
        return () => { alive = false; };
    }, [path, version]);

    return color;
};
