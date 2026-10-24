import { Fragment } from "react";
import "./ArtistLinks.css";

interface ArtistLinksProps {
    /** The artist tag as written ("Баста / GUF"). */
    line: string;
    /** The separate artists split from it (["Баста", "GUF"]). */
    artists: string[];
    /** Whether an artist has a page to open (it may be missing from the library). */
    canOpen: (name: string) => boolean;
    onOpen: (name: string) => void;
}

type Part = { text: string; artist: string | null };

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * `line` with every artist that occurs in it as a link to the artist's page,
 * separators left as text. Artists not found in the line (or a line that is
 * empty) are listed after it.
 */
const partsOf = (line: string, artists: string[]): Part[] => {
    const lower = line.toLowerCase();
    // Every whole-word occurrence, earliest first; longer names win at the same place.
    const found = artists
        .flatMap(artist => {
            const name = artist.toLowerCase();
            const matches = [];
            for (let at = lower.indexOf(name); at >= 0 && name; at = lower.indexOf(name, at + 1)) {
                if (!isWordChar(lower[at - 1]) && !isWordChar(lower[at + name.length])) {
                    matches.push({ at, end: at + name.length, artist });
                }
            }
            return matches;
        })
        .sort((a, b) => a.at - b.at || b.end - a.end);

    const parts: Part[] = [];
    let index = 0;
    const listed = new Set<string>();
    for (const match of found) {
        if (match.at < index || listed.has(match.artist)) continue;
        if (match.at > index) parts.push({ text: line.slice(index, match.at), artist: null });
        parts.push({ text: line.slice(match.at, match.end), artist: match.artist });
        listed.add(match.artist);
        index = match.end;
    }
    if (index < line.length) parts.push({ text: line.slice(index), artist: null });

    for (const artist of artists.filter(name => !listed.has(name))) {
        if (parts.length > 0) parts.push({ text: ", ", artist: null });
        parts.push({ text: artist, artist });
    }
    return parts;
};

/** The artists of a track as written, each name a link to its artist's page. */
export const ArtistLinks = ({ line, artists, canOpen, onOpen }: ArtistLinksProps) => (
    <>
        {partsOf(line, artists).map((part, index) =>
            part.artist && canOpen(part.artist) ? (
                <button
                    key={index}
                    className="artist-link"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpen(part.artist!);
                    }}
                >
                    {part.text}
                </button>
            ) : (
                <Fragment key={index}>{part.text}</Fragment>
            ),
        )}
    </>
);
