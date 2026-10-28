import { useRef, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { t } from "../../i18n";
import "./SearchInput.css";

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** On the box (its size in a toolbar). */
    className?: string;
    autoFocus?: boolean;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/** A search box: a magnifier before the text, an × after it that clears it. */
export const SearchInput = ({ value, onChange, placeholder, className, autoFocus, onKeyDown }: SearchInputProps) => {
    const input = useRef<HTMLInputElement>(null);
    return (
        <div className={`search-input ${className ?? ""}`} onClick={() => input.current?.focus()}>
            <Search size={15} className="search-input-icon" />
            <input
                ref={input}
                type="text"
                value={value}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
            />
            {value && (
                <button
                    className="search-input-clear"
                    title={t("search.clear")}
                    aria-label={t("search.clear")}
                    onClick={() => {
                        onChange("");
                        input.current?.focus();
                    }}
                >
                    <X size={15} />
                </button>
            )}
        </div>
    );
};
