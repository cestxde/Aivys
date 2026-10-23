import { useCallback, useEffect, useState } from "react";
import {
    applyTheme, followSystemTheme, loadThemePreference, saveThemePreference, type ThemePreference,
} from "../utils/theme";

/** The theme preference, applied to the page and window and remembered on this device. */
export const useTheme = () => {
    const [theme, setThemeState] = useState<ThemePreference>(loadThemePreference);

    useEffect(() => {
        applyTheme(theme);
        if (theme !== "system") return;
        return followSystemTheme(() => applyTheme("system"));
    }, [theme]);

    const setTheme = useCallback((next: ThemePreference) => {
        saveThemePreference(next);
        setThemeState(next);
    }, []);

    return { theme, setTheme };
};
