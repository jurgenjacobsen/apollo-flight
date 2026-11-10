import React, { useState, useEffect } from "react";
import {
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
} from "lucide-react";

export interface PaginationBarProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    pageSizeOptions?: number[];
    itemName?: string;
    className?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [25, 50, 100],
    itemName = "items",
    className = "",
}) => {
    const safeTotalPages = Math.max(1, totalPages);
    const [pageInput, setPageInput] = useState<string>(String(currentPage));

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    const commitPageInput = () => {
        const parsed = parseInt(pageInput.trim(), 10);
        if (isNaN(parsed)) {
            setPageInput(String(currentPage));
            return;
        }
        const clamped = Math.max(1, Math.min(safeTotalPages, parsed));
        setPageInput(String(clamped));
        if (clamped !== currentPage) {
            onPageChange(clamped);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            commitPageInput();
            (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
            setPageInput(String(currentPage));
            (e.target as HTMLInputElement).blur();
        }
    };

    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    const canGoPrev = currentPage > 1;
    const canGoNext = currentPage < safeTotalPages;

    return (
        <div
            className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-geist-surface border-t border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-400 select-none shadow-xs transition-colors ${className}`}
        >
            {/* Item Range Info & Page Size Selector */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                <div className="text-[11px] sm:text-xs">
                    {totalItems === 0 ? (
                        <span>No {itemName} found</span>
                    ) : (
                        <span>
                            Showing{" "}
                            <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                {startItem}
                            </span>
                            –
                            <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                {endItem}
                            </span>{" "}
                            of{" "}
                            <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                {totalItems}
                            </span>{" "}
                            {itemName}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5 pl-3 border-l border-neutral-200 dark:border-geist-hairline">
                    <span className="text-[11px] text-neutral-400 dark:text-geist-muted">
                        Per page:
                    </span>
                    <div className="flex items-center gap-1">
                        {pageSizeOptions.map((opt) => (
                            <button
                                key={opt}
                                type="button"
                                onClick={() => onPageSizeChange(opt)}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                    pageSize === opt
                                        ? "bg-neutral-900 dark:bg-white text-white dark:text-black font-semibold"
                                        : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                }`}
                                aria-label={`Show ${opt} ${itemName} per page`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-1 w-full sm:w-auto justify-center sm:justify-end">
                {/* First Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(1)}
                    disabled={!canGoPrev}
                    className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-700 dark:text-neutral-300 transition-colors"
                    title="First page"
                    aria-label="First page"
                >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                </button>

                {/* Previous Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={!canGoPrev}
                    className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-700 dark:text-neutral-300 transition-colors"
                    title="Previous page"
                    aria-label="Previous page"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Direct Page Input */}
                <div className="flex items-center gap-1 px-1 text-xs">
                    <span className="text-[11px] text-neutral-400 dark:text-geist-muted">
                        Page
                    </span>
                    <input
                        type="number"
                        min={1}
                        max={safeTotalPages}
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        onBlur={commitPageInput}
                        onKeyDown={handleKeyDown}
                        aria-label="Current page number"
                        className="w-12 px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums border border-neutral-300 dark:border-geist-hairline rounded bg-neutral-50 dark:bg-black text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                    />
                    <span className="text-[11px] text-neutral-400 dark:text-geist-muted">
                        of{" "}
                        <span className="tabular-nums font-semibold text-neutral-700 dark:text-neutral-300">
                            {safeTotalPages}
                        </span>
                    </span>
                </div>

                {/* Next Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={!canGoNext}
                    className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-700 dark:text-neutral-300 transition-colors"
                    title="Next page"
                    aria-label="Next page"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Last Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(safeTotalPages)}
                    disabled={!canGoNext}
                    className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-700 dark:text-neutral-300 transition-colors"
                    title="Last page"
                    aria-label="Last page"
                >
                    <ChevronsRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};
