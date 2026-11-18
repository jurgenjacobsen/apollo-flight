import React, { useId } from "react";

export interface CheckboxProps {
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    label?: React.ReactNode;
    description?: React.ReactNode;
    id?: string;
    className?: string;
    name?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
    checked = false,
    onChange,
    disabled = false,
    label,
    description,
    id,
    className = "",
    name,
}) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const hasDescription = Boolean(description);

    return (
        <label
            htmlFor={inputId}
            className={`inline-flex ${
                hasDescription ? "items-start" : "items-center"
            } gap-2.5 select-none transition-opacity ${
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer group"
            } ${className}`}
        >
            <div
                className={`relative flex items-center justify-center shrink-0 ${
                    hasDescription ? "mt-0.5" : ""
                }`}
            >
                <input
                    id={inputId}
                    name={name}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onChange?.(e.target.checked)}
                    className="sr-only peer"
                />
                <div
                    className={`w-4 h-4 rounded-xs border box-border shrink-0 transition-colors duration-150 flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 dark:peer-focus-visible:ring-neutral-500 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-black ${
                        checked
                            ? "bg-neutral-900 border-neutral-900 text-white dark:bg-white dark:border-white dark:text-black"
                            : "bg-white dark:bg-black border-neutral-300 dark:border-geist-hairline group-hover:border-neutral-400 dark:group-hover:border-neutral-500 text-transparent"
                    }`}
                >
                    <svg
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-3 h-3 transition-opacity duration-100 ${
                            checked ? "opacity-100" : "opacity-0"
                        }`}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M2.5 6.25L4.75 8.5L9.5 3.5" />
                    </svg>
                </div>
            </div>

            {(label || description) && (
                <div className="flex flex-col text-left justify-center">
                    {label && (
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors leading-none select-none">
                            {label}
                        </span>
                    )}
                    {description && (
                        <span className="text-[11px] text-neutral-500 dark:text-geist-muted mt-0.5 leading-normal">
                            {description}
                        </span>
                    )}
                </div>
            )}
        </label>
    );
};
