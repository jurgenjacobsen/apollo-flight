import React, { useMemo, useState, useEffect, useRef } from "react";
import {
    useFlightStore,
    safeInvoke,
    convertWeight,
} from "../../store/flightStore";
import {
    formatVisibility,
    formatWindSpeed,
    formatWindVector,
    formatTemperature,
} from "../../utils/weatherUnits";
import {
    ExportFormat,
    TouchdownEvent,
    Airport,
    TelemetryPoint,
} from "../../types/flight";
import { FALLBACK_AIRPORTS } from "../../data/fallbackAirports";
import { calculateDistanceNm } from "../../data/mockData";
import { Select } from "../ui/Select";
import { ConfirmDeleteButton } from "../ui/ConfirmDeleteButton";
import L from "leaflet";
import {
    ArrowLeft,
    Clock,
    Compass,
    TrendingDown,
    Gauge,
    Wind,
    Download,
    Check,
    Layers,
    Globe,
    FileSpreadsheet,
    ChevronDown,
    Loader2,
    Plane,
    Scale,
    Navigation,
} from "lucide-react";
import { calculateTouchdownGForce } from "../../utils/touchdownPhysics";
import { DebriefMap, getAltitudeColor } from "../flight-detail/DebriefMap";
import { TelemetryChart, DragSelectionState } from "../flight-detail/TelemetryChart";
import { AtmosphericCards } from "../flight-detail/AtmosphericCards";
import { TouchdownCard } from "../flight-detail/TouchdownCard";

