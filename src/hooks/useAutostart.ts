import { useCallback, useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { androidStorage } from "../utils/androidStorage";

/** Desktop only: launch with the OS login session. */
const available = androidStorage === null;

/**
 * Whether the app is set to start with the system. `null` while loading or
 * when autostart is not available (Android).
 */
export const useAutostart = () => {
    const [enabled, setEnabled] = useState<boolean | null>(available ? null : false);

    useEffect(() => {
        if (!available) return;
        isEnabled().then(setEnabled).catch(() => setEnabled(false));
    }, []);

    const setAutostart = useCallback(async (value: boolean) => {
        if (!available) return;
        try {
            if (value) await enable();
            else await disable();
            setEnabled(value);
        } catch (e) {
            console.error(e);
            const current = await isEnabled().catch(() => false);
            setEnabled(current);
        }
    }, []);

    return { available, enabled, setAutostart };
};
