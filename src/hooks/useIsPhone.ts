import { useSyncExternalStore } from "react";

/** Phone-sized screens, as the CSS's `@media (max-width: 720px)`. */
const query = window.matchMedia("(max-width: 720px)");

const subscribe = (onChange: () => void) => {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
};

/** Whether the screen is phone-sized (the layout with the drawer and the mini player). */
export const useIsPhone = () => useSyncExternalStore(subscribe, () => query.matches);