export const FlightDetailView: React.FC = () => {
    const {
        flights,
        selectedFlightId,
        setSelectedFlightId,
        setActiveView,
        deleteFlight,
        scrubbedTelemetryIndex,
        setScrubbedTelemetryIndex,
        exportFlight,
        theme,
        weightUnit,
        visibilityUnit,
        windSpeedUnit,
        temperatureUnit,
        loadFlightDetails,
        isLoadingFlightDetails,
    } = useFlightStore();

    const [showExportMenu, setShowExportMenu] = useState(false);
    const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const [isHeavyReady, setIsHeavyReady] = useState(false);

    useEffect(() => {
        setIsHeavyReady(false);
        // Immediate frame paint for layout, selectors & cards; defer heavy Leaflet & Recharts mount by 40ms
        const timer = setTimeout(() => {
            setIsHeavyReady(true);
        }, 40);
        return () => clearTimeout(timer);
    }, [selectedFlightId]);

    useEffect(() => {
        if (!showExportMenu) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                exportMenuRef.current &&
                !exportMenuRef.current.contains(e.target as Node)
            ) {
                setShowExportMenu(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setShowExportMenu(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [showExportMenu]);

    const flight = useMemo(() => {
        return flights.find((f) => f.id === selectedFlightId) || flights[0];
    }, [flights, selectedFlightId]);

    const targetFlightId = flight?.id || selectedFlightId;
    const hasTelemetryPoints =
        (flight?.telemetryPoints && flight.telemetryPoints.length > 0) || false;
    const attemptedLoadsRef = useRef<Set<string>>(new Set());

    // Automatically fetch full telemetry trajectory dataset from SQLite if not loaded yet, or auto-heal distance if 0
    useEffect(() => {
        if (targetFlightId && !attemptedLoadsRef.current.has(targetFlightId)) {
            if (
                !hasTelemetryPoints ||
                !flight?.distanceFlownNm ||
                flight.distanceFlownNm <= 0
            ) {
                attemptedLoadsRef.current.add(targetFlightId);
                loadFlightDetails(targetFlightId);
            }
        }
    }, [
        targetFlightId,
        hasTelemetryPoints,
        flight?.distanceFlownNm,
        loadFlightDetails,
    ]);

    const points = flight?.telemetryPoints || [];

    // Zoom range for the telemetry profile chart (timestamps in epoch ms)
    const [zoomTimeRange, setZoomTimeRange] = useState<{
        start: number;
        end: number;
    } | null>(null);
    const [dragSelection, setDragSelection] = useState<{
        startX: number;
        currentX: number;
        startIndex: number;
        currentIndex: number;
    } | null>(null);

    // Reset zoom whenever flight changes
    useEffect(() => {
        setZoomTimeRange(null);
        setDragSelection(null);
    }, [flight?.id]);

    // Points filtered by active zoom range (if user dragged to zoom into a timestamp range)
    const chartPoints = useMemo(() => {
        if (!zoomTimeRange) {
            return points.map((p, idx) => ({ ...p, originalIndex: idx }));
        }
        const filtered: Array<TelemetryPoint & { originalIndex: number }> = [];
        for (let idx = 0; idx < points.length; idx++) {
            const p = points[idx];
            const t = new Date(p.timestamp).getTime();
            if (t >= zoomTimeRange.start && t <= zoomTimeRange.end) {
                filtered.push({ ...p, originalIndex: idx });
            }
        }
        return filtered.length >= 2
            ? filtered
            : points.map((p, idx) => ({ ...p, originalIndex: idx }));
    }, [points, zoomTimeRange]);

    // Downsample chart data points if length is large for silky smooth Recharts Area SVG rendering
    const chartData = useMemo(() => {
        if (chartPoints.length <= 1200) {
            return chartPoints.map((p, idx) => ({
                index: idx,
                time: new Date(p.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                }),
                rawTimestamp: new Date(p.timestamp).getTime(),
                altitude: p.altitudeMsl,
                groundSpeed: p.groundSpeed,
                ias: p.indicatedAirspeed,
                lat: p.latitude,
                lon: p.longitude,
                heading: p.heading,
                vs: p.verticalSpeed ?? 0,
                windSpeed: p.windSpeed,
                windDirection: p.windDirection,
                oat: p.oat,
                tat: p.tat,
                visibility: p.visibility,
                pointIndex: p.originalIndex,
            }));
        }
        const stride = Math.ceil(chartPoints.length / 1000);
        const sampled: Array<{
            index: number;
            time: string;
            rawTimestamp: number;
            altitude: number;
            groundSpeed: number;
            ias: number;
            lat: number;
            lon: number;
            heading: number;
            vs: number;
            windSpeed?: number;
            windDirection?: number;
            oat?: number;
            tat?: number;
            visibility?: number;
            pointIndex: number;
        }> = [];

        for (let i = 0; i < chartPoints.length; i += stride) {
            const p = chartPoints[i];
            sampled.push({
                index: sampled.length,
                time: new Date(p.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                }),
                rawTimestamp: new Date(p.timestamp).getTime(),
                altitude: p.altitudeMsl,
                groundSpeed: p.groundSpeed,
                ias: p.indicatedAirspeed,
                lat: p.latitude,
                lon: p.longitude,
                heading: p.heading,
                vs: p.verticalSpeed ?? 0,
                windSpeed: p.windSpeed,
                windDirection: p.windDirection,
                oat: p.oat,
                tat: p.tat,
                visibility: p.visibility,
                pointIndex: p.originalIndex,
            });
        }
        const lastIdx = chartPoints.length - 1;
        const lastPt = chartPoints[lastIdx];
        if (sampled[sampled.length - 1]?.pointIndex !== lastPt.originalIndex) {
            sampled.push({
                index: sampled.length,
                time: new Date(lastPt.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                }),
                rawTimestamp: new Date(lastPt.timestamp).getTime(),
                altitude: lastPt.altitudeMsl,
                groundSpeed: lastPt.groundSpeed,
                ias: lastPt.indicatedAirspeed,
                lat: lastPt.latitude,
                lon: lastPt.longitude,
                heading: lastPt.heading,
                vs: lastPt.verticalSpeed ?? 0,
                windSpeed: lastPt.windSpeed,
                windDirection: lastPt.windDirection,
                oat: lastPt.oat,
                tat: lastPt.tat,
                visibility: lastPt.visibility,
                pointIndex: lastPt.originalIndex,
            });
        }
        return sampled;
    }, [chartPoints]);

    // Keep ref to latest dragSelection and chartData for window-level mouseup handler
    const dragSelectionRef = useRef(dragSelection);
    const chartDataRef = useRef(chartData);
    useEffect(() => {
        dragSelectionRef.current = dragSelection;
        chartDataRef.current = chartData;
    }, [dragSelection, chartData]);

    // Window-level mouseup listener so dragging and releasing anywhere updates the zoom strictly on mouse release
    useEffect(() => {
        if (!dragSelection) return;

        const handleWindowMouseUp = () => {
            const sel = dragSelectionRef.current;
            const data = chartDataRef.current;
            if (sel && Math.abs(sel.currentX - sel.startX) > 5) {
                const minIdx = Math.min(sel.startIndex, sel.currentIndex);
                const maxIdx = Math.max(sel.startIndex, sel.currentIndex);
                if (maxIdx - minIdx >= 1 && data[minIdx] && data[maxIdx]) {
                    const start = data[minIdx].rawTimestamp;
                    const end = data[maxIdx].rawTimestamp;
                    if (start < end) {
                        setZoomTimeRange({ start, end });
                    }
                }
            }
            setDragSelection(null);
        };

        window.addEventListener("mouseup", handleWindowMouseUp);
        return () => {
            window.removeEventListener("mouseup", handleWindowMouseUp);
        };
    }, [Boolean(dragSelection)]);

    // Downsample points if trajectory has thousands of samples to keep Leaflet polyline node count smooth & responsive
    const mapPoints = useMemo(() => {
        if (points.length <= 800) return points;
        const stride = Math.ceil(points.length / 800);
        const sampled: typeof points = [];
        for (let i = 0; i < points.length; i += stride) {
            sampled.push(points[i]);
        }
        if (sampled[sampled.length - 1] !== points[points.length - 1]) {
            sampled.push(points[points.length - 1]);
        }
        return sampled;
    }, [points]);

    const coordinates: [number, number][] = useMemo(() => {
        return mapPoints.map((p) => [p.latitude, p.longitude]);
    }, [mapPoints]);

    const bounds = useMemo(() => {
        if (coordinates.length === 0) return null;
        return L.latLngBounds(coordinates);
    }, [coordinates]);

    // Compute Altitude Gradient Track Segments (0 ft: Green -> 45,000+ ft: Red)
    const altitudeSegments = useMemo(() => {
        if (mapPoints.length < 2) return [];

        const segments: {
            positions: [number, number][];
            color: string;
            altitude: number;
        }[] = [];

        // Quantize altitude to 250 ft steps for a smooth color transition and optimal rendering performance
        const getPointColor = (alt: number) =>
            getAltitudeColor(Math.round(alt / 250) * 250);

        let currentPositions: [number, number][] = [
            [mapPoints[0].latitude, mapPoints[0].longitude],
        ];
        let currentColor = getPointColor(mapPoints[0].altitudeMsl);
        let currentAlt = mapPoints[0].altitudeMsl;

        for (let i = 1; i < mapPoints.length; i++) {
            const pt = mapPoints[i];
            const ptColor = getPointColor(pt.altitudeMsl);

            if (ptColor !== currentColor) {
                // Complete the current segment up to this junction point to ensure seamless polyline connection
                currentPositions.push([pt.latitude, pt.longitude]);
                segments.push({
                    positions: currentPositions,
                    color: currentColor,
                    altitude: currentAlt,
                });

                // Start next segment from junction point to avoid any gap
                currentPositions = [[pt.latitude, pt.longitude]];
                currentColor = ptColor;
                currentAlt = pt.altitudeMsl;
            } else {
                currentPositions.push([pt.latitude, pt.longitude]);
            }
        }

        if (currentPositions.length > 1) {
            segments.push({
                positions: currentPositions,
                color: currentColor,
                altitude: currentAlt,
            });
        }

        return segments;
    }, [mapPoints]);

    // Calculate Top of Climb (TOC) and Top of Descent (TOD)
    const { tocPoint, todPoint } = useMemo(() => {
        if (points.length < 5) return { tocPoint: null, todPoint: null };
        const maxAlt = Math.max(...points.map((p) => p.altitudeMsl));
        if (maxAlt < 1000) return { tocPoint: null, todPoint: null };

        const threshold = maxAlt * 0.95;
        const toc = points.find((p) => p.altitudeMsl >= threshold);

        let tod = null;
        for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].altitudeMsl >= threshold) {
                tod = points[i];
                break;
            }
        }

        return {
            tocPoint: toc || null,
            todPoint: tod && tod !== toc ? tod : null,
        };
    }, [points]);

    // Extract and calculate all touchdowns (supports multiple landings, touch-and-goes, and historical flights)
    const touchdowns: TouchdownEvent[] = useMemo(() => {
        if (!flight) return [];
        if (flight.touchdowns && flight.touchdowns.length > 0) {
            return flight.touchdowns;
        }
        // Scan telemetry points for air-to-ground transitions
        if (points.length > 1) {
            const detected: TouchdownEvent[] = [];
            let wasInAir = false;
            let inAirTicks = 0;

            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];

                if (!prev.isOnGround) {
                    wasInAir = true;
                    inAirTicks++;
                }

                if (
                    wasInAir &&
                    inAirTicks >= 2 &&
                    !prev.isOnGround &&
                    curr.isOnGround
                ) {
                    const vs =
                        curr.verticalSpeed !== undefined &&
                        curr.verticalSpeed < 0
                            ? curr.verticalSpeed
                            : prev.verticalSpeed !== undefined &&
                                prev.verticalSpeed < 0
                              ? prev.verticalSpeed
                              : -140;

                    detected.push({
                        timestamp: curr.timestamp,
                        verticalSpeedFpm: Math.round(vs),
                        groundSpeedKt: Math.round(curr.groundSpeed),
                        pitchDeg:
                            curr.pitch !== undefined
                                ? Number(curr.pitch.toFixed(1))
                                : undefined,
                        bankDeg:
                            curr.bank !== undefined
                                ? Number(curr.bank.toFixed(1))
                                : undefined,
                        latitude: curr.latitude,
                        longitude: curr.longitude,
                        altitudeMsl: Math.round(curr.altitudeMsl),
                        gForce: calculateTouchdownGForce(vs),
                    });

                    wasInAir = false;
                    inAirTicks = 0;
                }
            }
            if (detected.length > 0) return detected;
        }

        if (flight.landingRateFpm) {
            const lastPt = points[points.length - 1];
            return [
                {
                    timestamp: flight.endTime || flight.startTime,
                    verticalSpeedFpm: Math.round(flight.landingRateFpm),
                    latitude: lastPt?.latitude || 0,
                    longitude: lastPt?.longitude || 0,
                    groundSpeedKt: lastPt
                        ? Math.round(lastPt.groundSpeed)
                        : undefined,
                    gForce: calculateTouchdownGForce(flight.landingRateFpm),
                },
            ];
        }

        return [];
    }, [flight, points]);

    // Flight touchdown rate: average of all touchdowns
    const avgTouchdownRate = useMemo(() => {
        if (touchdowns.length > 0) {
            const sum = touchdowns.reduce(
                (acc, t) => acc + t.verticalSpeedFpm,
                0,
            );
            return Math.round(sum / touchdowns.length);
        }
        return flight?.landingRateFpm
            ? Math.round(flight.landingRateFpm)
            : null;
    }, [touchdowns, flight?.landingRateFpm]);

    const weightInfo = useMemo(() => {
        return convertWeight(
            flight?.totalWeight || flight?.grossWeight,
            weightUnit,
        );
    }, [flight?.totalWeight, flight?.grossWeight, weightUnit]);

    // Resolve airport metadata for each recorded touchdown
    const [resolvedTouchdownAirports, setResolvedTouchdownAirports] = useState<
        Record<number, { icao: string; name?: string }>
    >({});

    useEffect(() => {
        if (!touchdowns || touchdowns.length === 0) {
            setResolvedTouchdownAirports({});
            return;
        }

        let isCancelled = false;

        const resolveAll = async () => {
            const airportMap: Record<number, { icao: string; name?: string }> =
                {};

            for (let i = 0; i < touchdowns.length; i++) {
                const td = touchdowns[i];
                if (td.airportIcao) {
                    airportMap[i] = {
                        icao: td.airportIcao,
                        name: td.airportName,
                    };
                    continue;
                }

                // Try searching database for nearest airport within 5 NM of touchdown coordinates
                if (td.latitude && td.longitude) {
                    try {
                        const near = await safeInvoke<Airport>(
                            "search_airports_near",
                            {
                                lat: td.latitude,
                                lon: td.longitude,
                                radiusNm: 5.0,
                            },
                        );
                        if (near && near.icao) {
                            airportMap[i] = {
                                icao: near.icao,
                                name: near.name,
                            };
                            continue;
                        }
                    } catch {}

                    // Fallback to FALLBACK_AIRPORTS from fallbackAirports
                    const fallback = FALLBACK_AIRPORTS.find((a: Airport) => {
                        const d = calculateDistanceNm(
                            td.latitude,
                            td.longitude,
                            a.latitude,
                            a.longitude,
                        );
                        return d <= 5.0;
                    });
                    if (fallback) {
                        airportMap[i] = {
                            icao: fallback.icao,
                            name: fallback.name,
                        };
                        continue;
                    }
                }

                // If it's the last touchdown and close to arrival, or only 1 touchdown
                if (i === touchdowns.length - 1 && flight?.arrivalIcao) {
                    airportMap[i] = { icao: flight.arrivalIcao };
                }
            }

            if (!isCancelled) {
                setResolvedTouchdownAirports(airportMap);
            }
        };

        resolveAll();

        return () => {
            isCancelled = true;
        };
    }, [touchdowns, flight?.arrivalIcao]);

    // Atmospheric and Environmental Totals (Phase 12)
    const weatherStats = useMemo(() => {
        let minOat = flight?.minOat;
        let maxOat = flight?.maxOat;
        let minVis = flight?.minVisibility;
        let avgCruiseWindSpd = flight?.avgCruiseWindSpeed;
        let avgCruiseWindDir = flight?.avgCruiseWindDirection;
        let maxWindSpd = flight?.maxWindSpeed;
        let maxWindDir = flight?.maxWindDirection;

        // Fallback: derive from recorded telemetry points if not pre-calculated on flight record
        if (
            (minOat === undefined ||
                maxWindSpd === undefined ||
                avgCruiseWindSpd === undefined) &&
            points.length > 0
        ) {
            let sumU = 0;
            let sumV = 0;
            let cruisePts = 0;

            for (const p of points) {
                if (p.oat !== undefined) {
                    minOat =
                        minOat !== undefined ? Math.min(minOat, p.oat) : p.oat;
                    maxOat =
                        maxOat !== undefined ? Math.max(maxOat, p.oat) : p.oat;
                }
                if (p.visibility !== undefined) {
                    minVis =
                        minVis !== undefined
                            ? Math.min(minVis, p.visibility)
                            : p.visibility;
                }
                if (p.windSpeed !== undefined) {
                    if (maxWindSpd === undefined || p.windSpeed > maxWindSpd) {
                        maxWindSpd = p.windSpeed;
                        maxWindDir = p.windDirection;
                    }
                    if (
                        !p.isOnGround &&
                        p.altitudeMsl > 2500 &&
                        Math.abs(p.verticalSpeed ?? 0) <= 200 &&
                        p.windDirection !== undefined
                    ) {
                        const rad = (p.windDirection * Math.PI) / 180;
                        sumU += p.windSpeed * Math.sin(rad);
                        sumV += p.windSpeed * Math.cos(rad);
                        cruisePts++;
                    }
                }
            }

            if (cruisePts > 0) {
                avgCruiseWindSpd = Math.round(
                    Math.hypot(sumU / cruisePts, sumV / cruisePts),
                );
                avgCruiseWindDir = Math.round(
                    ((Math.atan2(sumU / cruisePts, sumV / cruisePts) * 180) /
                        Math.PI +
                        360) %
                        360,
                );
            }
        }

        const hasWeather =
            minOat !== undefined ||
            maxOat !== undefined ||
            minVis !== undefined ||
            avgCruiseWindSpd !== undefined ||
            maxWindSpd !== undefined;

        return {
            hasWeather,
            minOat,
            maxOat,
            minVis,
            avgCruiseWindSpd,
            avgCruiseWindDir,
            maxWindSpd,
            maxWindDir,
        };
    }, [flight, points]);

    const activeScrubPoint = useMemo(() => {
        if (scrubbedTelemetryIndex !== null && points[scrubbedTelemetryIndex]) {
            return points[scrubbedTelemetryIndex];
        }
        return points[points.length - 1] || null;
    }, [points, scrubbedTelemetryIndex]);

    const handleExport = async (format: ExportFormat) => {
        if (!flight) return;
        setShowExportMenu(false);
        const result = await exportFlight(flight.id, format);
        if (result) {
            setCopiedFormat(format);
            setTimeout(() => setCopiedFormat(null), 2000);
        }
    };

    if (!flight) {
        return (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans">
                {/* Header Bar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                            <Layers className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                        </div>
                        <div>
                            <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                                Telemetry Analysis
                            </h1>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                                Synchronized with embedded SQLite aerotrack.db
                            </p>
                        </div>
                    </div>
                    <div>
                        <button
                            type="button"
                            onClick={() => setActiveView("logbook")}
                            className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Back to Logbook</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-16 text-neutral-500 dark:text-neutral-400 text-center">
                    <Navigation className="w-8 h-8 text-neutral-400 dark:text-neutral-600 mb-3" />
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        No Flights Logged Yet
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-geist-muted max-w-sm mt-1">
                        When you fly in MSFS with FSUIPC7 running, flights and
                        telemetry trajectories will be automatically recorded here.
                    </p>
                    <button
                        onClick={() => setActiveView("dashboard")}
                        className="mt-4 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors"
                    >
                        View Live Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const durationMins = Math.floor(flight.flightTimeSeconds / 60);
    const durationHours = Math.floor(durationMins / 60);
    const durationRemainingMins = durationMins % 60;

    return (
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
            {/* Header Bar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                        <Layers className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                            Flight Telemetry Analysis
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Synchronized with embedded SQLite aerotrack.db
                        </p>
                    </div>
                </div>

                {/* Action Controls */}
                <div className="flex items-center gap-2.5 w-full md:w-auto">
                    {/* Flight selector */}
                    <div className="relative flex-1 md:w-64">
                        <Select
                            size="sm"
                            value={flight.id}
                            onChange={(val) => setSelectedFlightId(String(val))}
                            options={flights.map((f) => ({
                                value: f.id,
                                label: `${f.departureIcao} ➔ ${f.arrivalIcao} (${f.aircraftType})`,
                            }))}
                            className="w-full"
                            triggerClassName="bg-white dark:bg-geist-surface shadow-xs"
                        />
                    </div>

                    {/* Export Menu (consistent with LogbookView) */}
                    <div className="relative shrink-0" ref={exportMenuRef}>
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className={`h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border transition-colors duration-150 select-none cursor-pointer ${
                                showExportMenu
                                    ? "bg-neutral-200 dark:bg-[#282828] text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-600"
                                    : "bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-geist-hairline shadow-xs"
                            }`}
                            title="Export Flight Telemetry (.GPX, .KML, .GeoJSON, .CSV)"
                        >
                            {copiedFormat ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                                <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            )}
                            <span>
                                {copiedFormat
                                    ? `Exported .${copiedFormat.toUpperCase()}`
                                    : "Export Flight"}
                            </span>
                            <ChevronDown
                                className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 ${
                                    showExportMenu
                                        ? "rotate-180 text-neutral-700 dark:text-neutral-200"
                                        : ""
                                }`}
                            />
                        </button>

                        {showExportMenu && (
                            <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-[#161616] border border-neutral-200 dark:border-[#2a2a2a] rounded-sm shadow-xl py-1 z-50 text-left text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-100 select-none">
                                <div className="px-3 py-1.5 border-b border-neutral-100 dark:border-[#222222] mb-1">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                        Export Flight Data
                                    </div>
                                    <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate mt-0.5 flex items-center justify-between">
                                        <span>
                                            {flight.departureIcao} ➔{" "}
                                            {flight.arrivalIcao}
                                        </span>
                                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                                            {new Date(
                                                flight.startTime,
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                                        {flight.aircraftType}
                                    </div>
                                </div>

                                <div className="space-y-0.5 px-1">
                                    <button
                                        onClick={() => handleExport("gpx")}
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
                                                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                                    .GPX
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                                Universal GPS waypoint
                                                trajectory
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => handleExport("kml")}
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
                                                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                                    .KML
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                                3D globe ribbon & aerial camera
                                                tour
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => handleExport("geojson")}
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
                                                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                                    .GeoJSON
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                                GIS vector geometry & telemetry
                                                metadata
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => handleExport("csv")}
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
                                                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                                                    .CSV
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                                Raw tabular points (alt, GS, VS,
                                                heading)
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Return to Logbook */}
                    <button
                        type="button"
                        onClick={() => setActiveView("logbook")}
                        className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs transition-colors duration-150 select-none cursor-pointer"
                        title="Return to Logbook"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                        <span>Logbook</span>
                    </button>

                    {/* Expanding Delete Confirmation Button */}
                    <ConfirmDeleteButton
                        onConfirm={async () => {
                            const idToDelete = flight.id;
                            setActiveView("logbook");
                            await deleteFlight(idToDelete);
                        }}
                        title="Delete flight log"
                        confirmTitle="Click again to confirm delete"
                    />
                </div>
            </div>

            {/* Summary Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Block Time</span>
                    </div>
                    <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {durationHours > 0 ? (
                            <>
                                {durationHours}
                                <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal mr-1.5">
                                    h
                                </span>
                                {String(durationRemainingMins).padStart(2, "0")}
                                <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                                    min
                                </span>
                            </>
                        ) : (
                            <>
                                {durationRemainingMins}{" "}
                                <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                                    mins
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <Compass className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Distance</span>
                    </div>
                    <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {(flight.distanceFlownNm ?? 0).toFixed(1)}{" "}
                        <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                            NM
                        </span>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <Gauge className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Max Altitude</span>
                    </div>
                    <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {flight.maxAltitude.toLocaleString()}{" "}
                        <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                            ft
                        </span>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <Wind className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Peak GS</span>
                    </div>
                    <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {flight.maxGroundSpeed}{" "}
                        <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                            kt
                        </span>
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <Scale className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Gross Weight</span>
                    </div>
                    <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {weightInfo.value !== null ? (
                            <>
                                {weightInfo.value.toLocaleString()}{" "}
                                <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                                    {weightInfo.unit}
                                </span>
                            </>
                        ) : (
                            <span className="text-neutral-400 dark:text-neutral-600">
                                —
                            </span>
                        )}
                    </div>
                </div>

                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium">
                            <TrendingDown className="w-3.5 h-3.5 text-neutral-400" />
                            <span>
                                {touchdowns.length > 1
                                    ? "Avg Touchdown Rate"
                                    : "Touchdown Rate"}
                            </span>
                        </div>
                        {touchdowns.length > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 tabular-nums">
                                {touchdowns.length} Landings
                            </span>
                        )}
                    </div>
                    <div className="flex items-baseline justify-between">
                        <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {avgTouchdownRate !== null
                                ? `${avgTouchdownRate}`
                                : "N/A"}{" "}
                            <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                                fpm
                            </span>
                        </div>
                        {avgTouchdownRate !== null && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 tabular-nums">
                                    +
                                    {calculateTouchdownGForce(
                                        avgTouchdownRate,
                                    ).toFixed(2)}{" "}
                                    G
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 2D Map with Altitude Gradient Track & TOC/TOD Badges */}
            <DebriefMap
                flight={flight}
                coordinates={coordinates}
                bounds={bounds}
                points={points}
                altitudeSegments={altitudeSegments}
                tocPoint={tocPoint}
                todPoint={todPoint}
                touchdowns={touchdowns}
                resolvedTouchdownAirports={resolvedTouchdownAirports}
                activeScrubPoint={activeScrubPoint}
                isHeavyReady={isHeavyReady}
                isLoadingFlightDetails={isLoadingFlightDetails}
                theme={theme}
                windSpeedUnit={windSpeedUnit}
                temperatureUnit={temperatureUnit}
                visibilityUnit={visibilityUnit}
            />

            {/* Synchronized Telemetry Profile Chart */}
            <TelemetryChart
                chartData={chartData}
                zoomTimeRange={zoomTimeRange}
                setZoomTimeRange={setZoomTimeRange}
                dragSelection={dragSelection}
                setDragSelection={setDragSelection}
                setScrubbedTelemetryIndex={setScrubbedTelemetryIndex}
                isHeavyReady={isHeavyReady}
                isLoadingFlightDetails={isLoadingFlightDetails}
                theme={theme}
                windSpeedUnit={windSpeedUnit}
                temperatureUnit={temperatureUnit}
                visibilityUnit={visibilityUnit}
            />

            {/* Atmospheric & Weather Summary ("Totals" - Phase 12) */}
            <AtmosphericCards
                weatherStats={weatherStats}
                temperatureUnit={temperatureUnit}
                visibilityUnit={visibilityUnit}
                windSpeedUnit={windSpeedUnit}
            />

            {/* Touchdown & Landing Analysis Panel */}
            <TouchdownCard
                touchdowns={touchdowns}
                avgTouchdownRate={avgTouchdownRate}
                resolvedTouchdownAirports={resolvedTouchdownAirports}
                flight={flight}
                windSpeedUnit={windSpeedUnit}
            />
        </div>
    );
};
