import { Pin, PinOff } from "lucide-react";
import type { MenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { PinKind } from "../usePins";
import { t } from "../../i18n";
import type { AppMenuDeps } from "./appMenuDeps";

export function createPinEntry(deps: AppMenuDeps) {
	return (kind: PinKind, key: string): MenuEntry => {
		const pinned = deps.pins.isPinned(kind, key);
		return {
			kind: "item",
			label: pinned ? t("pin.unpin") : t("pin.pin"),
			icon: pinned ? <PinOff size={16} /> : <Pin size={16} />,
			onSelect: () => deps.pins.setPinned(kind, key, !pinned),
		};
	};
}
