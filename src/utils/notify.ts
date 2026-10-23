/**
 * App-wide error notices shown by <Notices />. A tiny external store so any
 * hook can report a failure without threading callbacks through components.
 */

export interface Notice {
    id: number;
    message: string;
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

/**
 * Show an error to the user (and log it). Repeats of a message that is
 * already on screen are dropped.
 */
export const notifyError = (message: string, error?: unknown) => {
    if (error !== undefined) console.error(message, error);
    const text = error !== undefined ? `${message}: ${String(error)}` : message;
    if (notices.some(notice => notice.message === text)) return;

    const id = nextId++;
    notices = [...notices, { id, message: text }];
    emit();
    setTimeout(() => dismissNotice(id), NOTICE_MS);
};

export const subscribeNotices = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getNotices = () => notices;
