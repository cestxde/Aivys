import type { ReactNode } from "react";

/**
 * Release notes, as the release workflow writes them: "### " headings and
 * "- " items; anything else is a paragraph. `## ` is a version title.
 */
export const ReleaseNotes = ({ text }: { text: string }) => {
    const blocks: ReactNode[] = [];
    let items: string[] = [];
    const flush = () => {
        if (items.length === 0) return;
        blocks.push(<ul key={blocks.length}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>);
        items = [];
    };
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith("- ") || line.startsWith("* ")) {
            items.push(line.slice(2));
            continue;
        }
        flush();
        if (/^##\s+/.test(line)) blocks.push(<h2 key={blocks.length}>{line.replace(/^##\s+/, "")}</h2>);
        else if (line.startsWith("#")) blocks.push(<h3 key={blocks.length}>{line.replace(/^#+\s*/, "")}</h3>);
        else if (line) blocks.push(<p key={blocks.length}>{line}</p>);
    }
    flush();
    return <div className="update-notes">{blocks}</div>;
};
