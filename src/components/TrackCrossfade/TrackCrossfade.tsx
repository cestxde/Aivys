import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTrackSwapMs } from "../../utils/trackSwapUi";
import "./TrackCrossfade.css";

interface TrackCrossfadeProps {
	/** Changes when the displayed track changes (usually `path`). */
	contentKey: string;
	className?: string;
	/** When false, swap instantly (e.g. after a Now Playing swipe). */
	animate?: boolean;
	/** Override store duration; default follows manual / gapless / crossfade. */
	durationMs?: number;
	children: ReactNode;
}

/**
 * Opacity crossfade when `contentKey` changes. Duration comes from
 * `setTrackSwapMs` (fast skip, normal gapless, mid crossfade).
 */
export const TrackCrossfade = ({
	contentKey,
	className,
	animate = true,
	durationMs: durationProp,
	children,
}: TrackCrossfadeProps) => {
	const storeMs = useTrackSwapMs();
	const durationMs = durationProp ?? storeMs;
	const keyRef = useRef(contentKey);
	const frontRef = useRef({ key: contentKey, node: children });
	const [front, setFront] = useState({ key: contentKey, node: children });
	const [back, setBack] = useState<{ key: string; node: ReactNode } | null>(null);
	const [phase, setPhase] = useState<"idle" | "start" | "run">("idle");

	frontRef.current = front;

	useLayoutEffect(() => {
		if (keyRef.current !== contentKey) return;
		setFront(prev => (prev.key === contentKey ? { ...prev, node: children } : prev));
	}, [children, contentKey]);

	useLayoutEffect(() => {
		if (contentKey === keyRef.current) return;

		const previous = frontRef.current;
		keyRef.current = contentKey;

		if (!animate) {
			setBack(null);
			setFront({ key: contentKey, node: children });
			setPhase("idle");
			return;
		}

		setBack({ key: previous.key, node: previous.node });
		setFront({ key: contentKey, node: children });
		setPhase("start");
		const raf = requestAnimationFrame(() => {
			requestAnimationFrame(() => setPhase("run"));
		});
		const timer = window.setTimeout(() => {
			setBack(null);
			setPhase("idle");
		}, durationMs);
		return () => {
			cancelAnimationFrame(raf);
			window.clearTimeout(timer);
		};
		// children from the render that changed contentKey
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [contentKey, animate, durationMs]);

	const style = { "--track-crossfade-ms": `${durationMs}ms` } as CSSProperties;
	const running = phase === "run";

	return (
		<div
			className={`track-crossfade${className ? ` ${className}` : ""}`}
			data-phase={phase}
			style={style}
		>
			{back && (
				<div
					className={`track-crossfade-layer is-back${running ? " is-leaving" : ""}`}
					aria-hidden
				>
					{back.node}
				</div>
			)}
			<div
				key={front.key}
				className={`track-crossfade-layer is-front${phase === "idle" || running ? " is-shown" : ""}`}
			>
				{front.node}
			</div>
		</div>
	);
};
