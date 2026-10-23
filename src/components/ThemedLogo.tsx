import logoWhite from "../assets/logo-white-en.svg";
import logoBlack from "../assets/logo-black-en.svg";

interface ThemedLogoProps {
    className?: string;
}

/**
 * Shows the white logo on dark themes (where it is visible) and the black logo
 * on light themes. Selection is done in CSS by the `data-theme` of <html>, so
 * it switches with the theme without a re-render. `className` is applied to
 * both images (sizing).
 */
export const ThemedLogo = ({ className }: ThemedLogoProps) => {
    const extra = className ? ` ${className}` : "";
    return (
        <>
            <img src={logoBlack} alt="" className={`logo-on-light${extra}`} />
            <img src={logoWhite} alt="" className={`logo-on-dark${extra}`} />
        </>
    );
};
