import React, { useState, useEffect, useMemo, useRef } from "react";
import { useFlightStore } from "../../store/flightStore";
import { Airport } from "../../types/flight";
import { SavedRoute, RouteSector, AircraftCategory } from "../../types/route";
import {
    AIRCRAFT_CATEGORIES,
    formatFlightLevelOrAltitude,
    formatDurationHoursMinutes,
} from "../../data/aircraftCategories";
import {
    resolveAirport,
    computeRouteSector,
} from "../../services/routeGenerator";
import {
    X,
    Plus,
    Trash2,
    Plane,
    AlertCircle,
    Check,
    Layers,
    Clock,
    Compass,
    Gauge,
    Mountain,
    ArrowRight,
    Sparkles,
    Save,
    Route as RouteIcon,
    RotateCcw,
} from "lucide-react";

interface LegState {
    id: string;
    depIcao: string;
    arrIcao: string;
    depAirport: Airport | null;
    arrAirport: Airport | null;
    isResolvingDep: boolean;
    isResolvingArr: boolean;
    depError?: string;
    arrError?: string;
}

export interface RouteEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    routeToEdit?: SavedRoute | null; // Null if creating manual route
    onSaved?: (route: SavedRoute) => void;
}

export const RouteEditModal: React.FC<RouteEditModalProps> = ({
    isOpen,
    onClose,
    routeToEdit,
    onSaved,
}) => {
    const { saveRoute } = useFlightStore();

    const isEditing = Boolean(routeToEdit);

    const [name, setName] = useState<string>("");
    const [category, setCategory] = useState<AircraftCategory>("A");
    const [aircraftName, setAircraftName] = useState<string>("");
    const [includeGroundTime, setIncludeGroundTime] = useState<boolean>(true);
    const [legs, setLegs] = useState<LegState[]>([]);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Initialize or re-populate when modal opens or routeToEdit changes
    useEffect(() => {
        if (!isOpen) return;

        if (routeToEdit) {
            setName(routeToEdit.name || "");
            setCategory(routeToEdit.aircraftCategory || "A");
            setAircraftName(routeToEdit.aircraftName || "");
            setIncludeGroundTime(routeToEdit.includeGroundTime ?? true);

            let existingSectors: RouteSector[] = [];
            try {
                existingSectors =
                    routeToEdit.sectors && routeToEdit.sectors.length > 0
                        ? routeToEdit.sectors
                        : JSON.parse(routeToEdit.sectorsJson || "[]");
            } catch {}

            if (existingSectors.length > 0) {
                setLegs(
                    existingSectors.map((s, idx) => ({
                        id: `leg-${idx}-${Date.now()}`,
                        depIcao: s.departure.icao,
                        arrIcao: s.arrival.icao,
                        depAirport: s.departure,
                        arrAirport: s.arrival,
                        isResolvingDep: false,
                        isResolvingArr: false,
                    })),
                );
            } else {
                // Fallback to single leg with departure and arrival
                const depIcao = routeToEdit.departureIcao || "";
                const arrIcao = routeToEdit.arrivalIcao || "";
                const initialLeg: LegState = {
                    id: `leg-0-${Date.now()}`,
                    depIcao,
                    arrIcao,
                    depAirport: null,
                    arrAirport: null,
                    isResolvingDep: Boolean(depIcao),
                    isResolvingArr: Boolean(arrIcao),
                };
                setLegs([initialLeg]);

                // Resolve airports asynchronously
                if (depIcao) {
                    resolveAirport(depIcao).then((apt) => {
                        setLegs((prev) =>
                            prev.map((l, i) =>
                                i === 0
                                    ? {
                                          ...l,
                                          depAirport: apt,
                                          isResolvingDep: false,
                                      }
                                    : l,
                            ),
                        );
                    });
                }
                if (arrIcao) {
                    resolveAirport(arrIcao).then((apt) => {
                        setLegs((prev) =>
                            prev.map((l, i) =>
                                i === 0
                                    ? {
                                          ...l,
                                          arrAirport: apt,
                                          isResolvingArr: false,
                                      }
                                    : l,
                            ),
                        );
                    });
                }
            }
        } else {
            // New manual route defaults
            setName("");
            setCategory("A");
            setAircraftName("");
            setIncludeGroundTime(true);
            setLegs([
                {
                    id: `leg-0-${Date.now()}`,
                    depIcao: "",
                    arrIcao: "",
                    depAirport: null,
                    arrAirport: null,
                    isResolvingDep: false,
                    isResolvingArr: false,
                },
            ]);
        }
        setErrorMessage(null);
    }, [isOpen, routeToEdit]);

    // Handle resolving departure airport
    const handleResolveDep = async (index: number, rawIcao: string) => {
        const clean = rawIcao.trim().toUpperCase();
        if (!clean) {
            setLegs((prev) =>
                prev.map((l, i) =>
                    i === index
                        ? { ...l, depAirport: null, depError: undefined }
                        : l,
                ),
            );
            return;
        }

        setLegs((prev) =>
            prev.map((l, i) =>
                i === index
                    ? { ...l, isResolvingDep: true, depError: undefined }
                    : l,
            ),
        );

        const apt = await resolveAirport(clean);
        setLegs((prev) =>
            prev.map((l, i) => {
                if (i !== index) return l;
                return {
                    ...l,
                    depAirport: apt,
                    isResolvingDep: false,
                    depError: apt
                        ? undefined
                        : `Airport '${clean}' not recognized in local DB`,
                };
            }),
        );
    };

    // Handle resolving arrival airport (and forward chaining to next leg's departure)
    const handleResolveArr = async (index: number, rawIcao: string) => {
        const clean = rawIcao.trim().toUpperCase();
        if (!clean) {
            setLegs((prev) =>
                prev.map((l, i) =>
                    i === index
                        ? { ...l, arrAirport: null, arrError: undefined }
                        : l,
                ),
            );
            return;
        }

        setLegs((prev) =>
            prev.map((l, i) =>
                i === index
                    ? { ...l, isResolvingArr: true, arrError: undefined }
                    : l,
            ),
        );

        const apt = await resolveAirport(clean);
        setLegs((prev) => {
            const next = [...prev];
            if (next[index]) {
                next[index] = {
                    ...next[index],
                    arrAirport: apt,
                    isResolvingArr: false,
                    arrError: apt
                        ? undefined
                        : `Airport '${clean}' not recognized in local DB`,
                };
            }
            // Auto-chain into next leg departure if it exists
            if (next[index + 1]) {
                next[index + 1] = {
                    ...next[index + 1],
                    depIcao: clean,
                    depAirport: apt,
                    depError: apt
                        ? undefined
                        : `Airport '${clean}' not recognized in local DB`,
                };
            }
            return next;
        });
    };

    const handleAddLeg = () => {
        if (legs.length >= 6) return;
        const lastLeg = legs[legs.length - 1];
        const newDepIcao = lastLeg ? lastLeg.arrIcao : "";
        const newDepAirport = lastLeg ? lastLeg.arrAirport : null;

        setLegs((prev) => [
            ...prev,
            {
                id: `leg-${prev.length}-${Date.now()}`,
                depIcao: newDepIcao,
                arrIcao: "",
                depAirport: newDepAirport,
                arrAirport: null,
                isResolvingDep: false,
                isResolvingArr: false,
            },
        ]);
    };

    const handleRemoveLeg = (index: number) => {
        if (legs.length <= 1) return;
        setLegs((prev) => {
            const filtered = prev.filter((_, i) => i !== index);
            // Re-link the leg after the removed one if necessary
            if (index > 0 && index < filtered.length) {
                const prevLeg = filtered[index - 1];
                filtered[index] = {
                    ...filtered[index],
                    depIcao: prevLeg.arrIcao,
                    depAirport: prevLeg.arrAirport,
                    depError: prevLeg.arrError,
                };
            }
            return filtered;
        });
    };

    // Live Recalculate computed sectors and total metrics
    const computedSectors = useMemo(() => {
        const sectors: RouteSector[] = [];
        legs.forEach((leg, idx) => {
            if (leg.depAirport && leg.arrAirport) {
                try {
                    const sec = computeRouteSector(
                        leg.depAirport,
                        leg.arrAirport,
                        category,
                        includeGroundTime,
                        idx + 1,
                    );
                    sectors.push(sec);
                } catch (err) {
                    console.warn(
                        "[RouteEditModal] Error computing sector:",
                        err,
                    );
                }
            }
        });
        return sectors;
    }, [legs, category, includeGroundTime]);

    const totals = useMemo(() => {
        let totalDist = 0;
        let totalAirborne = 0;
        let totalGround = 0;
        let totalDuration = 0;

        computedSectors.forEach((sec) => {
            totalDist += sec.distanceNm;
            totalAirborne += sec.airborneMinutes;
            totalGround += sec.groundMinutes;
            totalDuration += sec.totalMinutes;
        });

        return {
            distanceNm: Math.round(totalDist * 10) / 10,
            airborneMinutes: totalAirborne,
            groundMinutes: totalGround,
            durationMinutes: totalDuration,
            isFullyCalculated:
                computedSectors.length === legs.length && legs.length > 0,
        };
    }, [computedSectors, legs.length]);

    const handleSave = async () => {
        setErrorMessage(null);

        // Validation
        if (legs.length === 0) {
            setErrorMessage("A route must have at least one sector.");
            return;
        }

        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (!leg.depAirport) {
                setErrorMessage(
                    `Leg ${i + 1} departure '${leg.depIcao || "(blank)"}' is invalid or missing.`,
                );
                return;
            }
            if (!leg.arrAirport) {
                setErrorMessage(
                    `Leg ${i + 1} arrival '${leg.arrIcao || "(blank)"}' is invalid or missing.`,
                );
                return;
            }
            if (leg.depAirport.icao === leg.arrAirport.icao) {
                setErrorMessage(
                    `Leg ${i + 1} departure and arrival cannot be the same airport (${leg.depIcao}).`,
                );
                return;
            }
        }

        if (computedSectors.length !== legs.length) {
            setErrorMessage(
                "Some sectors could not be calculated. Please check all waypoints.",
            );
            return;
        }

        setIsSaving(true);
        try {
            const firstLeg = legs[0];
            const lastLeg = legs[legs.length - 1];
            const intermediateIcaos = legs
                .slice(0, -1)
                .map((l) => l.arrIcao.toUpperCase().trim());

            const defaultName = [
                firstLeg.depIcao,
                ...intermediateIcaos,
                lastLeg.arrIcao,
            ]
                .filter(Boolean)
                .join(" ➔ ");

            const effectiveName =
                name.trim() || routeToEdit?.name || defaultName;
            const effectiveAircraftName =
                aircraftName.trim() ||
                routeToEdit?.aircraftName ||
                AIRCRAFT_CATEGORIES[category]?.examples[0] ||
                `Cat ${category} Aircraft`;

            const routePayload: Partial<SavedRoute> & {
                departureIcao: string;
                arrivalIcao: string;
            } = {
                id: routeToEdit?.id,
                name: effectiveName,
                aircraftName: effectiveAircraftName,
                aircraftCategory: category,
                departureIcao: firstLeg.depIcao.toUpperCase().trim(),
                arrivalIcao: lastLeg.arrIcao.toUpperCase().trim(),
                intermediateIcaos: JSON.stringify(intermediateIcaos),
                sectorCount: computedSectors.length,
                sectors: computedSectors,
                sectorsJson: JSON.stringify(computedSectors),
                totalDistanceNm: totals.distanceNm,
                totalAirborneMinutes: totals.airborneMinutes,
                totalGroundMinutes: totals.groundMinutes,
                totalDurationMinutes: totals.durationMinutes,
                includeGroundTime,
                recommendedAltitudeFt:
                    computedSectors[0]?.cruiseAltitudeFt || null,
                status: routeToEdit?.status || "draft",
                isFavorite: routeToEdit?.isFavorite ?? false,
                createdAt: routeToEdit?.createdAt || new Date().toISOString(),
            };

            const saved = await saveRoute(routePayload);
            if (saved && onSaved) {
                onSaved(saved);
            }
            onClose();
        } catch (err: any) {
            console.error("[RouteEditModal] Failed to save route:", err);
            setErrorMessage(err?.message || "Failed to save flight route.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div
                className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-2xl overflow-hidden text-neutral-900 dark:text-neutral-100 font-sans"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-geist-hairline bg-neutral-50/70 dark:bg-[#161616]">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-sm bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
                            <RouteIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                                {isEditing
                                    ? "Edit Flight Plan (Draft)"
                                    : "Create Manual Route"}
                            </h2>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted">
                                {isEditing
                                    ? "Update flight legs, aircraft category, and recalculate physics metrics."
                                    : "Define custom departure, arrival, and multi-sector waypoints with live flight physics."}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        title="Close dialog"
                        aria-label="Close dialog"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Error Banner */}
                    {errorMessage && (
                        <div className="flex items-center gap-2.5 p-3 rounded-sm bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* General Route Details Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-sm bg-neutral-50 dark:bg-[#181818] border border-neutral-200/80 dark:border-geist-hairline">
                        {/* Route Name */}
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                Route / Flight Name{" "}
                                <span className="text-neutral-400 font-normal">
                                    (optional)
                                </span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Frankfurt to London City or Trans-Alpine Shuttle"
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                            />
                        </div>

                        {/* Aircraft Category */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                Aircraft Category
                            </label>
                            <select
                                value={category}
                                onChange={(e) =>
                                    setCategory(
                                        e.target.value as AircraftCategory,
                                    )
                                }
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                            >
                                {(
                                    [
                                        "A",
                                        "B",
                                        "C",
                                        "D",
                                        "E",
                                        "F",
                                    ] as AircraftCategory[]
                                ).map((cat) => {
                                    const prof = AIRCRAFT_CATEGORIES[cat];
                                    return (
                                        <option key={cat} value={cat}>
                                            Cat {cat} — {prof.name} (
                                            {prof.speedRange})
                                        </option>
                                    );
                                })}
                            </select>
                            <p className="text-[10px] text-neutral-500 dark:text-geist-muted">
                                TAS:{" "}
                                {
                                    AIRCRAFT_CATEGORIES[category]
                                        ?.cruiseSpeedTasKt
                                }{" "}
                                kt · Typical FL:{" "}
                                {formatFlightLevelOrAltitude(
                                    AIRCRAFT_CATEGORIES[category]
                                        ?.typicalCruiseAltFt || 0,
                                )}
                            </p>
                        </div>

                        {/* Aircraft Name */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                Airframe / Aircraft Model{" "}
                                <span className="text-neutral-400 font-normal">
                                    (optional)
                                </span>
                            </label>
                            <input
                                type="text"
                                value={aircraftName}
                                onChange={(e) =>
                                    setAircraftName(e.target.value)
                                }
                                placeholder={`e.g. ${AIRCRAFT_CATEGORIES[category]?.examples[0] || "C172"}`}
                                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                            />
                        </div>

                        {/* Include Ground Time Toggle */}
                        <div className="flex items-center justify-between sm:col-span-2 pt-1">
                            <div>
                                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                    Include Ground Turnaround & Taxi Time
                                </span>
                                <p className="text-[10px] text-neutral-500 dark:text-geist-muted">
                                    Adds{" "}
                                    {AIRCRAFT_CATEGORIES[category]
                                        ?.taxiOutMinutes +
                                        AIRCRAFT_CATEGORIES[category]
                                            ?.taxiInMinutes}{" "}
                                    min ground block per sector for realistic
                                    schedules.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setIncludeGroundTime(!includeGroundTime)
                                }
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    includeGroundTime
                                        ? "bg-neutral-900 dark:bg-white"
                                        : "bg-neutral-300 dark:bg-neutral-700"
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                                        includeGroundTime
                                            ? "translate-x-4"
                                            : "translate-x-0"
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Sector / Legs Editor */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                                    Flight Sectors ({legs.length}{" "}
                                    {legs.length === 1 ? "Leg" : "Legs"})
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={handleAddLeg}
                                disabled={legs.length >= 6}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Leg</span>
                            </button>
                        </div>

                        {/* Legs List */}
                        <div className="space-y-3">
                            {legs.map((leg, index) => {
                                const computedSec = computedSectors[index];

                                return (
                                    <div
                                        key={leg.id}
                                        className="p-3.5 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline space-y-3 shadow-2xs"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                                    Leg {index + 1}
                                                </span>
                                                {computedSec && (
                                                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-geist-muted">
                                                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                                            {
                                                                computedSec.distanceNm
                                                            }{" "}
                                                            NM
                                                        </span>
                                                        <span>·</span>
                                                        <span className="tabular-nums">
                                                            {
                                                                computedSec.initialBearingDeg
                                                            }
                                                            °
                                                        </span>
                                                        <span>·</span>
                                                        <span className="font-medium text-blue-600 dark:text-blue-400">
                                                            {formatFlightLevelOrAltitude(
                                                                computedSec.cruiseAltitudeFt,
                                                            )}
                                                        </span>
                                                        <span>·</span>
                                                        <span>
                                                            {formatDurationHoursMinutes(
                                                                computedSec.airborneMinutes,
                                                            )}{" "}
                                                            flt
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {legs.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemoveLeg(index)
                                                    }
                                                    className="p-1 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                                    title="Remove this leg"
                                                    aria-label="Remove this leg"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Inputs Row */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {/* Departure ICAO */}
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 flex items-center justify-between">
                                                    <span>Departure ICAO</span>
                                                    {index > 0 && (
                                                        <span className="text-[10px] text-neutral-400">
                                                            Linked to Leg{" "}
                                                            {index} arr
                                                        </span>
                                                    )}
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        maxLength={4}
                                                        value={leg.depIcao}
                                                        onChange={(e) => {
                                                            const val =
                                                                e.target.value.toUpperCase();
                                                            setLegs((prev) =>
                                                                prev.map(
                                                                    (l, i) =>
                                                                        i ===
                                                                        index
                                                                            ? {
                                                                                  ...l,
                                                                                  depIcao:
                                                                                      val,
                                                                              }
                                                                            : l,
                                                                ),
                                                            );
                                                            if (
                                                                val.length === 4
                                                            ) {
                                                                handleResolveDep(
                                                                    index,
                                                                    val,
                                                                );
                                                            }
                                                        }}
                                                        onBlur={(e) =>
                                                            handleResolveDep(
                                                                index,
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder="e.g. EDDG"
                                                        className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-neutral-50 dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                                                    />
                                                    {leg.depAirport && (
                                                        <Check className="absolute right-2.5 top-2 w-3.5 h-3.5 text-emerald-500" />
                                                    )}
                                                </div>
                                                {leg.depAirport ? (
                                                    <div className="text-[10px] text-neutral-500 dark:text-geist-muted truncate">
                                                        {leg.depAirport.name} (
                                                        {
                                                            leg.depAirport
                                                                .countryCode
                                                        }
                                                        ) · Elev:{" "}
                                                        {leg.depAirport
                                                            .elevationFt ??
                                                            0}{" "}
                                                        ft
                                                    </div>
                                                ) : leg.depError ? (
                                                    <div className="text-[10px] text-rose-500">
                                                        {leg.depError}
                                                    </div>
                                                ) : null}
                                            </div>

                                            {/* Arrival ICAO */}
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                                                    Arrival ICAO
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        maxLength={4}
                                                        value={leg.arrIcao}
                                                        onChange={(e) => {
                                                            const val =
                                                                e.target.value.toUpperCase();
                                                            setLegs((prev) =>
                                                                prev.map(
                                                                    (l, i) =>
                                                                        i ===
                                                                        index
                                                                            ? {
                                                                                  ...l,
                                                                                  arrIcao:
                                                                                      val,
                                                                              }
                                                                            : l,
                                                                ),
                                                            );
                                                            if (
                                                                val.length === 4
                                                            ) {
                                                                handleResolveArr(
                                                                    index,
                                                                    val,
                                                                );
                                                            }
                                                        }}
                                                        onBlur={(e) =>
                                                            handleResolveArr(
                                                                index,
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder="e.g. LFPO"
                                                        className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-neutral-50 dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                                                    />
                                                    {leg.arrAirport && (
                                                        <Check className="absolute right-2.5 top-2 w-3.5 h-3.5 text-emerald-500" />
                                                    )}
                                                </div>
                                                {leg.arrAirport ? (
                                                    <div className="text-[10px] text-neutral-500 dark:text-geist-muted truncate">
                                                        {leg.arrAirport.name} (
                                                        {
                                                            leg.arrAirport
                                                                .countryCode
                                                        }
                                                        ) · Elev:{" "}
                                                        {leg.arrAirport
                                                            .elevationFt ??
                                                            0}{" "}
                                                        ft
                                                    </div>
                                                ) : leg.arrError ? (
                                                    <div className="text-[10px] text-rose-500">
                                                        {leg.arrError}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* Mountainous Advisory Badge if present */}
                                        {computedSec?.isMountainous && (
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-[10px] text-amber-700 dark:text-amber-400">
                                                <Mountain className="w-3.5 h-3.5 shrink-0" />
                                                <span>
                                                    Mountainous corridor:
                                                    Cruising FL is clamped 2,000
                                                    ft above peak terrain (Peak:
                                                    ~
                                                    {computedSec.peakTerrainFt?.toLocaleString()}{" "}
                                                    ft).
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Route Summary Card */}
                    <div className="p-4 rounded-sm bg-blue-50/50 dark:bg-[#0d1522] border border-blue-200/80 dark:border-blue-900/40 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                                Calculated Route Summary
                            </span>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                {computedSectors.length} of {legs.length} legs
                                resolved
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                            <div>
                                <div className="text-[10px] text-neutral-500 dark:text-geist-muted">
                                    Total Distance
                                </div>
                                <div className="text-base font-bold text-neutral-900 dark:text-white tabular-nums">
                                    {totals.distanceNm} NM
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-neutral-500 dark:text-geist-muted">
                                    Airborne Duration
                                </div>
                                <div className="text-base font-bold text-neutral-900 dark:text-white tabular-nums">
                                    {formatDurationHoursMinutes(
                                        totals.airborneMinutes,
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-neutral-500 dark:text-geist-muted">
                                    Block Duration
                                </div>
                                <div className="text-base font-bold text-neutral-900 dark:text-white tabular-nums">
                                    {formatDurationHoursMinutes(
                                        totals.durationMinutes,
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-neutral-500 dark:text-geist-muted">
                                    Waypoints
                                </div>
                                <div className="text-xs font-mono font-medium text-neutral-900 dark:text-white truncate pt-1">
                                    {legs
                                        .map((l) => l.depIcao || "...")
                                        .concat(
                                            legs[legs.length - 1]?.arrIcao ||
                                                "...",
                                        )
                                        .filter(
                                            (v, i, a) =>
                                                i === 0 || v !== a[i - 1],
                                        )
                                        .join(" ➔ ")}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/70 dark:bg-[#161616]">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-xs font-medium rounded-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !totals.isFullyCalculated}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-sm bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-black transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-3.5 h-3.5" />
                        <span>
                            {isSaving
                                ? "Saving..."
                                : isEditing
                                  ? "Save Changes"
                                  : "Create Flight Route"}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};
