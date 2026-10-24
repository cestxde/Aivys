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

/** Show an error to the user (and log it). */
export const notifyError = (message: string, error?: unknown) => {
    if (error !== undefined) console.error(message, error);
    show(error !== undefined ? `${message}: ${String(error)}` : message, 'error', NOTICE_MS);
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
