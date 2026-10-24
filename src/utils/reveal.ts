import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { t, type MessageKey } from "../i18n";
import { notifyError } from "./notify";

/** What the file manager is called here, for "Show in …". */
export const revealLabel = (): string => {
    const agent = navigator.userAgent;
    const key: MessageKey = agent.includes("Windows") ? "menu.revealWindows"
        : agent.includes("Mac OS") ? "menu.revealMac"
        : "menu.revealOther";
    return t(key);
};

/** Open the file manager at `path` with the file selected. */
export const revealFile = (path: string) => {
    revealItemInDir(path).catch(e => notifyError(t("error.reveal"), e));
};
