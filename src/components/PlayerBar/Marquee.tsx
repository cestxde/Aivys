import { useEffect, useRef, useState } from "react";

/**
 * A line of text that scrolls back and forth when it does not fit (the
 * playing track's title). Styled by `.track-name-display` (PlayerBar.css)
 * plus `className`.
 */
export const Marquee = ({ text, className = "" }: { text: string; className?: string }) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);

    useEffect(() => {
        const check = () => {
            if (containerRef.current && textRef.current) {
                setIsOverflowing(textRef.current.scrollWidth > containerRef.current.offsetWidth);
            }
        };
        const timer = setTimeout(check, 50);
        window.addEventListener("resize", check);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", check);
        };
    }, [text]);

    return (
        <span
            ref={containerRef}
            key={text}
            className={`track-name-display ${isOverflowing ? "is-overflowing" : ""} ${className}`}
        >
            <span ref={textRef} className="marquee-content">{text}</span>
            {isOverflowing && <span className="marquee-duplicate">{text}</span>}
        </span>
    );
};
