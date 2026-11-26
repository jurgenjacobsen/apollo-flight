import React from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Tooltip } from "./Tooltip";

export interface TableCompactToggleProps {
    isCompact: boolean;
    onToggle: () => void;
    size?: "default" | "sm";
    className?: string;
}

export const TableCompactToggle: React.FC<TableCompactToggleProps> = ({
    isCompact,
    onToggle,
    size = "sm",
    className = "",
}) => {
    const isSmall = size === "sm";

    return (
        <Tooltip
            content={
                isCompact
                    ? "Switch to standard row density"
                    : "Switch to compact row density"
            }
        >
            <button
                type="button"
                onClick={onToggle}
                aria-pressed={isCompact}
                className={`inline-flex items-center gap-1.5 font-medium border transition-colors select-none ${
                    isSmall
                        ? "h-6 px-2 text-[11px] rounded-sm"
                        : "h-8 px-3 text-xs rounded-sm"
                } ${
                    isCompact
                        ? "bg-neutral-200 dark:bg-[#282828] text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-600"
                        : "bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs"
                } ${className}`}
            >
                {isCompact ? (
                    <>
                        <ChevronsUpDown
                            className={`${isSmall ? "w-3 h-3" : "w-3.5 h-3.5"} text-neutral-500 dark:text-neutral-400`}
                        />
                        <span>Expand</span>
                    </>
                ) : (
                    <>
                        <ChevronsDownUp
                            className={`${isSmall ? "w-3 h-3" : "w-3.5 h-3.5"} text-neutral-500 dark:text-neutral-400`}
                        />
                        <span>Compact</span>
                    </>
                )}
            </button>
        </Tooltip>
    );
};
