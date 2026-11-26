import React, { useState, useEffect, useMemo } from "react";
import { useFlightStore } from "../../store/flightStore";
import { formatLogbookDuration } from "../../utils/flightFormatters";
import {
    PaginationBar,
    ConfirmDeleteButton,
    Tooltip,
    TableCompactToggle,
} from "../ui";
import {
    Trash2,
    RotateCcw,
    Clock,
    Plane,
    ArrowRight,
    ArrowLeft,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
    TrendingDown,
    Layers,
    Search,
    Calendar,
    Compass,
    Sliders,
    Info,
    AlertCircle,
} from "lucide-react";

type RecycleSortField =
    | "route"
    | "aircraft"
    | "duration"
    | "distance"
    | "touchdown"
    | "deletedAt"
    | "retention";
type SortDirection = "asc" | "desc";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const RecycleBinView: React.FC = () => {
    const {
        recycleBin,
        restoreFlightFromRecycleBin,
        permanentlyDeleteFromRecycleBin,
        emptyRecycleBin,
        purgeExpiredRecycleBinItems,
        pageSize,
        setPageSize,
        setActiveView,
    } = useFlightStore();

    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<RecycleSortField>("deletedAt");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [isCompact, setIsCompact] = useState<boolean>(() => {
        try {
            return localStorage.getItem("apollo_recycle_bin_compact") === "true";
        } catch {
            return false;
        }
    });

    const toggleCompact = () => {
        setIsCompact((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("apollo_recycle_bin_compact", String(next));
            } catch {}
            return next;
        });
    };

    const cellPadY = `${isCompact ? "py-1.5" : "py-3"} transition-[padding] duration-200 ease-out`;
    const subLineClass = `grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        isCompact
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100"
    }`;

    const handleSort = (field: RecycleSortField) => {
        if (sortField === field) {
            if (sortDirection === "desc") {
                setSortDirection("asc");
            } else {
                setSortField("deletedAt");
                setSortDirection("desc");
            }
        } else {
            setSortField(field);
            setSortDirection(field === "route" || field === "aircraft" ? "asc" : "desc");
        }
    };

    const renderSortIcon = (field: RecycleSortField) => {
        if (sortField === field) {
            return sortDirection === "asc" ? (
                <ArrowUp className="w-3 h-3 text-neutral-900 dark:text-white shrink-0" />
            ) : (
                <ArrowDown className="w-3 h-3 text-neutral-900 dark:text-white shrink-0" />
            );
        }
        return (
            <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-0 group-hover/sort:opacity-100 transition-opacity shrink-0" />
        );
    };

    // Purge expired items on mount and on unmount
    useEffect(() => {
        purgeExpiredRecycleBinItems();
        return () => {
            purgeExpiredRecycleBinItems();
        };
    }, [purgeExpiredRecycleBinItems]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const filteredItems = useMemo(() => {
        const q = searchTerm.toLowerCase().trim();
        const filtered = recycleBin.filter((f) => {
            if (!q) return true;
            return (
                f.departureIcao.toLowerCase().includes(q) ||
                f.arrivalIcao.toLowerCase().includes(q) ||
                f.aircraftType.toLowerCase().includes(q)
            );
        });

        return [...filtered].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case "route":
                    cmp = `${a.departureIcao}-${a.arrivalIcao}`.localeCompare(
                        `${b.departureIcao}-${b.arrivalIcao}`,
                    );
                    break;
                case "aircraft":
                    cmp = (a.aircraftType || "").localeCompare(b.aircraftType || "");
                    break;
                case "duration":
                    cmp = a.flightTimeSeconds - b.flightTimeSeconds;
                    break;
                case "distance":
                    cmp = (a.distanceFlownNm ?? 0) - (b.distanceFlownNm ?? 0);
                    break;
                case "touchdown":
                    cmp =
                        Math.abs(a.landingRateFpm ?? 0) -
                        Math.abs(b.landingRateFpm ?? 0);
                    break;
                case "retention":
                case "deletedAt":
                default:
                    cmp =
                        new Date(a.deletedAt).getTime() -
                        new Date(b.deletedAt).getTime();
                    break;
            }
            return sortDirection === "asc" ? cmp : -cmp;
        });
    }, [recycleBin, searchTerm, sortField, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredItems.slice(start, start + pageSize);
    }, [filteredItems, currentPage, pageSize]);

    // Calculate stats
    const now = Date.now();
    const expiringSoonCount = recycleBin.filter((f) => {
        const deletedTime = new Date(f.deletedAt).getTime();
        const remainingMs = THIRTY_DAYS_MS - (now - deletedTime);
        return remainingMs > 0 && remainingMs <= TWENTY_FOUR_HOURS_MS;
    }).length;

    const getRetentionInfo = (deletedAt: string) => {
        const deletedTime = new Date(deletedAt).getTime();
        const elapsedMs = now - deletedTime;
        const remainingMs = Math.max(0, THIRTY_DAYS_MS - elapsedMs);
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

        const isExpiringSoon = remainingMs <= TWENTY_FOUR_HOURS_MS;
        return {
            remainingMs,
            remainingHours,
            remainingDays,
            isExpiringSoon,
        };
    };

    return (
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 dark:border-geist-hairline gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                        <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                            Recycle Bin
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted">
                            Deleted recorded flights are held for 30 days before
                            being permanently purged.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {recycleBin.length > 0 && (
                        <ConfirmDeleteButton
                            onConfirm={emptyRecycleBin}
                            label="Empty Recycle Bin"
                            title="Empty Recycle Bin"
                            confirmTitle="Click again to confirm permanent deletion of all items"
                        />
                    )}
                    <button
                        type="button"
                        onClick={() => setActiveView("logbook")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-white hover:bg-neutral-100 dark:bg-[#181818] dark:hover:bg-[#222] border border-neutral-200 dark:border-geist-hairline text-neutral-800 dark:text-neutral-200 transition-colors shadow-2xs"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Logbook</span>
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-600 dark:text-neutral-300">
                        <Trash2 className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                            Deleted Flights
                        </div>
                        <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {recycleBin.length}
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
                        <Clock className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                            Purging Soon (&lt;24h)
                        </div>
                        <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {expiringSoonCount}
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
                        <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                            Retention Policy
                        </div>
                        <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                            30 Days Automatic
                        </div>
                    </div>
                </div>
            </div>

            {/* Search Input */}
            {recycleBin.length > 0 && (
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-neutral-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search deleted flights..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                        />
                    </div>
                </div>
            )}

            {/* Deleted Flights Table */}
            {recycleBin.length === 0 ? (
                <div className="p-12 text-center bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm space-y-2">
                    <div className="inline-flex p-3 rounded-full bg-neutral-100 dark:bg-[#181818] text-neutral-400 mb-1">
                        <Trash2 className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                        Recycle Bin is Empty
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-geist-muted max-w-sm mx-auto">
                        When you delete flights from the Logbook or Flight
                        Telemetry views, they will be held here safely for 30
                        days before permanent removal.
                    </p>
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm">
                    No deleted flights match "{searchTerm}"
                </div>
            ) : (
                <div className="overflow-hidden bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-xs relative">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-100/70 dark:bg-[#0e0e0e] border-b border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-400 select-none">
                                    <th className="py-2.5 px-4 font-medium">
                                        <Tooltip content="Sort by route">
                                            <button
                                                type="button"
                                                onClick={() => handleSort("route")}
                                                className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                            >
                                                <Plane className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                                <span>Route</span>
                                                {renderSortIcon("route")}
                                            </button>
                                        </Tooltip>
                                    </th>
                                    <th className="py-2.5 px-4 font-medium">
                                        <Tooltip content="Sort by aircraft">
                                            <button
                                                type="button"
                                                onClick={() => handleSort("aircraft")}
                                                className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                            >
                                                <Layers className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                                <span>Aircraft</span>
                                                {renderSortIcon("aircraft")}
                                            </button>
                                        </Tooltip>
                                    </th>
                                    <th className="py-2.5 px-4 font-medium">
                                        <Tooltip content="Sort by duration">
                                            <button
                                                type="button"
                                                onClick={() => handleSort("duration")}
                                                className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                            >
                                                <Clock className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                                <span>Duration</span>
                                                {renderSortIcon("duration")}
                                            </button>
                                        </Tooltip>
                                    </th>
                                    <th className="py-2.5 px-4 font-medium">
                                        <Tooltip content="Sort by distance">
                                            <button
                                                type="button"
                                                onClick={() => handleSort("distance")}
                                                className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                            >
                                                <Compass className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                                <span>Distance</span>
                                                {renderSortIcon("distance")}
                                            </button>
                                        </Tooltip>
                                    </th>
                                    <th className="py-2.5 px-4 font-medium">
                                        <Tooltip content="Sort by touchdown rate">
                                            <button
                                                type="button"
                                                onClick={() => handleSort("touchdown")}
                                                className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                            >
                                                <TrendingDown className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                                <span>Touchdown</span>
                                                {renderSortIcon("touchdown")}
                                            </button>
                                        </Tooltip>
                                    </th>
                                    <th className="py-2.5 px-4 font-medium">
                                        <Tooltip content="Sort by deleted date">
                                            <button
                                                type="button"
                                                onClick={() => handleSort("deletedAt")}
                                                className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                            >
                                                <Calendar className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                                <span>Deleted</span>
                                                {renderSortIcon("deletedAt")}
                                            </button>
                                        </Tooltip>
                                    </th>
                                    <th className="py-2.5 px-4 font-medium">
                                        <Tooltip content="Sort by retention status">
                                            <button
                                                type="button"
                                                onClick={() => handleSort("retention")}
                                                className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                            >
                                                <Info className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                                <span>Retention</span>
                                                {renderSortIcon("retention")}
                                            </button>
                                        </Tooltip>
                                    </th>
                                    <th className="py-2.5 px-4 font-medium text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                                            <span>Actions</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200/70 dark:divide-geist-hairline text-xs">
                                {paginatedItems.map((flight) => {
                                    const retention = getRetentionInfo(
                                        flight.deletedAt,
                                    );
                                    const deletedDate = new Date(
                                        flight.deletedAt,
                                    ).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    });
                                    const deletedTime = new Date(
                                        flight.deletedAt,
                                    ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    });

                                    return (
                                        <tr
                                            key={flight.id}
                                            className="hover:bg-neutral-50/80 dark:hover:bg-[#121212] transition-colors duration-150 group"
                                        >
                                            {/* Route */}
                                            <td className={`${cellPadY} px-4`}>
                                                <div className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-white truncate">
                                                    <span>
                                                        {flight.departureIcao ||
                                                            "????"}
                                                    </span>
                                                    <ArrowRight className="w-3 h-3 text-neutral-400 shrink-0" />
                                                    <span>
                                                        {flight.arrivalIcao ||
                                                            "????"}
                                                    </span>
                                                </div>
                                                <div
                                                    className={subLineClass}
                                                    aria-hidden={isCompact}
                                                >
                                                    <div className="overflow-hidden">
                                                        <div className="text-[10px] text-neutral-400 dark:text-neutral-500 tracking-tight truncate tabular-nums">
                                                            Flown{" "}
                                                            {new Date(
                                                                flight.startTime,
                                                            ).toLocaleDateString(
                                                                undefined,
                                                                {
                                                                    month: "short",
                                                                    day: "numeric",
                                                                    year: "numeric",
                                                                },
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Aircraft */}
                                            <td
                                                className={`${cellPadY} px-4 text-neutral-700 dark:text-neutral-300 truncate max-w-[180px]`}
                                                title={
                                                    flight.aircraftType ||
                                                    "Aircraft"
                                                }
                                            >
                                                <div className="font-medium text-neutral-900 dark:text-white truncate">
                                                    {flight.aircraftType ||
                                                        "Aircraft"}
                                                </div>
                                            </td>

                                            {/* Duration */}
                                            <td
                                                className={`${cellPadY} px-4 tabular-nums text-neutral-800 dark:text-neutral-200 whitespace-nowrap`}
                                            >
                                                {formatLogbookDuration(
                                                    flight.flightTimeSeconds,
                                                )}
                                            </td>

                                            {/* Distance */}
                                            <td
                                                className={`${cellPadY} px-4 tabular-nums text-neutral-800 dark:text-neutral-200 whitespace-nowrap`}
                                            >
                                                {(
                                                    flight.distanceFlownNm ?? 0
                                                ).toFixed(1)}{" "}
                                                NM
                                            </td>

                                            {/* Touchdown */}
                                            <td
                                                className={`${cellPadY} px-4 tabular-nums whitespace-nowrap`}
                                            >
                                                {flight.landingRateFpm !==
                                                    undefined &&
                                                flight.landingRateFpm !==
                                                    null ? (
                                                    <span
                                                        className={`inline-flex items-center gap-1 ${
                                                            Math.abs(
                                                                flight.landingRateFpm,
                                                            ) < 180
                                                                ? "text-emerald-600 dark:text-emerald-400"
                                                                : Math.abs(
                                                                        flight.landingRateFpm,
                                                                    ) < 300
                                                                  ? "text-amber-600 dark:text-amber-400"
                                                                  : "text-red-600 dark:text-red-400"
                                                        }`}
                                                    >
                                                        {Math.round(
                                                            flight.landingRateFpm,
                                                        )}{" "}
                                                        fpm
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-400 dark:text-neutral-600">
                                                        —
                                                    </span>
                                                )}
                                            </td>

                                            {/* Deleted */}
                                            <td
                                                className={`${cellPadY} px-4 text-neutral-500 dark:text-neutral-400 whitespace-nowrap`}
                                            >
                                                <span>{deletedDate}</span>
                                                <span
                                                    aria-hidden={isCompact}
                                                    className={`inline-block overflow-hidden align-bottom text-[11px] text-neutral-400 dark:text-neutral-500 transition-all duration-200 ease-out ${
                                                        isCompact
                                                            ? "max-w-0 opacity-0 ml-0"
                                                            : "max-w-[120px] opacity-100 ml-1.5"
                                                    }`}
                                                >
                                                    ({deletedTime})
                                                </span>
                                            </td>

                                            {/* Retention */}
                                            <td
                                                className={`${cellPadY} px-4 whitespace-nowrap`}
                                            >
                                                {retention.isExpiringSoon ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 animate-pulse">
                                                        <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                                                        <span>
                                                            Purging (
                                                            {
                                                                retention.remainingHours
                                                            }
                                                            h)
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-block text-[11px] px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline tabular-nums">
                                                        {
                                                            retention.remainingDays
                                                        }{" "}
                                                        days left
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td
                                                className={`${cellPadY} px-4 text-right whitespace-nowrap relative`}
                                            >
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Restore Button */}
                                                    <Tooltip content="Restore flight to logbook">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                restoreFlightFromRecycleBin(
                                                                    flight.id,
                                                                )
                                                            }
                                                            className="p-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                                            aria-label="Restore flight to logbook"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        </button>
                                                    </Tooltip>

                                                    {/* Permanently Delete Button */}
                                                    <ConfirmDeleteButton
                                                        onConfirm={() =>
                                                            permanentlyDeleteFromRecycleBin(
                                                                flight.id,
                                                            )
                                                        }
                                                        title="Delete permanently"
                                                        confirmTitle="Click to confirm permanent deletion"
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    <PaginationBar
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredItems.length}
                        pageSize={pageSize}
                        onPageChange={(p) => setCurrentPage(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setCurrentPage(1);
                        }}
                        itemName="deleted flights"
                    >
                        <TableCompactToggle
                            isCompact={isCompact}
                            onToggle={toggleCompact}
                            size="sm"
                        />
                    </PaginationBar>
                </div>
            )}
        </div>
    );
};
