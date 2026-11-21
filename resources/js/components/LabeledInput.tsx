interface LabeledInputProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    direction?: 'auto' | 'ltr';
    maxLength?: number;
    placeholder?: string;
    disabled?: boolean;
    type?: 'text' | 'search';
}

export function LabeledInput({
    id,
    label,
    value,
    onChange,
    required = false,
    direction = 'auto',
    maxLength = 160,
    placeholder,
    disabled = false,
    type = 'text',
}: LabeledInputProps) {
    return (
        <label className="master-field" htmlFor={id}>
            <span>{label}{required ? ' *' : ''}</span>
            <input
                id={id}
                name={id}
                type={type}
                dir={direction}
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                onChange={(event) => onChange(event.currentTarget.value)}
            />
        </label>
    );
}
