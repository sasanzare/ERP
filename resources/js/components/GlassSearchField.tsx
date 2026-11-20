import { useId } from 'react';

interface GlassSearchFieldProps {
    label: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
}

export function GlassSearchField({ label, value, placeholder, onChange }: GlassSearchFieldProps) {
    const inputId = useId();

    return (
        <label className="search-field" htmlFor={inputId}>
            <span className="search-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                    <circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.6" />
                    <path d="m13.2 13.2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
            </span>
            <span className="visually-hidden">{label}</span>
            <input
                id={inputId}
                type="search"
                dir="auto"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.currentTarget.value)}
            />
            <span className="search-label" aria-hidden="true">جست‌وجو</span>
        </label>
    );
}
