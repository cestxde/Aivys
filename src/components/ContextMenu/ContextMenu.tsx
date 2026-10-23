import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import "./ContextMenu.css";

export type MenuEntry =
    | { kind: "item"; label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean }
    | { kind: "label"; label: string }
    | { kind: "separator" };

interface ContextMenuProps {
    x: number;
    y: number;
    entries: MenuEntry[];
    onClose: () => void;
}

/**
 * A menu at the given viewport position, kept inside the window. Closes on
 * selection, a click outside, Escape, scroll or resize.
 */
export const ContextMenu = ({ x, y, entries, onClose }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);

    // Flip/shift so the menu never overflows the window (before paint).
    useLayoutEffect(() => {
        const menu = ref.current;
        if (!menu) return;
        const { width, height } = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - width - 4))}px`;
        menu.style.top = `${y + height > window.innerHeight - 4 ? Math.max(4, y - height) : y}px`;
    }, [x, y]);

    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onClose);
        window.addEventListener("scroll", onClose, true);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onClose);
            window.removeEventListener("scroll", onClose, true);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="context-menu"
            role="menu"
            style={{ left: x, top: y }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {entries.map((entry, index) => {
                if (entry.kind === "separator") return <div key={index} className="context-menu-separator" />;
                if (entry.kind === "label") return <div key={index} className="context-menu-label">{entry.label}</div>;
                return (
                    <button
                        key={index}
                        role="menuitem"
                        className={`context-menu-item ${entry.danger ? "danger" : ""}`}
                        disabled={entry.disabled}
                        onClick={() => {
                            onClose();
                            entry.onSelect();
                        }}
                    >
                        <span className="context-menu-icon">{entry.icon}</span>
                        <span className="context-menu-text">{entry.label}</span>
                    </button>
                );
            })}
        </div>
    );
};
