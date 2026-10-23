import { getLanguage } from "../i18n";

/** Format a number of seconds as "m:ss" (or "0:00" for invalid input). */
export const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/** Format a unix timestamp (seconds) as a short local date and time. */
export const formatDateTime = (unixSeconds: number): string =>
    new Date(unixSeconds * 1000).toLocaleString(getLanguage(), {
        dateStyle: "medium",
        timeStyle: "short",
    });

/** Format a unix timestamp (seconds) as a short local date. */
export const formatDate = (unixSeconds: number): string =>
    new Date(unixSeconds * 1000).toLocaleDateString(getLanguage(), { dateStyle: "medium" });

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Format a byte count the way file managers do, e.g. "8.4 MB" (1 KB = 1024 B). */
export const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes < 0) return "0 B";
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1);
    const value = bytes / 1024 ** unit;
    return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${SIZE_UNITS[unit]}`;
};
