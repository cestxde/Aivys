import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
    addShortcut, bindingOfKey, bindingOfMouse, formatBinding, isDefaultShortcuts, removeShortcut,
    resetShortcuts, SHORTCUT_ACTIONS, useShortcuts, type ShortcutAction,
} from "../../utils/shortcuts";
import { t, type MessageKey } from "../../i18n";

const LABELS: Record<ShortcutAction, MessageKey> = {
    back: "shortcuts.back",
    forward: "shortcuts.forward",
    playPause: "shortcuts.playPause",
    previous: "shortcuts.previous",
    next: "shortcuts.next",
    volumeUp: "shortcuts.volumeUp",
    volumeDown: "shortcuts.volumeDown",
};

/** The shortcut list: each action's keys and mouse buttons, editable. */
export const ShortcutSettings = () => {
    const shortcuts = useShortcuts();
    // The action waiting for a key or mouse button to be pressed.
    const [recording, setRecording] = useState<ShortcutAction | null>(null);

    // While recording, the next press is taken before anything else sees it.
    // Esc or a plain click elsewhere cancels.
    useEffect(() => {
        if (!recording) return;
        const take = (binding: string, e: Event) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            addShortcut(recording, binding);
            setRecording(null);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                e.preventDefault();
                e.stopImmediatePropagation();
                setRecording(null);
                return;
            }
            const binding = bindingOfKey(e);
            if (binding) take(binding, e);
            else e.stopImmediatePropagation();
        };
        const onMouseDown = (e: MouseEvent) => {
            const binding = bindingOfMouse(e);
            if (binding) take(binding, e);
            else setRecording(null);
        };
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("mousedown", onMouseDown, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("mousedown", onMouseDown, true);
        };
    }, [recording]);

    return (
        <>
            {SHORTCUT_ACTIONS.map(action => (
                <div key={action} className="settings-row">
                    <div className="settings-row-text">
                        <span className="settings-row-title">{t(LABELS[action])}</span>
                    </div>
                    <div className="settings-row-control shortcut-bindings">
                        {shortcuts[action].length === 0 && recording !== action && (
                            <span className="shortcut-none">{t("shortcuts.none")}</span>
                        )}
                        {shortcuts[action].map(binding => (
                            <span key={binding} className="shortcut-chip">
                                <kbd>{formatBinding(binding)}</kbd>
                                <button
                                    className="shortcut-remove"
                                    title={t("shortcuts.remove")}
                                    onClick={() => removeShortcut(action, binding)}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                        {recording === action ? (
                            <span className="shortcut-chip recording">{t("shortcuts.press")}</span>
                        ) : (
                            <button
                                className="shortcut-add"
                                title={t("shortcuts.add")}
                                // On release: the press itself would end the recording it starts.
                                onClick={() => setRecording(action)}
                            >
                                <Plus size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            <div className="settings-row">
                <div className="settings-row-text">
                    <span className="settings-row-description">{t("shortcuts.hint")}</span>
                </div>
                <div className="settings-row-control">
                    <button className="settings-button" disabled={isDefaultShortcuts(shortcuts)} onClick={resetShortcuts}>
                        {t("shortcuts.reset")}
                    </button>
                </div>
            </div>
        </>
    );
};
