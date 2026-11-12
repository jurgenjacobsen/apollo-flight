import React, {
    useState,
    useRef,
    useEffect,
    useId,
    useCallback,
    ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption<T = any> {
    value: T;
    label: string | ReactNode;
    description?: string;
    disabled?: boolean;
    icon?: ReactNode;
    checkbox?: boolean;
}

export interface SelectGroup<T = any> {
    label: string;
    options: SelectOption<T>[];
}

export interface SelectProps<T = any> {
    value: T;
    onChange: (value: T) => void;
    options?: SelectOption<any>[];
    groups?: SelectGroup<any>[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    triggerClassName?: string;
    menuClassName?: string;
    id?: string;
    name?: string;
    size?: "sm" | "md";
    icon?: ReactNode;
    ariaLabel?: string;
    showCheckbox?: boolean;
    multiple?: boolean;
}

interface FlattenedOption<T = any> {
    value: T;
    label: string | ReactNode;
    textLabel: string;
    description?: string;
    disabled?: boolean;
    icon?: ReactNode;
    checkbox?: boolean;
    groupLabel?: string;
}

export function Select<T = any>({
    value,
    onChange,
    options,
    groups,
    placeholder = "Select an option...",
    disabled = false,
    className = "",
    triggerClassName = "",
    menuClassName = "",
    id,
    name,
    size = "sm",
    icon,
    ariaLabel,
    showCheckbox = false,
    multiple = false,
}: SelectProps<T>) {
    const generatedId = useId();
    const selectId = id || generatedId;
    const listboxId = `${selectId}-listbox`;

    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [dropdownCoords, setDropdownCoords] = useState<{
        top: number;
        left: number;
        width: number;
        isFlippedUp: boolean;
    }>({
        top: 0,
        left: 0,
        width: 0,
        isFlippedUp: false,
    });

    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchStringRef = useRef<string>("");

    // Normalize options into a flat list for linear keyboard navigation
    const flattenedOptions: FlattenedOption<T>[] = [];
    if (groups && groups.length > 0) {
        groups.forEach((group) => {
            group.options.forEach((opt) => {
                const textLabel =
                    typeof opt.label === "string"
                        ? opt.label
                        : String(opt.value);
                flattenedOptions.push({
                    ...opt,
                    textLabel,
                    groupLabel: group.label,
                });
            });
        });
    } else if (options && options.length > 0) {
        options.forEach((opt) => {
            const textLabel =
                typeof opt.label === "string" ? opt.label : String(opt.value);
            flattenedOptions.push({
                ...opt,
                textLabel,
            });
        });
    }

    const isOptionSelected = (optValue: T) => {
        if (multiple) {
            return Array.isArray(value) && (value as T[]).includes(optValue);
        }
        return (value as T) === optValue;
    };

    const selectedOptions = flattenedOptions.filter((opt) =>
        isOptionSelected(opt.value),
    );

    const firstSelectedIndex = flattenedOptions.findIndex((opt) =>
        isOptionSelected(opt.value),
    );

    // Measure and position dropdown
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownHeight = 260; // Max expected height
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const isFlippedUp =
            spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

        const top = isFlippedUp ? Math.max(8, rect.top - 4) : rect.bottom + 4;
        const left = Math.max(
            8,
            Math.min(rect.left, window.innerWidth - rect.width - 8),
        );

        setDropdownCoords({
            top,
            left,
            width: Math.max(rect.width, 160),
            isFlippedUp,
        });
    }, []);

    const openDropdown = () => {
        if (disabled) return;
        updatePosition();
        setIsOpen(true);
        setHighlightedIndex(
            firstSelectedIndex >= 0 ? firstSelectedIndex : 0,
        );
    };

    const closeDropdown = () => {
        setIsOpen(false);
        searchStringRef.current = "";
        if (triggerRef.current) {
            triggerRef.current.focus();
        }
    };

    // Close on outside click or window resize/scroll
    useEffect(() => {
        if (!isOpen) return;

        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current?.contains(target) ||
                menuRef.current?.contains(target)
            ) {
                return;
            }
            closeDropdown();
        };

        const handleScrollOrResize = () => {
            updatePosition();
        };

        document.addEventListener("mousedown", handleMouseDown);
        window.addEventListener("resize", handleScrollOrResize);
        window.addEventListener("scroll", handleScrollOrResize, true);

        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            window.removeEventListener("resize", handleScrollOrResize);
            window.removeEventListener("scroll", handleScrollOrResize, true);
        };
    }, [isOpen, updatePosition]);

    // Scroll active item into view
    useEffect(() => {
        if (!isOpen || highlightedIndex < 0 || !menuRef.current) return;
        const itemEl = menuRef.current.querySelector(
            `[data-option-index="${highlightedIndex}"]`,
        ) as HTMLElement | null;
        if (itemEl) {
            itemEl.scrollIntoView({ block: "nearest" });
        }
    }, [isOpen, highlightedIndex]);

    // Select or toggle an option
    const handleSelect = (option: FlattenedOption<T>) => {
        if (option.disabled) return;

        if (multiple) {
            const currentList = Array.isArray(value) ? [...(value as T[])] : [];
            const exists = currentList.includes(option.value);
            const nextList = exists
                ? currentList.filter((v) => v !== option.value)
                : [...currentList, option.value];
            (onChange as (val: T[]) => void)(nextList);
            updatePosition();
        } else {
            (onChange as (val: T) => void)(option.value);
            closeDropdown();
        }
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (!isOpen) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
                e.preventDefault();
                openDropdown();
            }
            return;
        }

        switch (e.key) {
            case "Escape": {
                e.preventDefault();
                closeDropdown();
                break;
            }
            case "Tab": {
                setIsOpen(false);
                break;
            }
            case "Enter":
            case " ": {
                e.preventDefault();
                if (
                    highlightedIndex >= 0 &&
                    flattenedOptions[highlightedIndex]
                ) {
                    handleSelect(flattenedOptions[highlightedIndex]);
                }
                break;
            }
            case "ArrowDown": {
                e.preventDefault();
                let nextIndex = highlightedIndex + 1;
                while (
                    nextIndex < flattenedOptions.length &&
                    flattenedOptions[nextIndex].disabled
                ) {
                    nextIndex++;
                }
                if (nextIndex < flattenedOptions.length) {
                    setHighlightedIndex(nextIndex);
                }
                break;
            }
            case "ArrowUp": {
                e.preventDefault();
                let prevIndex = highlightedIndex - 1;
                while (prevIndex >= 0 && flattenedOptions[prevIndex].disabled) {
                    prevIndex--;
                }
                if (prevIndex >= 0) {
                    setHighlightedIndex(prevIndex);
                }
                break;
            }
            case "Home": {
                e.preventDefault();
                const firstEnabled = flattenedOptions.findIndex(
                    (o) => !o.disabled,
                );
                if (firstEnabled >= 0) setHighlightedIndex(firstEnabled);
                break;
            }
            case "End": {
                e.preventDefault();
                for (let i = flattenedOptions.length - 1; i >= 0; i--) {
                    if (!flattenedOptions[i].disabled) {
                        setHighlightedIndex(i);
                        break;
                    }
                }
                break;
            }
            default: {
                // Quick type-ahead search
                if (
                    e.key.length === 1 &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey
                ) {
                    e.preventDefault();
                    searchStringRef.current += e.key.toLowerCase();
                    if (searchTimeoutRef.current) {
                        clearTimeout(searchTimeoutRef.current);
                    }
                    searchTimeoutRef.current = setTimeout(() => {
                        searchStringRef.current = "";
                    }, 600);

                    const search = searchStringRef.current;
                    const matchIdx = flattenedOptions.findIndex(
                        (opt, i) =>
                            !opt.disabled &&
                            i >= highlightedIndex &&
                            opt.textLabel.toLowerCase().startsWith(search),
                    );

                    if (matchIdx >= 0) {
                        setHighlightedIndex(matchIdx);
                    } else {
                        // Wrap around
                        const wrapMatchIdx = flattenedOptions.findIndex(
                            (opt) =>
                                !opt.disabled &&
                                opt.textLabel.toLowerCase().startsWith(search),
                        );
                        if (wrapMatchIdx >= 0) {
                            setHighlightedIndex(wrapMatchIdx);
                        }
                    }
                }
                break;
            }
        }
    };

    const sizeClasses =
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

    // Determine icon to display in the trigger
    const activeTriggerIcon =
        !multiple && selectedOptions.length === 1 && selectedOptions[0].icon
            ? selectedOptions[0].icon
            : icon;

    // Render individual option row with checkbox and icon support
    const renderOptionRow = (opt: FlattenedOption<T>, flatIdx: number) => {
        const isSelected = isOptionSelected(opt.value);
        const isHighlighted = flatIdx === highlightedIndex;
        const hasCheckbox = Boolean(showCheckbox || multiple || opt.checkbox);

        return (
            <div
                key={String(opt.value)}
                id={`${selectId}-opt-${flatIdx}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                data-option-index={flatIdx}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => {
                    if (!opt.disabled) setHighlightedIndex(flatIdx);
                }}
                className={`px-2.5 py-1.5 text-xs flex items-center gap-2 cursor-pointer select-none transition-colors duration-100 ${
                    opt.disabled
                        ? "opacity-40 cursor-not-allowed pointer-events-none"
                        : isHighlighted
                          ? "bg-neutral-100 dark:bg-[#202020] text-neutral-900 dark:text-white"
                          : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#181818]"
                } ${isSelected ? "font-medium" : "font-normal"}`}
            >
                {/* Checkbox Support */}
                {hasCheckbox && (
                    <div
                        className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                                ? "bg-neutral-900 dark:bg-white border-neutral-900 dark:border-white text-white dark:text-black"
                                : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-black"
                        }`}
                        aria-hidden="true"
                    >
                        {isSelected && (
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                        )}
                    </div>
                )}

                {/* Option Icon Support */}
                {opt.icon && (
                    <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                        {opt.icon}
                    </span>
                )}

                {/* Label & Description */}
                <div className="flex flex-col truncate flex-1 min-w-0 text-left">
                    <span className="truncate">{opt.label}</span>
                    {opt.description && (
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                            {opt.description}
                        </span>
                    )}
                </div>

                {/* Trailing Checkmark (shown for standard single-select when not using checkboxes) */}
                {!hasCheckbox && isSelected && (
                    <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white shrink-0 ml-auto" />
                )}
            </div>
        );
    };

    return (
        <div className={`relative inline-block ${className}`}>
            {name && (
                <input
                    type="hidden"
                    name={name}
                    value={
                        Array.isArray(value)
                            ? (value as T[]).join(",")
                            : String(value)
                    }
                />
            )}

            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                id={selectId}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => (isOpen ? closeDropdown() : openDropdown())}
                onKeyDown={handleKeyDown}
                className={`w-full ${sizeClasses} bg-white dark:bg-black border border-neutral-200 dark:border-geist-hairline enabled:hover:border-neutral-300 dark:enabled:hover:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-sm flex items-center justify-between gap-2 text-left font-sans transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer ${triggerClassName}`}
            >
                <span className="flex items-center gap-2 truncate">
                    {activeTriggerIcon && (
                        <span className="shrink-0 text-neutral-400 dark:text-neutral-500">
                            {activeTriggerIcon}
                        </span>
                    )}
                    <span className="truncate">
                        {selectedOptions.length === 0 ? (
                            <span className="text-neutral-400 dark:text-neutral-500 font-normal">
                                {placeholder}
                            </span>
                        ) : multiple ? (
                            selectedOptions.length === 1 ? (
                                selectedOptions[0].label
                            ) : (
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="truncate">
                                        {selectedOptions
                                            .map((o) => o.textLabel)
                                            .join(", ")}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium shrink-0">
                                        {selectedOptions.length}
                                    </span>
                                </span>
                            )
                        ) : (
                            selectedOptions[0].label
                        )}
                    </span>
                </span>

                <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 shrink-0 transition-transform duration-150 ${
                        isOpen ? "rotate-180" : "rotate-0"
                    }`}
                    aria-hidden="true"
                />
            </button>

            {/* Portal Dropdown Menu */}
            {isOpen &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={listboxId}
                        role="listbox"
                        tabIndex={-1}
                        aria-multiselectable={multiple}
                        aria-activedescendant={
                            highlightedIndex >= 0
                                ? `${selectId}-opt-${highlightedIndex}`
                                : undefined
                        }
                        onKeyDown={handleKeyDown}
                        style={{
                            position: "fixed",
                            top: dropdownCoords.isFlippedUp
                                ? undefined
                                : dropdownCoords.top,
                            bottom: dropdownCoords.isFlippedUp
                                ? window.innerHeight - dropdownCoords.top
                                : undefined,
                            left: dropdownCoords.left,
                            width: dropdownCoords.width,
                        }}
                        className={`z-[9999] max-h-64 overflow-y-auto bg-white dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-xl py-1 focus:outline-none font-sans text-neutral-900 dark:text-neutral-100 animate-dropdown-smooth ${menuClassName}`}
                    >
                        {groups && groups.length > 0 ? (
                            groups.map((group, gIdx) => (
                                <div
                                    key={group.label || gIdx}
                                    className="border-b border-neutral-100 dark:border-neutral-800 last:border-b-0 pb-1 mb-1 last:pb-0 last:mb-0"
                                >
                                    <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 dark:text-neutral-500 select-none text-left">
                                        {group.label}
                                    </div>
                                    {group.options.map((opt) => {
                                        const flatIdx =
                                            flattenedOptions.findIndex(
                                                (fo) =>
                                                    fo.value === opt.value &&
                                                    fo.groupLabel ===
                                                        group.label,
                                            );
                                        return renderOptionRow(
                                            flattenedOptions[flatIdx],
                                            flatIdx,
                                        );
                                    })}
                                </div>
                            ))
                        ) : flattenedOptions.length > 0 ? (
                            flattenedOptions.map((opt, idx) =>
                                renderOptionRow(opt, idx),
                            )
                        ) : (
                            <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500 text-center">
                                No options available
                            </div>
                        )}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
