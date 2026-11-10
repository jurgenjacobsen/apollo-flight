import React, { useState, useRef, useEffect, useMemo } from "react";
import {
    useFlightStore,
    formatLogbookDuration,
    formatWeight,
} from "../../store/flightStore";
import {
    ExportFormat,
    FlightRecord,
    LogbookExportFormat,
} from "../../types/flight";
import { PaginationBar, ConfirmDeleteButton } from "../ui";
import {
    BookOpen,
    Search,
    Plane,
    Trash2,
    ChevronRight,
    ChevronDown,
    TrendingDown,
    Clock,
    Compass,
    Gauge,
    Wind,
    Layers,
    Calendar,
    Activity,
    Sliders,
    ArrowRight,
    Download,
    Check,
    Globe,
    Navigation,
    FileSpreadsheet,
    FileJson,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from "lucide-react";

export type LogbookSortField =
    | "route"
    | "aircraft"
    | "date"
    | "duration"
    | "distance"
    | "maxAlt"
    | "peakGs"
    | "touchdown"
    | "status";

export type LogbookSortDirection = "asc" | "desc";

interface ExportMenuState {
    flightId: string;
    departureIcao: string;
    arrivalIcao: string;
    aircraftType: string;
    date: string;
    x: number;
    y: number;
}

export const LogbookView: React.FC = () => {
    const {
        flights,
        setSelectedFlightId,
        setActiveView,
        deleteFlight,
        exportFlight,
        exportLogbook,
        loadFlightDetails,
        pageSize,
        setPageSize,
        weightUnit,
        recycleBin,
    } = useFlightStore();
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<LogbookSortField>("date");
    const [sortDirection, setSortDirection] =
        useState<LogbookSortDirection>("desc");
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [exportMenu, setExportMenu] = useState<ExportMenuState | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isLogbookExportOpen, setIsLogbookExportOpen] = useState(false);
    const [logbookExportSuccess, setLogbookExportSuccess] = useState<
        string | null
    >(null);
    const [exportScope, setExportScope] = useState<"all" | "filtered">("all");
    const menuRef = useRef<HTMLDivElement>(null);
    const logbookMenuRef = useRef<HTMLDivElement>(null);
    const attemptedHealingRef = useRef<Set<string>>(new Set());

    const getPrimaryDirection = (
        field: LogbookSortField,
    ): LogbookSortDirection => {
        return [
            "date",
            "duration",
            "distance",
            "maxAlt",
            "peakGs",
            "touchdown",
        ].includes(field)
            ? "desc"
            : "asc";
    };

    const handleSort = (field: LogbookSortField) => {
        if (sortField === field) {
            const primaryDir = getPrimaryDirection(field);
            if (sortDirection === primaryDir) {
                // 2nd click: switch to opposite direction
                setSortDirection(primaryDir === "asc" ? "desc" : "asc");
            } else {
                // 3rd click: resets to the normal state of sorting
                setSortField("date");
                setSortDirection("desc");
            }
        } else {
            // 1st click: set field and primary direction
            setSortField(field);
            setSortDirection(getPrimaryDirection(field));
        }
    };

    const renderSortIcon = (field: LogbookSortField) => {
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

    // Reset page when search term changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    useEffect(() => {
        // Auto-heal legacy flights with missing/0 distance
        flights.forEach((f) => {
            if (
                (!f.distanceFlownNm || f.distanceFlownNm <= 0) &&
                !attemptedHealingRef.current.has(f.id)
            ) {
                attemptedHealingRef.current.add(f.id);
                loadFlightDetails(f.id);
            }
        });
    }, [flights, loadFlightDetails]);

    const filteredFlights = flights.filter(
        (f) =>
            f.departureIcao.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.arrivalIcao.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.aircraftType.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const sortedFlights = useMemo(() => {
        const list = [...filteredFlights];
        list.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case "route": {
                    const routeA =
                        `${a.departureIcao}-${a.arrivalIcao}`.toLowerCase();
                    const routeB =
                        `${b.departureIcao}-${b.arrivalIcao}`.toLowerCase();
                    comparison = routeA.localeCompare(routeB);
                    break;
                }
                case "aircraft": {
                    comparison = (a.aircraftType || "").localeCompare(
                        b.aircraftType || "",
                    );
                    break;
                }
                case "date": {
                    const timeA = new Date(a.startTime).getTime() || 0;
                    const timeB = new Date(b.startTime).getTime() || 0;
                    comparison = timeA - timeB;
                    break;
                }
                case "duration": {
                    comparison =
                        (a.flightTimeSeconds || 0) - (b.flightTimeSeconds || 0);
                    break;
                }
                case "distance": {
                    comparison =
                        (a.distanceFlownNm || 0) - (b.distanceFlownNm || 0);
                    break;
                }
                case "maxAlt": {
                    comparison = (a.maxAltitude || 0) - (b.maxAltitude || 0);
                    break;
                }
                case "peakGs": {
                    comparison =
                        (a.maxGroundSpeed || 0) - (b.maxGroundSpeed || 0);
                    break;
                }
                case "touchdown": {
                    const getTd = (f: FlightRecord) => {
                        if (
                            f.touchdowns &&
                            f.touchdowns.length > 0 &&
                            f.touchdowns[0].verticalSpeedFpm !== undefined
                        ) {
                            return Math.abs(f.touchdowns[0].verticalSpeedFpm);
                        }
                        if (
                            f.landingRateFpm !== undefined &&
                            f.landingRateFpm !== null
                        ) {
                            return Math.abs(f.landingRateFpm);
                        }
                        return 9999;
                    };
                    comparison = getTd(a) - getTd(b);
                    break;
                }
                case "status": {
                    comparison = (a.status || "").localeCompare(b.status || "");
                    break;
                }
                default:
                    comparison = 0;
            }
            return sortDirection === "asc" ? comparison : -comparison;
        });
        return list;
    }, [filteredFlights, sortField, sortDirection]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredFlights.length / pageSize),
    );

    // Clamp current page if total pages drops below current page
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const paginatedFlights = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedFlights.slice(start, start + pageSize);
    }, [sortedFlights, currentPage, pageSize]);

    const totalTimeSeconds = flights.reduce(
        (acc, f) => acc + f.flightTimeSeconds,
        0,
    );
    const totalHours = (totalTimeSeconds / 3600).toFixed(1);
    const totalDistance = flights
        .reduce((acc, f) => acc + f.distanceFlownNm, 0)
        .toFixed(0);

    // Calculate average touchdown rate across all logged flights with recorded landing data
    const validTouchdownRates: number[] = [];
    flights.forEach((f) => {
        if (f.touchdowns && f.touchdowns.length > 0) {
            f.touchdowns.forEach((td) => {
                if (
                    td.verticalSpeedFpm !== undefined &&
                    td.verticalSpeedFpm !== null
                ) {
                    validTouchdownRates.push(td.verticalSpeedFpm);
                }
            });
        } else if (
            f.landingRateFpm !== undefined &&
            f.landingRateFpm !== null
        ) {
            validTouchdownRates.push(f.landingRateFpm);
        }
    });

    const avgTouchdownRate =
        validTouchdownRates.length > 0
            ? Math.round(
                  validTouchdownRates.reduce((acc, r) => acc + r, 0) /
                      validTouchdownRates.length,
              )
            : null;

    const handleOpenExportMenu = (
        e: React.MouseEvent,
        flight: FlightRecord,
    ) => {
        e.stopPropagation();
        if (exportMenu?.flightId === flight.id) {
            setExportMenu(null);
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const menuHeight = 250;
        const spaceBelow = window.innerHeight - rect.bottom;
        const top =
            spaceBelow < menuHeight
                ? Math.max(12, rect.top - menuHeight - 4)
                : rect.bottom + 4;
        const left = Math.max(
            12,
            Math.min(window.innerWidth - 272, rect.right - 256),
        );

        setExportMenu({
            flightId: flight.id,
            departureIcao: flight.departureIcao,
            arrivalIcao: flight.arrivalIcao,
            aircraftType: flight.aircraftType,
            date: new Date(flight.startTime).toLocaleDateString(),
            x: left,
            y: top,
        });
    };

    const handleRowContextMenu = (
        e: React.MouseEvent,
        flight: FlightRecord,
    ) => {
        e.preventDefault();
        const menuHeight = 250;
        const spaceBelow = window.innerHeight - e.clientY;
        const top =
            spaceBelow < menuHeight
                ? Math.max(12, e.clientY - menuHeight - 4)
                : e.clientY + 4;
        const left = Math.max(
            12,
            Math.min(window.innerWidth - 272, e.clientX - 10),
        );

        setExportMenu({
            flightId: flight.id,
            departureIcao: flight.departureIcao,
            arrivalIcao: flight.arrivalIcao,
            aircraftType: flight.aircraftType,
            date: new Date(flight.startTime).toLocaleDateString(),
            x: left,
            y: top,
        });
    };

    const handleExport = async (flightId: string, format: ExportFormat) => {
        setExportMenu(null);
        const result = await exportFlight(flightId, format);
        if (result) {
            setCopiedId(flightId);
            setTimeout(() => setCopiedId(null), 2500);
        }
    };

    const isFiltered =
        searchTerm.trim().length > 0 &&
        filteredFlights.length !== flights.length;

    const handleExportLogbookAction = async (format: LogbookExportFormat) => {
        const chosenFlights =
            isFiltered && exportScope === "filtered"
                ? filteredFlights
                : flights;
        setIsLogbookExportOpen(false);
        const result = await exportLogbook(format, chosenFlights);
        if (result) {
            setLogbookExportSuccess(`${format.toUpperCase()} Exported!`);
            setTimeout(() => setLogbookExportSuccess(null), 2500);
        }
    };

    useEffect(() => {
        if (!isLogbookExportOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                logbookMenuRef.current &&
                !logbookMenuRef.current.contains(e.target as Node)
            ) {
                setIsLogbookExportOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsLogbookExportOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isLogbookExportOpen]);

    useEffect(() => {
        if (!exportMenu) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setExportMenu(null);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setExportMenu(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [exportMenu]);

    return (
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                        <BookOpen className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                            Flight Operations Logbook
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Synchronized with embedded SQLite aerotrack.db
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                        <input
                            type="text"
                            placeholder="Filter ICAO, aircraft..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-8 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                        />
                    </div>

                    {/* Export Logbook Dropdown */}
                    <div className="relative shrink-0" ref={logbookMenuRef}>
                        <button
                            onClick={() =>
                                setIsLogbookExportOpen(!isLogbookExportOpen)
                            }
                            disabled={flights.length === 0}
                            title={
                                flights.length === 0
                                    ? "No flights to export"
                                    : "Export logbook flight records (CSV / JSON)"
                            }
                            className={`h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border transition-colors duration-150 select-none ${
                                flights.length === 0
                                    ? "opacity-50 cursor-not-allowed bg-neutral-100 dark:bg-[#181818] border-neutral-200 dark:border-geist-hairline text-neutral-400"
                                    : isLogbookExportOpen
                                      ? "bg-neutral-200 dark:bg-[#282828] text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-600"
                                      : "bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-geist-hairline shadow-xs"
                            }`}
                        >
                            {logbookExportSuccess ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                                <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            )}
                            <span>
                                {logbookExportSuccess || "Export Logbook"}
                            </span>
                            <ChevronDown
                                className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 ${
                                    isLogbookExportOpen
                                        ? "rotate-180 text-neutral-700 dark:text-neutral-200"
                                        : ""
                                }`}
                            />
                        </button>

                        {isLogbookExportOpen && (
                            <div className="absolute right-0 mt-1 z-50 w-72 bg-white dark:bg-[#161616] border border-neutral-200 dark:border-[#2a2a2a] rounded-sm shadow-xl py-1 text-left text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-100 select-none">
                                {/* Dropdown Header */}
                                <div className="px-3 py-2 border-b border-neutral-100 dark:border-[#222222]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                            Export Logbook
                                        </span>
                                        <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-[#202020] px-1.5 py-0.5 rounded">
                                            {isFiltered &&
                                            exportScope === "filtered"
                                                ? `${filteredFlights.length} of ${flights.length}`
                                                : `${flights.length} flights`}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                                        Flight summary details without raw
                                        telemetry.
                                    </p>

                                    {/* Scope filter switch if search is active */}
                                    {isFiltered && (
                                        <div className="mt-2 flex items-center p-0.5 bg-neutral-100 dark:bg-[#202020] rounded text-[11px]">
                                            <button
                                                onClick={() =>
                                                    setExportScope("filtered")
                                                }
                                                className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
                                                    exportScope === "filtered"
                                                        ? "bg-white dark:bg-[#2e2e2e] text-neutral-900 dark:text-white shadow-xs"
                                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                                }`}
                                            >
                                                Filtered (
                                                {filteredFlights.length})
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setExportScope("all")
                                                }
                                                className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
                                                    exportScope === "all"
                                                        ? "bg-white dark:bg-[#2e2e2e] text-neutral-900 dark:text-white shadow-xs"
                                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                                }`}
                                            >
                                                All ({flights.length})
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Export Format Options */}
                                <div className="p-1 space-y-0.5">
                                    {/* CSV */}
                                    <button
                                        onClick={() =>
                                            handleExportLogbookAction("csv")
                                        }
                                        className="w-full px-2.5 py-2 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                                    >
                                        <div className="p-1.5 rounded-sm bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 shrink-0">
                                            <FileSpreadsheet className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                                    CSV Spreadsheet
                                                </span>
                                                <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                                    .CSV
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                                Table for Excel, Google Sheets,
                                                Numbers
                                            </p>
                                        </div>
                                    </button>

                                    {/* JSON */}
                                    <button
                                        onClick={() =>
                                            handleExportLogbookAction("json")
                                        }
                                        className="w-full px-2.5 py-2 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                                    >
                                        <div className="p-1.5 rounded-sm bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                                            <FileJson className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                                    JSON Document
                                                </span>
                                                <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                                    .JSON
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                                Structured records for backup &
                                                analysis
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Recycle Bin Button */}
                    <button
                        type="button"
                        onClick={() => setActiveView("recycle-bin")}
                        title="Open Recycle Bin (deleted flights retained for 30 days)"
                        className="h-8 inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-700 dark:text-neutral-300 transition-colors shadow-xs shrink-0 select-none"
                    >
                        <Trash2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                        <span>Recycle Bin</span>
                        {recycleBin.length > 0 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 tabular-nums">
                                {recycleBin.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Summary Stat Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-600 dark:text-neutral-300">
                        <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                            Total Operations
                        </div>
                        <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {flights.length}
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-600 dark:text-neutral-300">
                        <Clock className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                            Block Time
                        </div>
                        <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {totalHours}{" "}
                            <span className="text-xs font-normal text-neutral-500 font-sans">
                                hrs
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-600 dark:text-neutral-300">
                        <Compass className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                            Total Distance
                        </div>
                        <div className="text-lg font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {totalDistance}{" "}
                            <span className="text-xs font-normal text-neutral-500 font-sans">
                                NM
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-600 dark:text-neutral-300">
                        <TrendingDown className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                            Avg Touchdown
                        </div>
                        <div
                            className={`text-lg font-semibold tabular-nums ${
                                avgTouchdownRate === null
                                    ? "text-neutral-500 dark:text-neutral-400"
                                    : Math.abs(avgTouchdownRate) < 180
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : Math.abs(avgTouchdownRate) < 320
                                        ? "text-amber-600 dark:text-amber-400"
                                        : "text-rose-600 dark:text-rose-400"
                            }`}
                        >
                            {avgTouchdownRate !== null ? (
                                <>
                                    {avgTouchdownRate > 0
                                        ? `-${avgTouchdownRate}`
                                        : avgTouchdownRate}{" "}
                                    <span className="text-xs font-normal text-neutral-500 font-sans">
                                        fpm
                                    </span>
                                </>
                            ) : (
                                <span className="text-sm font-normal text-neutral-400 dark:text-neutral-600">
                                    —
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Flight Logbook Table Container */}
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-100/70 dark:bg-[#0e0e0e] border-b border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-400 select-none">
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("route")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Plane className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Route</span>
                                        {renderSortIcon("route")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("aircraft")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Layers className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Aircraft</span>
                                        {renderSortIcon("aircraft")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("date")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Calendar className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Date & Time</span>
                                        {renderSortIcon("date")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("duration")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Clock className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Duration</span>
                                        {renderSortIcon("duration")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("distance")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Compass className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Distance</span>
                                        {renderSortIcon("distance")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("maxAlt")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Gauge className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Max Alt</span>
                                        {renderSortIcon("maxAlt")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("peakGs")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Wind className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Peak GS</span>
                                        {renderSortIcon("peakGs")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("touchdown")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <TrendingDown className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Touchdown</span>
                                        {renderSortIcon("touchdown")}
                                    </button>
                                </th>
                                <th className="py-2.5 px-4 font-medium">
                                    <button
                                        type="button"
                                        onClick={() => handleSort("status")}
                                        className="group/sort inline-flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                                    >
                                        <Activity className="w-3.5 h-3.5 text-neutral-400 group-hover/sort:text-neutral-600 dark:group-hover/sort:text-neutral-300" />
                                        <span>Status</span>
                                        {renderSortIcon("status")}
                                    </button>
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
                            {paginatedFlights.map((flight) => {
                                const durationMins = Math.round(
                                    flight.flightTimeSeconds / 60,
                                );
                                const flightDate = new Date(
                                    flight.startTime,
                                ).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                });
                                const flightTime = new Date(
                                    flight.startTime,
                                ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                });

                                return (
                                    <tr
                                        key={flight.id}
                                        onContextMenu={(e) =>
                                            handleRowContextMenu(e, flight)
                                        }
                                        className="hover:bg-neutral-50/80 dark:hover:bg-[#121212] transition-colors duration-150 group"
                                    >
                                        {/* Route */}
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-white">
                                                <span>
                                                    {flight.departureIcao}
                                                </span>
                                                <ArrowRight className="w-3 h-3 text-neutral-400" />
                                                <span>
                                                    {flight.arrivalIcao}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Aircraft Type */}
                                        <td
                                            className="py-3 px-4 text-neutral-700 dark:text-neutral-300 max-w-[190px] truncate"
                                            title={`${flight.aircraftType}${flight.totalWeight || flight.grossWeight ? ` · Gross Weight: ${formatWeight(flight.totalWeight || flight.grossWeight, weightUnit)}` : ""}`}
                                        >
                                            <div className="font-medium text-neutral-900 dark:text-white truncate">
                                                {flight.aircraftType}
                                            </div>
                                            {flight.totalWeight ||
                                            flight.grossWeight ? (
                                                <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono tracking-tight">
                                                    {formatWeight(
                                                        flight.totalWeight ||
                                                            flight.grossWeight,
                                                        weightUnit,
                                                    )}
                                                </div>
                                            ) : null}
                                        </td>

                                        {/* Date */}
                                        <td className="py-3 px-4 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                                            <span>{flightDate}</span>
                                            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 ml-1.5">
                                                ({flightTime})
                                            </span>
                                        </td>

                                        {/* Duration */}
                                        <td className="py-3 px-4 tabular-nums text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                                            {formatLogbookDuration(
                                                flight.flightTimeSeconds,
                                            )}
                                        </td>

                                        {/* Distance */}
                                        <td className="py-3 px-4 tabular-nums text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                                            {flight.distanceFlownNm.toFixed(1)}{" "}
                                            NM
                                        </td>

                                        {/* Max Altitude */}
                                        <td className="py-3 px-4 tabular-nums text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                                            {flight.maxAltitude.toLocaleString()}{" "}
                                            ft
                                        </td>

                                        {/* Peak GS */}
                                        <td className="py-3 px-4 tabular-nums text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                                            {flight.maxGroundSpeed} kt
                                        </td>

                                        {/* Landing Rate */}
                                        <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                                            {flight.landingRateFpm ? (
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

                                        {/* Status */}
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <span className="inline-block text-[11px] px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#181818] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
                                                {flight.status}
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3 px-4 text-right whitespace-nowrap relative">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Custom Export Dropdown Trigger */}
                                                <button
                                                    onClick={(e) =>
                                                        handleOpenExportMenu(
                                                            e,
                                                            flight,
                                                        )
                                                    }
                                                    title="Export flight (GPX, KML, GeoJSON, CSV)"
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm border transition-colors duration-150 ${
                                                        exportMenu?.flightId ===
                                                        flight.id
                                                            ? "bg-neutral-200 dark:bg-[#282828] text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-600"
                                                            : "bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1a1a1a] dark:hover:bg-[#262626] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline"
                                                    }`}
                                                >
                                                    {copiedId === flight.id ? (
                                                        <Check className="w-3 h-3 text-emerald-500" />
                                                    ) : (
                                                        <Download className="w-3 h-3 text-neutral-400" />
                                                    )}
                                                    <span>
                                                        {copiedId === flight.id
                                                            ? "Exported"
                                                            : "Export"}
                                                    </span>
                                                    <ChevronDown
                                                        className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${
                                                            exportMenu?.flightId ===
                                                            flight.id
                                                                ? "rotate-180 text-neutral-700 dark:text-neutral-200"
                                                                : ""
                                                        }`}
                                                    />
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        setSelectedFlightId(
                                                            flight.id,
                                                        );
                                                        setActiveView(
                                                            "flight-detail",
                                                        );
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1a1a1a] dark:hover:bg-[#262626] text-neutral-800 dark:text-white border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                                >
                                                    <span>Analyze</span>
                                                    <ChevronRight className="w-3 h-3 text-neutral-400" />
                                                </button>

                                                {/* Expanding Delete Confirmation Button */}
                                                <ConfirmDeleteButton
                                                    onConfirm={() =>
                                                        deleteFlight(flight.id)
                                                    }
                                                    title="Delete flight log"
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
                {filteredFlights.length > 0 && (
                    <PaginationBar
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredFlights.length}
                        pageSize={pageSize}
                        onPageChange={(p) => setCurrentPage(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setCurrentPage(1);
                        }}
                        itemName="flights"
                    />
                )}

                {filteredFlights.length === 0 && (
                    <div className="text-center py-16 text-neutral-400 dark:text-neutral-500 text-xs">
                        {searchTerm ? (
                            <span>
                                No flight records found matching "{searchTerm}"
                            </span>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-1.5">
                                <Plane className="w-6 h-6 text-neutral-300 dark:text-neutral-700 mb-1" />
                                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                                    No recorded flights yet
                                </span>
                                <span className="text-[11px] text-neutral-400 dark:text-neutral-600">
                                    Flights are logged automatically from MSFS
                                    via FSUIPC7 upon takeoff & landing rollout.
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Custom Context Menu / Dropdown for Flight Export */}
            {exportMenu && (
                <div
                    ref={menuRef}
                    style={{
                        top: `${exportMenu.y}px`,
                        left: `${exportMenu.x}px`,
                    }}
                    className="fixed z-50 w-64 bg-white dark:bg-[#161616] border border-neutral-200 dark:border-[#2a2a2a] rounded-sm shadow-xl py-1 text-left text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-100 select-none"
                >
                    <div className="px-3 py-1.5 border-b border-neutral-100 dark:border-[#222222] mb-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                            Export Flight Data
                        </div>
                        <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate mt-0.5 flex items-center justify-between">
                            <span>
                                {exportMenu.departureIcao} ➔{" "}
                                {exportMenu.arrivalIcao}
                            </span>
                            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                                {exportMenu.date}
                            </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                            {exportMenu.aircraftType}
                        </div>
                    </div>

                    <div className="space-y-0.5 px-1">
                        <button
                            onClick={() =>
                                handleExport(exportMenu.flightId, "gpx")
                            }
                            className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                        >
                            <div className="p-1 rounded-sm bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 shrink-0">
                                <Navigation className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                        GPS Track
                                    </span>
                                    <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                        .GPX
                                    </span>
                                </div>
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                    Universal GPS waypoint trajectory
                                </p>
                            </div>
                        </button>

                        <button
                            onClick={() =>
                                handleExport(exportMenu.flightId, "kml")
                            }
                            className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                        >
                            <div className="p-1 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                                <Globe className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                        Google Earth
                                    </span>
                                    <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                        .KML
                                    </span>
                                </div>
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                    3D globe ribbon & aerial camera tour
                                </p>
                            </div>
                        </button>

                        <button
                            onClick={() =>
                                handleExport(exportMenu.flightId, "geojson")
                            }
                            className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                        >
                            <div className="p-1 rounded-sm bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                                <Layers className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                        GeoJSON Feature
                                    </span>
                                    <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                        .GeoJSON
                                    </span>
                                </div>
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                    GIS vector geometry & telemetry metadata
                                </p>
                            </div>
                        </button>

                        <button
                            onClick={() =>
                                handleExport(exportMenu.flightId, "csv")
                            }
                            className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                        >
                            <div className="p-1 rounded-sm bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 shrink-0">
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                        CSV Spreadsheet
                                    </span>
                                    <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                        .CSV
                                    </span>
                                </div>
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                    Raw tabular points (alt, GS, VS, heading)
                                </p>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
