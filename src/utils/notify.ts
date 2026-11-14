/**
 * App-wide error notices shown by <Notices />. A tiny external store so any
 * hook can report a failure without threading callbacks through components.
 */

export interface Notice {
    id: number;
    message: string;
    kind: 'error' | 'info';
    /** A button on the notice (e.g. "Undo"); pressing it also dismisses the notice. */
    action?: { label: string; run: () => void };
}

/** How long a notice stays before it hides itself. */
const NOTICE_MS = 8000;
/** Errors need longer — users often need to read a path or reason. */
const ERROR_NOTICE_MS = 20000;
/** Keep toasts readable; the full error stays in the console. */
const ERROR_TOAST_CHARS = 360;

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

export const dismissNotice = (id: number) => {
    notices = notices.filter(notice => notice.id !== id);
    emit();
};

const show = (message: string, kind: Notice['kind'], durationMs: number, action?: Notice['action']) => {
    // Repeats of a message that is already on screen are dropped.
    if (notices.some(notice => notice.message === message)) return;
    const id = nextId++;
    notices = [...notices, { id, message, kind, action }];
    emit();
    setTimeout(() => dismissNotice(id), durationMs);
};

/** Flatten invoke / Error / plain objects into a short string for the toast. */
const formatError = (error: unknown): string => {
    if (error == null) return "";
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message || error.name;
    if (typeof error === "object") {
        const record = error as Record<string, unknown>;
        if (typeof record.message === "string" && record.message.trim()) return record.message;
        try {
            return JSON.stringify(error);
        } catch {
            /* fall through */
        }
    }
    return String(error);
};

const truncate = (text: string, max: number): string =>
    text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

/** Show an error to the user (and log the full detail). */
export const notifyError = (message: string, error?: unknown) => {
    if (error !== undefined) console.error(message, error);
    const detail = error !== undefined ? formatError(error) : "";
    const full = detail ? `${message}: ${detail}` : message;
    show(truncate(full, ERROR_TOAST_CHARS), 'error', ERROR_NOTICE_MS);
};

/** Confirm a completed action that has no other visible effect. */
export const notifyInfo = (message: string) => show(message, 'info', 2500);

/** Confirm an action that can be taken back with the notice's button. */
export const notifyUndoable = (message: string, label: string, run: () => void) =>
    show(message, 'info', NOTICE_MS, { label, run });

export const subscribeNotices = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getNotices = () => notices;
