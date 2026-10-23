/** Format a number of seconds as "m:ss" (or "0:00" for invalid input). */
export const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/** Format a unix timestamp (seconds) as a short local date and time. */
export const formatDateTime = (unixSeconds: number): string =>
    new Date(unixSeconds * 1000).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
