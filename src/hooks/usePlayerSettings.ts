import { useState, useEffect } from 'react';
import { type PlayerSettings, DEFAULT_SETTINGS } from '../types';

const SETTINGS_KEY = 'aivys-player-settings';

export const usePlayerSettings = () => {
    const [settings, setSettings] = useState<PlayerSettings>(() => {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (!saved) return DEFAULT_SETTINGS;
        try {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        } catch {
            return DEFAULT_SETTINGS;
        }
    });

    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newFields: Partial<PlayerSettings>) => {
        setSettings(prev => ({ ...prev, ...newFields }));
    };

    return { settings, updateSettings };
};