import { useEffect, useState } from "react";
import { coverColor, type Rgb } from "../utils/coverColor";

/** Cover tint for the current track; clears when there is no cover. */
export const useCoverColor = (path: string | null | undefined, version?: number) => {
    const [color, setColor] = useState<Rgb | null>(null);

    useEffect(() => {
        let alive = true;
        setColor(null);
        if (!path) return;
        coverColor(path, version).then(next => {
            if (alive) setColor(next);
        });
        return () => { alive = false; };
    }, [path, version]);

    return color;
};
