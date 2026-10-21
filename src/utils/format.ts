/** Format a number of seconds as "m:ss" (or "0:00" for invalid input). */
export const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};
