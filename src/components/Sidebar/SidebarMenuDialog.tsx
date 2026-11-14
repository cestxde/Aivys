import {
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from "react";
import { Eye, EyeOff, GripVertical, Minus, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { t } from "../../i18n";
import { useBackLayer } from "../../hooks/useBackLayer";
import type {
	SidebarItemId,
	SidebarNavEntry,
	SidebarVisibility,
} from "../../utils/sidebarNav";
import {
	cloneSidebarNav,
	DEFAULT_SIDEBAR_NAV,
	insertSidebarSeparator,
	removeSidebarSeparator,
	reorderSidebarNav,
	sidebarEntryKey,
	sidebarItemLabel,
	sidebarSupportsAuto,
} from "../../utils/sidebarNav";
import "./SidebarMenuDialog.css";

interface SidebarMenuDialogProps {
	nav: SidebarNavEntry[];
	icons: Record<SidebarItemId, ReactNode>;
	onChange: (nav: SidebarNavEntry[]) => void;
	onClose: () => void;
}

type DropTarget = { key: string; after: boolean };

const VIS_ORDER_FULL: SidebarVisibility[] = ["always", "auto", "hidden"];
const VIS_ORDER_BASIC: SidebarVisibility[] = ["always", "hidden"];

const visibilityLabel = (visibility: SidebarVisibility): string => {
	switch (visibility) {
		case "always": return t("sidebar.visAlways");
		case "auto": return t("sidebar.visAuto");
		case "hidden": return t("sidebar.visHidden");
	}
};

const visibilityShort = (visibility: SidebarVisibility): string => {
	switch (visibility) {
		case "always": return t("sidebar.visAlwaysShort");
		case "auto": return t("sidebar.visAutoShort");
		case "hidden": return t("sidebar.visHiddenShort");
	}
};

const VisibilityIcon = ({ visibility }: { visibility: SidebarVisibility }) => {
	switch (visibility) {
		case "always": return <Eye size={14} />;
		case "auto": return <Sparkles size={14} />;
		case "hidden": return <EyeOff size={14} />;
	}
};

/** Reorder tabs and separators, set visibility, or restore defaults. */
export const SidebarMenuDialog = ({ nav, icons, onChange, onClose }: SidebarMenuDialogProps) => {
	useBackLayer(true, onClose);
	const [dragging, setDragging] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const dropRef = useRef<DropTarget | null>(null);
	const listRef = useRef<HTMLUListElement>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const startDrag = (e: ReactPointerEvent<HTMLElement>, key: string) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		setDragging(key);
	};

	const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
		if (!dragging) return;
		const scroller = listRef.current;
		if (scroller) {
			const box = scroller.getBoundingClientRect();
			if (e.clientY < box.top + 28) scroller.scrollBy(0, -10);
			else if (e.clientY > box.bottom - 28) scroller.scrollBy(0, 10);
		}
		const row = document
			.elementFromPoint(e.clientX, e.clientY)
			?.closest<HTMLElement>("[data-nav-key]");
		const key = row?.dataset.navKey;
		if (!row || !key) return;
		const box = row.getBoundingClientRect();
		const next = { key, after: e.clientY > box.top + box.height / 2 };
		if (dropRef.current?.key !== next.key || dropRef.current.after !== next.after) {
			dropRef.current = next;
			setDropTarget(next);
		}
	};

	const endDrag = (commit: boolean) => {
		const target = dropRef.current;
		const moved = dragging;
		setDragging(null);
		setDropTarget(null);
		dropRef.current = null;
		if (commit && moved && target && moved !== target.key) {
			onChange(reorderSidebarNav(nav, moved, target.key, target.after));
		}
	};

	const setVisibility = (id: SidebarItemId, visibility: SidebarVisibility) => {
		const next = sidebarSupportsAuto(id) || visibility !== "auto" ? visibility : "always";
		onChange(nav.map(entry => (
			entry.kind === "tab" && entry.id === id
				? { ...entry, visibility: next }
				: entry
		)));
	};

	const cycleVisibility = (id: SidebarItemId, current: SidebarVisibility) => {
		const order = sidebarSupportsAuto(id) ? VIS_ORDER_FULL : VIS_ORDER_BASIC;
		const next = order[(order.indexOf(current) + 1) % order.length];
		setVisibility(id, next);
	};

	const reset = () => onChange(cloneSidebarNav(DEFAULT_SIDEBAR_NAV));

	return (
		<div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
			<div className="sidebar-menu-dialog" role="dialog" aria-label={t("sidebar.customizeTitle")}>
				<div className="sidebar-menu-dialog-header">
					<h2>{t("sidebar.customizeTitle")}</h2>
					<button type="button" className="add-to-close" title={t("common.close")} onClick={onClose}>
						<X size={18} />
					</button>
				</div>
				<p className="sidebar-menu-dialog-hint">{t("sidebar.customizeHint")}</p>
				<p className="sidebar-vis-legend">{t("sidebar.visLegend")}</p>
				<ul
					ref={listRef}
					className={`sidebar-menu-list${dragging ? " is-reordering" : ""}`}
				>
					{nav.map(entry => {
						const key = sidebarEntryKey(entry);
						const drop = dropTarget?.key === key && dragging !== key
							? (dropTarget.after ? " drop-after" : " drop-before")
							: "";
						if (entry.kind === "separator") {
							return (
								<li
									key={key}
									data-nav-key={key}
									className={`sidebar-menu-row is-separator${dragging === key ? " dragging" : ""}${drop}`}
								>
									<span
										className="sidebar-menu-drag"
										title={t("list.dragToReorder")}
										onClick={(e) => e.stopPropagation()}
										onPointerDown={(e) => startDrag(e, key)}
										onPointerMove={moveDrag}
										onPointerUp={() => endDrag(true)}
										onPointerCancel={() => endDrag(false)}
									>
										<GripVertical size={14} />
									</span>
									<span className="sidebar-menu-sep-line" aria-hidden />
									<span className="sidebar-menu-row-label">{t("sidebar.separator")}</span>
									<button
										type="button"
										className="sidebar-menu-action"
										onClick={() => onChange(removeSidebarSeparator(nav, entry.id))}
										aria-label={t("sidebar.removeSeparator")}
										title={t("sidebar.removeSeparator")}
									>
										<Minus size={14} />
									</button>
								</li>
							);
						}

						const modes = sidebarSupportsAuto(entry.id) ? VIS_ORDER_FULL : VIS_ORDER_BASIC;
						return (
							<li
								key={key}
								data-nav-key={key}
								className={`sidebar-menu-row${entry.visibility === "hidden" ? " is-disabled" : ""}${dragging === key ? " dragging" : ""}${drop}`}
							>
								<span
									className="sidebar-menu-drag"
									title={t("list.dragToReorder")}
									onClick={(e) => e.stopPropagation()}
									onPointerDown={(e) => startDrag(e, key)}
									onPointerMove={moveDrag}
									onPointerUp={() => endDrag(true)}
									onPointerCancel={() => endDrag(false)}
								>
									<GripVertical size={14} />
								</span>
								<span className="sidebar-menu-row-icon">{icons[entry.id]}</span>
								<span className="sidebar-menu-row-label">{t(sidebarItemLabel(entry.id))}</span>
								<div className="sidebar-vis" role="group" aria-label={t("sidebar.visibility")}>
									{modes.map(mode => (
										<button
											key={mode}
											type="button"
											className={`sidebar-vis-btn${entry.visibility === mode ? " active" : ""}`}
											title={visibilityLabel(mode)}
											aria-label={visibilityLabel(mode)}
											aria-pressed={entry.visibility === mode}
											onClick={() => setVisibility(entry.id, mode)}
											onContextMenu={(e) => {
												e.preventDefault();
												cycleVisibility(entry.id, entry.visibility);
											}}
										>
											<VisibilityIcon visibility={mode} />
											<span className="sidebar-vis-btn-label">{visibilityShort(mode)}</span>
										</button>
									))}
								</div>
							</li>
						);
					})}
				</ul>
				<div className="sidebar-menu-footer">
					<div className="sidebar-menu-footer-left">
						<button type="button" className="editor-button" onClick={reset}>
							<RotateCcw size={14} />
							{t("sidebar.resetTabs")}
						</button>
						<button
							type="button"
							className="editor-button"
							onClick={() => onChange(insertSidebarSeparator(nav, null))}
						>
							<Plus size={14} />
							{t("sidebar.addSeparator")}
						</button>
					</div>
					<button type="button" className="editor-button primary" onClick={onClose}>
						{t("common.close")}
					</button>
				</div>
			</div>
		</div>
	);
};
