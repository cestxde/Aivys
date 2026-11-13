import type { Track } from "../../types";
import { displayArtists, displayTitle } from "../../utils/track";
import { CoverArt } from "../CoverArt";

export const NowPlayingNeighbour = ({ track, side }: { track: Track | null; side: "previous" | "next" }) => (
	<div className={`now-playing-panel neighbour ${side}`} aria-hidden>
		{track && (
			<>
				<div className="now-playing-cover-wrap">
					<CoverArt path={track.coverPath} size={320} className="now-playing-cover" />
				</div>
				<div className="now-playing-heading">
					<h2 className="now-playing-title">{displayTitle(track)}</h2>
					<span className="now-playing-artist">{displayArtists(track)}</span>
				</div>
			</>
		)}
	</div>
);
