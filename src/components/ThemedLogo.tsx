import logoWhiteEn from "../assets/logo-white-en.svg";
import logoBlackEn from "../assets/logo-black-en.svg";
import logoWhiteRu from "../assets/logo-white-ru.svg";
import logoBlackRu from "../assets/logo-black-ru.svg";
import { logoLanguage, useI18n } from "../i18n";

const LOGOS = {
    en: { light: logoBlackEn, dark: logoWhiteEn },
    ru: { light: logoBlackRu, dark: logoWhiteRu },
};

interface ThemedLogoProps {
    className?: string;
}

/**
 * The logo of the chosen language (Settings → Logo; by default the interface
 * language). Shows the white logo on dark themes (where it is visible) and the
 * black logo on light themes; that choice is made in CSS by the `data-theme`
 * of <html>, so it switches with the theme without a re-render. `className`
 * is applied to both images (sizing).
 */
export const ThemedLogo = ({ className }: ThemedLogoProps) => {
    useI18n();
    const logos = LOGOS[logoLanguage()];
    const extra = className ? ` ${className}` : "";
    return (
        <>
            <img src={logos.light} alt="" className={`logo-on-light${extra}`} />
            <img src={logos.dark} alt="" className={`logo-on-dark${extra}`} />
        </>
    );
};
