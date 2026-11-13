import { useRef, useState, type PointerEvent } from "react";

const SWIPE_FRACTION = 0.22;
const FLICK_SPEED = 0.5;
const SLIDE_MS = 200;

export const useNowPlayingSwipe = (onNext: (() => void) | null, onPrevious: (() => void) | null) => {
	const [offset, setOffset] = useState(0);
	const [animated, setAnimated] = useState(false);
	const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
	const last = useRef({ x: 0, time: 0, speed: 0 });
	const settling = useRef(false);
	const [width, setWidth] = useState(1);
	const swiped = useRef(false);

	const onPointerDown = (e: PointerEvent<HTMLElement>) => {
		if (e.button !== 0 || settling.current) return;
		start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
		last.current = { x: e.clientX, time: e.timeStamp, speed: 0 };
		swiped.current = false;
	};

	const onPointerMove = (e: PointerEvent<HTMLElement>) => {
		const from = start.current;
		if (!from || from.id !== e.pointerId) return;
		const dx = e.clientX - from.x;
		const dy = e.clientY - from.y;
		if (from.horizontal === null) {
			if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
			from.horizontal = Math.abs(dx) > Math.abs(dy);
			if (!from.horizontal) {
				start.current = null;
				return;
			}
			e.currentTarget.setPointerCapture(e.pointerId);
			setWidth(e.currentTarget.offsetWidth || 1);
			swiped.current = true;
			setAnimated(false);
		}
		const elapsed = e.timeStamp - last.current.time;
		if (elapsed > 0) {
			last.current = { x: e.clientX, time: e.timeStamp, speed: (e.clientX - last.current.x) / elapsed };
		}
		const blocked = dx < 0 ? !onNext : !onPrevious;
		setOffset(blocked ? dx * 0.25 : dx);
	};

	const settle = (to: number, then?: () => void) => {
		settling.current = true;
		setAnimated(true);
		setOffset(to);
		setTimeout(() => {
			then?.();
			setAnimated(false);
			setOffset(0);
			settling.current = false;
		}, SLIDE_MS);
	};

	const onPointerUp = (e: PointerEvent<HTMLElement>) => {
		const from = start.current;
		start.current = null;
		if (!from?.horizontal) return;
		const panelWidth = e.currentTarget.offsetWidth;
		const dx = e.clientX - from.x;
		const go = dx < 0 ? onNext : onPrevious;
		const far = Math.abs(dx) >= panelWidth * SWIPE_FRACTION || Math.abs(last.current.speed) >= FLICK_SPEED;
		const backward = last.current.speed !== 0 && Math.sign(last.current.speed) !== Math.sign(dx);
		if (!go || !far || backward) {
			settle(0);
			return;
		}
		settle(dx < 0 ? -panelWidth : panelWidth, go);
	};

	const onPointerCancel = () => {
		if (start.current?.horizontal) settle(0);
		start.current = null;
	};

	return {
		underStyle: {
			opacity: Math.max(0, 1 - Math.abs(offset) / (width / 3)),
			transition: animated || offset === 0 ? `opacity ${SLIDE_MS}ms ease-out` : "none",
		},
		style: {
			transform: offset ? `translateX(${offset}px)` : undefined,
			transition: animated ? `transform ${SLIDE_MS}ms ease-out` : undefined,
		},
		handlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel,
			onClickCapture: (e: { stopPropagation: () => void; preventDefault: () => void }) => {
				if (!swiped.current) return;
				swiped.current = false;
				e.stopPropagation();
				e.preventDefault();
			},
		},
	};
};
