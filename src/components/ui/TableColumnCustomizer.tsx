import React, { useState, useRef, useEffect } from "react";
import { ColumnState } from "../../hooks/useTableColumnOrder";
import {
    Columns3,
    RotateCcw,
    ChevronUp,
    ChevronDown,
    Check,
    X,
    Maximize2,
} from "lucide-react";
import { Tooltip } from "./Tooltip";

export interface TableColumnCustomizerProps {
    columns: ColumnState[];
    onToggleVisibility: (id: string) => void;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
    onReset: () => void;
    onResetWidths?: () => void;
    onResetColumnWidth?: (id: string) => void;
    hasCustomWidths?: boolean;
    className?: string;
    placement?: "top" | "bottom" | "auto";
    alignPopover?: "left" | "right";
    size?: "default" | "sm";
}

export const TableColumnCustomizer: React.FC<TableColumnCustomizerProps> = ({
    columns,
    onToggleVisibility,
    onMoveUp,
    onMoveDown,
    onReset,
    onResetWidths,
    onResetColumnWidth,
    hasCustomWidths = false,
    className = "",
    placement = "auto",
    alignPopover = "right",
    size = "default",
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [effectivePlacement, setEffectivePlacement] = useState<"top" | "bottom">(
        placement === "top" ? "top" : "bottom",
    );
    const [maxListHeight, setMaxListHeight] = useState<number>(256);
    const popoverRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const visibleCount = columns.filter((c) => c.visible).length;
    const totalCount = columns.length;
    const isSmall = size === "sm";

    // Dynamically position popover to prevent it from going past user viewport/scroll
    useEffect(() => {
        if (!isOpen) return;

        const updatePosition = () => {
            if (!triggerRef.current) return;
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            const neededHeight = 320;

            let chosen: "top" | "bottom";
            if (placement === "top") {
                chosen = spaceAbove < neededHeight && spaceBelow > spaceAbove ? "bottom" : "top";
            } else if (placement === "bottom") {
                chosen = spaceBelow < neededHeight && spaceAbove > spaceBelow ? "top" : "bottom";
            } else {
                // "auto": prioritize whichever direction has more room in the user's current viewport
                chosen = spaceAbove > spaceBelow ? "top" : "bottom";
            }

            setEffectivePlacement(chosen);
            const availableSpace = chosen === "top" ? spaceAbove - 60 : spaceBelow - 60;
            setMaxListHeight(Math.max(120, Math.min(256, Math.floor(availableSpace))));
        };

        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [isOpen, placement]);

    // Handle click outside to close popover
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div className={`relative inline-block ${className}`}>
            <Tooltip
                content="Customize table columns, lateral ordering & widths"
                disabled={isOpen}
            >
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
                    className={`inline-flex items-center gap-1.5 font-medium border transition-colors select-none ${
                        isSmall
                            ? "h-6 px-2 text-[11px] rounded"
                            : "h-8 px-3 text-xs rounded-sm"
                    } ${
                        isOpen
                            ? "bg-neutral-200 dark:bg-[#282828] text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-600"
                            : "bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs"
                    }`}
                >
                    <Columns3
                        className={`${isSmall ? "w-3 h-3" : "w-3.5 h-3.5"} text-neutral-500 dark:text-neutral-400`}
                    />
                    <span>Columns</span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                        {visibleCount}/{totalCount}
                    </span>
                    {hasCustomWidths && (
                        <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                            title="Custom column widths active"
                        />
                    )}
                </button>
            </Tooltip>

            {/* Dropdown Popover */}
            {isOpen && (
                <div
                    ref={popoverRef}
                    className={`absolute ${
                        effectivePlacement === "top"
                            ? "bottom-full mb-1.5"
                            : "top-full mt-1.5"
                    } ${
                        alignPopover === "left" ? "left-0" : "right-0"
                    } z-50 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#161616] border border-neutral-200 dark:border-[#2a2a2a] rounded-md shadow-xl p-3 text-left text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-100 select-none`}
                >
                    {/* Popover Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100 dark:border-geist-hairline/60">
                        <div>
                            <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                                Customize Columns
                            </div>
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                Drag column dividers in table to resize width
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            {onResetWidths && (
                                <Tooltip content="Reset column widths to default UI system">
                                    <button
                                        type="button"
                                        onClick={onResetWidths}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                    >
                                        <Maximize2 className="w-3 h-3" />
                                        <span>Fit</span>
                                    </button>
                                </Tooltip>
                            )}

                            <Tooltip content="Reset columns, order & widths to factory defaults">
                                <button
                                    type="button"
                                    onClick={onReset}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Reset</span>
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Columns List */}
                    <div
                        className="overflow-y-auto space-y-1 pr-1 text-xs"
                        style={{ maxHeight: `${maxListHeight}px` }}
                    >
                        {columns.map((col, index) => {
                            const isFirst = index === 0;
                            const isLast = index === columns.length - 1;
                            const canToggle = !col.required && (col.visible ? visibleCount > 1 : true);
                            const hasCustomWidth =
                                col.width !== undefined &&
                                col.defaultWidth !== undefined &&
                                col.width !== col.defaultWidth;

                            return (
                                <div
                                    key={col.id}
                                    className={`flex items-center justify-between p-1.5 rounded-md transition-colors ${
                                        col.visible
                                            ? "bg-neutral-50 dark:bg-neutral-900/60"
                                            : "opacity-60 bg-transparent hover:bg-neutral-50/50"
                                    }`}
                                >
                                    {/* Toggle checkbox & label */}
                                    <label
                                        className={`flex items-center gap-2 cursor-pointer flex-1 min-w-0 mr-2 ${
                                            canToggle ? "" : "cursor-not-allowed opacity-80"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={col.visible}
                                            disabled={!canToggle}
                                            onChange={() => onToggleVisibility(col.id)}
                                            className="w-3.5 h-3.5 rounded text-neutral-900 dark:text-white accent-neutral-900 dark:accent-white focus:ring-0"
                                        />
                                        <span className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                            {col.label}
                                        </span>
                                        {col.required && (
                                            <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                                Required
                                            </span>
                                        )}
                                    </label>

                                    {/* Width Indicator & Reorder Lateral Position Buttons */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {hasCustomWidth && (
                                            <div
                                                onClick={() => onResetColumnWidth?.(col.id)}
                                                title="Custom width applied. Click to reset to default."
                                                className="cursor-pointer text-[10px] font-mono px-1 py-0.2 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400 transition-colors flex items-center gap-0.5"
                                            >
                                                <span>{col.width}px</span>
                                                <X className="w-2.5 h-2.5" />
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            disabled={isFirst}
                                            onClick={() => onMoveUp(col.id)}
                                            title="Move column left in table"
                                            className={`p-1 rounded transition-colors ${
                                                isFirst
                                                    ? "text-neutral-300 dark:text-neutral-700 cursor-not-allowed"
                                                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800"
                                            }`}
                                        >
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isLast}
                                            onClick={() => onMoveDown(col.id)}
                                            title="Move column right in table"
                                            className={`p-1 rounded transition-colors ${
                                                isLast
                                                    ? "text-neutral-300 dark:text-neutral-700 cursor-not-allowed"
                                                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800"
                                            }`}
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Popover Footer */}
                    <div className="pt-2 mt-2 border-t border-neutral-100 dark:border-geist-hairline/60 flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400 font-mono">
                            Auto-saved to preferences
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-2.5 py-0.5 text-xs font-medium rounded bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
