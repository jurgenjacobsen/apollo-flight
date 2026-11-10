import React, { useState, useEffect, useMemo } from "react";
import { useFlightStore } from "../../store/flightStore";
import { DeletedFlightRecord } from "../../types/flight";
import { PaginationBar, ConfirmDeleteButton } from "../ui";
import {
    Trash2,
    RotateCcw,
    AlertTriangle,
    Clock,
    Plane,
    ArrowRight,
    ArrowLeft,
    TrendingDown,
    Layers,
    Search,
    CheckCircle2,
    Calendar,
    AlertCircle,
} from "lucide-react";

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
        return recycleBin.filter((f) => {
            const q = searchTerm.toLowerCase().trim();
            if (!q) return true;
            return (
                f.departureIcao.toLowerCase().includes(q) ||
                f.arrivalIcao.toLowerCase().includes(q) ||
                f.aircraftType.toLowerCase().includes(q)
            );
        });
    }, [recycleBin, searchTerm]);

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
                <div className="space-y-3">
                    <div className="border border-neutral-200 dark:border-geist-hairline rounded-sm overflow-hidden bg-white dark:bg-geist-surface shadow-xs">
                        <div className="overflow-x-auto min-w-full">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-geist-hairline bg-neutral-50/70 dark:bg-[#141414] text-[11px] text-neutral-500 dark:text-geist-muted uppercase tracking-wider">
                                        <th className="py-2.5 px-3 font-medium">
                                            Route
                                        </th>
                                        <th className="py-2.5 px-3 font-medium">
                                            Aircraft
                                        </th>
                                        <th className="py-2.5 px-3 font-medium">
                                            Flight Time
                                        </th>
                                        <th className="py-2.5 px-3 font-medium">
                                            Distance
                                        </th>
                                        <th className="py-2.5 px-3 font-medium">
                                            Landing Rate
                                        </th>
                                        <th className="py-2.5 px-3 font-medium">
                                            Deleted Date
                                        </th>
                                        <th className="py-2.5 px-3 font-medium">
                                            Retention Status
                                        </th>
                                        <th className="py-2.5 px-3 font-medium text-right pr-4">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 dark:divide-geist-hairline text-xs">
                                    {paginatedItems.map((flight) => {
                                        const retention = getRetentionInfo(
                                            flight.deletedAt,
                                        );
                                        const durationMins = Math.round(
                                            flight.flightTimeSeconds / 60,
                                        );

                                        return (
                                            <tr
                                                key={flight.id}
                                                className="hover:bg-neutral-50 dark:hover:bg-[#121212] transition-colors"
                                            >
                                                {/* Route */}
                                                <td className="py-3 px-3 align-middle">
                                                    <div className="font-mono font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                                                        <span>
                                                            {flight.departureIcao ||
                                                                "????"}
                                                        </span>
                                                        <ArrowRight className="w-3 h-3 text-neutral-400" />
                                                        <span>
                                                            {flight.arrivalIcao ||
                                                                "????"}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-neutral-400">
                                                        {new Date(
                                                            flight.startTime,
                                                        ).toLocaleDateString()}
                                                    </div>
                                                </td>

                                                {/* Aircraft */}
                                                <td className="py-3 px-3 align-middle text-neutral-700 dark:text-neutral-300 truncate max-w-[140px]">
                                                    {flight.aircraftType ||
                                                        "Aircraft"}
                                                </td>

                                                {/* Flight Time */}
                                                <td className="py-3 px-3 align-middle font-mono tabular-nums text-neutral-900 dark:text-white">
                                                    {Math.floor(
                                                        durationMins / 60,
                                                    )}
                                                    h{" "}
                                                    {String(
                                                        durationMins % 60,
                                                    ).padStart(2, "0")}
                                                    m
                                                </td>

                                                {/* Distance */}
                                                <td className="py-3 px-3 align-middle font-mono tabular-nums text-neutral-900 dark:text-white">
                                                    {Math.round(
                                                        flight.distanceFlownNm ||
                                                            0,
                                                    )}{" "}
                                                    NM
                                                </td>

                                                {/* Landing Rate */}
                                                <td className="py-3 px-3 align-middle font-mono tabular-nums">
                                                    {flight.landingRateFpm !==
                                                        undefined &&
                                                    flight.landingRateFpm !==
                                                        null ? (
                                                        <span
                                                            className={`font-semibold ${
                                                                Math.abs(
                                                                    flight.landingRateFpm,
                                                                ) <= 150
                                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                                    : Math.abs(
                                                                            flight.landingRateFpm,
                                                                        ) <= 300
                                                                      ? "text-amber-600 dark:text-amber-400"
                                                                      : "text-rose-600 dark:text-rose-400"
                                                            }`}
                                                        >
                                                            {Math.round(
                                                                flight.landingRateFpm,
                                                            )}{" "}
                                                            fpm
                                                        </span>
                                                    ) : (
                                                        <span className="text-neutral-400">
                                                            —
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Deleted Date */}
                                                <td className="py-3 px-3 align-middle text-[11px] text-neutral-500 font-mono">
                                                    {new Date(
                                                        flight.deletedAt,
                                                    ).toLocaleString([], {
                                                        month: "short",
                                                        day: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </td>

                                                {/* Retention Status Badge */}
                                                <td className="py-3 px-3 align-middle">
                                                    {retention.isExpiringSoon ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 animate-pulse">
                                                            <AlertCircle className="w-3 h-3 text-rose-500" />
                                                            <span>
                                                                Purging soon (
                                                                {
                                                                    retention.remainingHours
                                                                }
                                                                h)
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                                                            <Clock className="w-3 h-3 text-neutral-400" />
                                                            <span>
                                                                {
                                                                    retention.remainingDays
                                                                }{" "}
                                                                days left
                                                            </span>
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Actions */}
                                                <td className="py-3 px-3 pr-4 align-middle text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Restore Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                restoreFlightFromRecycleBin(
                                                                    flight.id,
                                                                )
                                                            }
                                                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-sm bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-black transition-colors shadow-2xs"
                                                            title="Restore flight to logbook"
                                                        >
                                                            <RotateCcw className="w-3 h-3" />
                                                            <span>Restore</span>
                                                        </button>

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
                    </div>

                    {/* Pagination */}
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
                    />
                </div>
            )}
        </div>
    );
};
