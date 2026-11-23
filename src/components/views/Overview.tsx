import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Polyline,
    CircleMarker,
    Popup,
    useMap,
} from "react-leaflet";
import L from "leaflet";
import {
    useFlightStore,
    safeInvoke,
} from "../../store/flightStore";
import { Airport, Runway } from "../../types/flight";
import { FALLBACK_AIRPORTS } from "../../data/fallbackAirports";
import {
    Compass,
    Gauge,
    ArrowUpRight,
    PlaneTakeoff,
    Play,
    Square,
    Navigation,
    Wind,
    Activity,
    AlertTriangle,
    CheckCircle2,
    CloudRain,
    Search,
    RefreshCw,
    Locate,
    LocateFixed,
    ExternalLink,
    Route,
    Bookmark,
    BookOpen,
    Sliders,
    Layers,
    MapPin,
    Building2,
    Copy,
    Check,
} from "lucide-react";

// --- Leaflet Plane Icon & Controller ---

function createPlaneIcon(heading: number, isDark: boolean) {
    const safeHeading =
        typeof heading === "number" && !isNaN(heading) ? heading : 0;
    const color = isDark ? "#38bdf8" : "#0284c7";
    const svgHtml = `
        <div style="transform: rotate(${safeHeading}deg); transform-origin: center center; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
            <svg viewBox="0 0 24 24" width="28" height="28" stroke="${color}" stroke-width="2.5" fill="${color}" fill-opacity="0.35" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
            </svg>
        </div>
    `;

    return L.divIcon({
        html: svgHtml,
        className: "plane-marker-icon",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });
}

class MapErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: string | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error: error?.message || String(error) };
    }
    componentDidCatch(error: any, info: any) {
        console.error("Map render error:", error, info);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400">
                    <p className="font-semibold text-xs text-neutral-900 dark:text-white mb-1">
                        Map Display Notice
                    </p>
                    <p className="text-[11px] mb-3 max-w-sm">{this.state.error}</p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-3 py-1.5 text-xs bg-neutral-900 text-white dark:bg-white dark:text-black rounded-sm"
                    >
                        Reset Map View
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const MapFollowController: React.FC<{
    lat: number;
    lon: number;
    isFollow: boolean;
}> = ({ lat, lon, isFollow }) => {
    const map = useMap();
    useEffect(() => {
        if (
            isFollow &&
            typeof lat === "number" &&
            !isNaN(lat) &&
            typeof lon === "number" &&
            !isNaN(lon) &&
            lat !== 0 &&
            lon !== 0
        ) {
            try {
                const container = map.getContainer();
                if (
                    container &&
                    container.clientWidth > 0 &&
                    container.clientHeight > 0
                ) {
                    map.panTo([lat, lon], { animate: false });
                }
            } catch {}
        }
    }, [lat, lon, isFollow, map]);

    return null;
};

const MapResizeHandler: React.FC = () => {
    const map = useMap();
    useEffect(() => {
        let timer: any;
        const handleResize = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                try {
                    const container = map.getContainer();
                    if (
                        container &&
                        container.clientWidth > 0 &&
                        container.clientHeight > 0
                    ) {
                        map.invalidateSize({ debounceMoveend: true });
                    }
                } catch {}
            }, 100);
        };
        window.addEventListener("resize", handleResize);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", handleResize);
        };
    }, [map]);

    return null;
};

// --- Weather Fetch Helper ---

interface AviationWeather {
    icao: string;
    metar: string | null;
    taf: string | null;
    fetchedAt: string;
}

async function fetchWeatherString(
    endpoint: "metar" | "taf",
    icao: string,
): Promise<string | null> {
    const directUrl = `https://aviationweather.gov/api/data/${endpoint}?ids=${encodeURIComponent(icao)}&format=raw`;
    const localProxyUrl = `/api/awc/data/${endpoint}?ids=${encodeURIComponent(icao)}&format=raw`;

    // 1. Local Vite Proxy (avoids CORS issues during local development)
    if (
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1")
    ) {
        try {
            const res = await fetch(localProxyUrl);
            if (res.ok) {
                const txt = (await res.text()).trim();
                if (txt && !txt.startsWith("<!DOCTYPE") && !txt.startsWith("<html")) {
                    return txt;
                }
            }
        } catch {}
    }

    // 2. Direct fetch (native runtime or allowed origin)
    try {
        const res = await fetch(directUrl);
        if (res.ok) {
            const txt = (await res.text()).trim();
            if (txt && !txt.startsWith("<!DOCTYPE") && !txt.startsWith("<html")) {
                return txt;
            }
        }
    } catch {}

    // 3. Resilient CORS proxy fallback
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
            const txt = (await res.text()).trim();
            if (txt && !txt.startsWith("<!DOCTYPE") && !txt.startsWith("<html")) {
                return txt;
            }
        }
    } catch {}

    try {
        const proxyUrl2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
        const res = await fetch(proxyUrl2);
        if (res.ok) {
            const txt = (await res.text()).trim();
            if (txt && !txt.startsWith("<!DOCTYPE") && !txt.startsWith("<html")) {
                return txt;
            }
        }
    } catch {}

    return null;
}

async function fetchAviationWeather(icao: string): Promise<AviationWeather> {
    const clean = icao.trim().toUpperCase();
    if (!clean) {
        return { icao: "", metar: null, taf: null, fetchedAt: "" };
    }

    const [metar, taf] = await Promise.all([
        fetchWeatherString("metar", clean),
        fetchWeatherString("taf", clean),
    ]);

    return {
        icao: clean,
        metar,
        taf,
        fetchedAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }),
    };
}

// --- Airport Popup Component ---

const AirportPopupContent: React.FC<{
    airport: Airport;
    onSelectForWeather?: (icao: string) => void;
    onSelectAirportInfo?: (icao: string) => void;
}> = ({ airport, onSelectForWeather, onSelectAirportInfo }) => {
    const [weather, setWeather] = useState<AviationWeather | null>(null);
    const [loadingWeather, setLoadingWeather] = useState(false);
    const [runways, setRunways] = useState<Runway[]>([]);
    const [loadingRunways, setLoadingRunways] = useState(false);

    useEffect(() => {
        let mounted = true;
        setLoadingWeather(true);
        fetchAviationWeather(airport.icao).then((w) => {
            if (mounted) {
                setWeather(w);
                setLoadingWeather(false);
            }
        });

        setLoadingRunways(true);
        safeInvoke<Runway[]>("get_airport_runways", { icao: airport.icao })
            .then((res) => {
                if (mounted) {
                    setRunways(res || []);
                    setLoadingRunways(false);
                }
            })
            .catch(() => {
                if (mounted) setLoadingRunways(false);
            });

        return () => {
            mounted = false;
        };
    }, [airport.icao]);

    return (
        <div className="space-y-2 font-sans text-xs text-neutral-900 dark:text-neutral-100 max-h-[340px] overflow-y-auto overflow-x-hidden pr-0.5">
            <div className="flex items-start justify-between gap-2 border-b border-neutral-200 dark:border-neutral-700 pb-1.5">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold bg-neutral-900 text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded text-[11px]">
                            {airport.icao}
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white truncate" title={airport.name}>
                            {airport.name}
                        </span>
                    </div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                        {[airport.municipality, airport.countryName]
                            .filter(Boolean)
                            .join(", ")}
                        {typeof airport.elevationFt === "number" && (
                            <span> • Elev {airport.elevationFt.toLocaleString()} ft</span>
                        )}
                    </div>
                </div>

                {onSelectAirportInfo && (
                    <button
                        type="button"
                        onClick={() => onSelectAirportInfo(airport.icao)}
                        className="text-[10px] text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 font-semibold underline shrink-0 cursor-pointer"
                        title="View detailed specs and all runways in panel"
                    >
                        View Details →
                    </button>
                )}
            </div>

            {/* Runways Information */}
            <div className="space-y-1">
                <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                    Runways & Dimensions
                </span>
                {loadingRunways ? (
                    <div className="text-[11px] text-neutral-400">Loading runways...</div>
                ) : runways.length > 0 ? (
                    <div className="space-y-0.5 max-h-24 overflow-y-auto">
                        {runways.map((r) => (
                            <div
                                key={r.id}
                                className="flex items-center justify-between text-[11px] bg-neutral-100 dark:bg-neutral-800/80 px-1.5 py-0.5 rounded font-mono"
                            >
                                <span className="text-neutral-800 dark:text-neutral-200">
                                    {r.lengthFt ?? "?"} x {r.widthFt ?? "?"} ft
                                </span>
                                <span className="text-[10px] text-neutral-600 dark:text-neutral-400 font-sans">
                                    {r.surface || (r.isPaved ? "Paved" : "Unpaved")}
                                    {r.lighted ? " • Lighted" : ""}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-400">
                        {airport.maxRunwayLengthFt
                            ? `Max Runway: ${airport.maxRunwayLengthFt.toLocaleString()} ft (${
                                  airport.hasPaved ? "Paved" : "Unpaved"
                              })`
                            : "Standard aerodrome dimensions not registered"}
                    </div>
                )}
            </div>

            {/* Live METAR / TAF */}
            <div className="space-y-1 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Weather
                    </span>
                    {onSelectForWeather && (
                        <button
                            type="button"
                            onClick={() => onSelectForWeather(airport.icao)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium cursor-pointer"
                        >
                            View in Weather Panel →
                        </button>
                    )}
                </div>

                {loadingWeather ? (
                    <div className="text-[11px] text-neutral-400">
                        Fetching live METAR/TAF...
                    </div>
                ) : weather ? (
                    <div className="space-y-1 text-[10px]">
                        <div>
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">METAR:</span>
                            <pre className="bg-neutral-100 dark:bg-neutral-800 p-1 rounded font-mono text-[9px] whitespace-pre-wrap break-all mt-0.5 text-neutral-800 dark:text-neutral-200 max-h-16 overflow-y-auto">
                                {weather.metar || "No METAR reported"}
                            </pre>
                        </div>
                        {weather.taf && (
                            <div>
                                <span className="font-semibold text-neutral-700 dark:text-neutral-300">TAF:</span>
                                <pre className="bg-neutral-100 dark:bg-neutral-800 p-1 rounded font-mono text-[9px] whitespace-pre-wrap break-all mt-0.5 text-neutral-800 dark:text-neutral-200 max-h-16 overflow-y-auto">
                                    {weather.taf}
                                </pre>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-[11px] text-neutral-400">
                        Weather not available
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main Overview Component ---

export const Overview: React.FC = () => {
    const {
        currentTelemetry,
        activeFlight,
        flightStage,
        startManualFlight,
        endActiveFlight,
        showEndFlightPrompt,
        setShowEndFlightPrompt,
        detectedMultiSectorRoute,
        nearestAirport,
        fetchNearestAirport,
        autoStartRecording,
        setAutoStartRecording,
        theme,
        setActiveView,
    } = useFlightStore();

    // Map controls & layer data
    const [isFollow, setIsFollow] = useState(true);
    const [allAirports, setAllAirports] = useState<Airport[]>([]);
    const [isLoadingAirports, setIsLoadingAirports] = useState(false);
    const [selectedMapAirport, setSelectedMapAirport] = useState<Airport | null>(null);

    // Weather Section state
    const [searchIcao, setSearchIcao] = useState("");
    const [weatherData, setWeatherData] = useState<AviationWeather | null>(null);
    const [weatherLoading, setWeatherLoading] = useState(false);
    const [weatherError, setWeatherError] = useState<string | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Airport Information Section state
    const [airportSearchIcao, setAirportSearchIcao] = useState("");
    const [selectedAirportDetails, setSelectedAirportDetails] =
        useState<Airport | null>(null);
    const [selectedAirportRunways, setSelectedAirportRunways] = useState<
        Runway[]
    >([]);
    const [airportDetailsLoading, setAirportDetailsLoading] = useState(false);
    const airportSectionRef = useRef<HTMLDivElement>(null);

    const handleSelectAirportInfo = useCallback(
        async (icaoToLookup?: string, shouldScroll = true) => {
            const clean = (icaoToLookup || airportSearchIcao)
                .trim()
                .toUpperCase();
            if (!clean) return;
            setAirportSearchIcao(clean);
            setAirportDetailsLoading(true);

            if (shouldScroll && airportSectionRef.current) {
                airportSectionRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }

            try {
                let apt = await safeInvoke<Airport>("get_airport", {
                    icao: clean,
                });
                if (!apt) {
                    apt =
                        FALLBACK_AIRPORTS.find(
                            (a) => a.icao.toUpperCase() === clean,
                        ) || null;
                }
                setSelectedAirportDetails(apt);

                const rwys = await safeInvoke<Runway[]>(
                    "get_airport_runways",
                    { icao: clean },
                );
                setSelectedAirportRunways(rwys || []);
            } catch {
                setSelectedAirportDetails(null);
                setSelectedAirportRunways([]);
            } finally {
                setAirportDetailsLoading(false);
            }
        },
        [airportSearchIcao],
    );

    // Nearest airport trigger
    useEffect(() => {
        if (
            currentTelemetry.latitude !== 0 ||
            currentTelemetry.longitude !== 0
        ) {
            fetchNearestAirport(
                currentTelemetry.latitude,
                currentTelemetry.longitude,
            );
        }
    }, [
        currentTelemetry.latitude,
        currentTelemetry.longitude,
        fetchNearestAirport,
    ]);

    // Auto-load nearest airport into Airport Information if empty
    useEffect(() => {
        if (nearestAirport && !selectedAirportDetails) {
            handleSelectAirportInfo(nearestAirport.icao, false);
        }
    }, [nearestAirport, selectedAirportDetails, handleSelectAirportInfo]);

    // Load airports layer for the map when not recording
    useEffect(() => {
        let isMounted = true;
        if (!activeFlight) {
            setIsLoadingAirports(true);
            safeInvoke<Airport[]>("get_all_airports")
                .then((res) => {
                    if (isMounted) {
                        if (res && res.length > 0) {
                            setAllAirports(res);
                        } else {
                            setAllAirports(FALLBACK_AIRPORTS);
                        }
                        setIsLoadingAirports(false);
                    }
                })
                .catch(() => {
                    if (isMounted) {
                        setAllAirports(FALLBACK_AIRPORTS);
                        setIsLoadingAirports(false);
                    }
                });
        }
        return () => {
            isMounted = false;
        };
    }, [activeFlight]);

    // Weather search function
    const handleSearchWeather = useCallback(async (icaoToQuery?: string) => {
        const target = (icaoToQuery || searchIcao).trim().toUpperCase();
        if (!target) return;
        setSearchIcao(target);
        setWeatherLoading(true);
        setWeatherError(null);

        try {
            const data = await fetchAviationWeather(target);
            if (!data.metar && !data.taf) {
                setWeatherError(`No METAR or TAF available for station ${target}`);
            }
            setWeatherData(data);
        } catch (err: any) {
            setWeatherError(err?.message || "Failed to fetch weather data");
        } finally {
            setWeatherLoading(false);
        }
    }, [searchIcao]);

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    // Flight path coordinates
    const flightPath = useMemo<[number, number][]>(() => {
        if (!activeFlight || !activeFlight.telemetryPoints) return [];
        return activeFlight.telemetryPoints
            .filter(
                (p) =>
                    typeof p.latitude === "number" &&
                    !isNaN(p.latitude) &&
                    typeof p.longitude === "number" &&
                    !isNaN(p.longitude) &&
                    (p.latitude !== 0 || p.longitude !== 0),
            )
            .map((p) => [p.latitude, p.longitude]);
    }, [activeFlight]);

    const hasSimCoords =
        Boolean(currentTelemetry?.simConnected) &&
        typeof currentTelemetry?.latitude === "number" &&
        !isNaN(currentTelemetry.latitude) &&
        typeof currentTelemetry?.longitude === "number" &&
        !isNaN(currentTelemetry.longitude) &&
        isFinite(currentTelemetry.latitude) &&
        isFinite(currentTelemetry.longitude) &&
        (currentTelemetry.latitude !== 0 || currentTelemetry.longitude !== 0);

    const mapCenter: [number, number] = useMemo(() => {
        if (hasSimCoords) {
            return [currentTelemetry.latitude, currentTelemetry.longitude];
        }
        if (activeFlight && flightPath.length > 0) {
            const last = flightPath[flightPath.length - 1];
            if (last && !isNaN(last[0]) && !isNaN(last[1])) {
                return last;
            }
        }
        return [47.2602, 11.344]; // Default LOWI
    }, [
        hasSimCoords,
        currentTelemetry?.latitude,
        currentTelemetry?.longitude,
        activeFlight,
        flightPath,
    ]);

    // Sanitized & deduplicated aerodromes for map rendering
    const validAirports = useMemo(() => {
        if (!allAirports || !Array.isArray(allAirports)) return [];
        const seen = new Set<string>();
        const res: Airport[] = [];
        for (const apt of allAirports) {
            if (!apt || !apt.icao) continue;
            const icao = String(apt.icao).trim().toUpperCase();
            if (seen.has(icao)) continue;
            const lat = Number(apt.latitude);
            const lon = Number(apt.longitude);
            if (
                !isNaN(lat) &&
                !isNaN(lon) &&
                isFinite(lat) &&
                isFinite(lon) &&
                lat >= -90 &&
                lat <= 90 &&
                lon >= -180 &&
                lon <= 180
            ) {
                seen.add(icao);
                res.push({
                    ...apt,
                    icao,
                    latitude: lat,
                    longitude: lon,
                });
                if (res.length >= 1200) break;
            }
        }
        return res;
    }, [allAirports]);

    const getStageColor = (stage: string) => {
        switch (stage) {
            case "TAKEOFF_CLIMB":
                return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40";
            case "ENROUTE_CRUISE":
                return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40";
            case "DESCENT_APPROACH":
                return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40";
            case "GO_AROUND":
                return "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40";
            case "TOUCHDOWN_ROLLOUT":
                return "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40";
            case "TOUCH_AND_GO":
                return "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800/40";
            case "TAXI_IN":
                return "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/40";
            case "ARRIVED":
                return "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700";
            default:
                return "text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline";
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
            {/* Multi-Sector Continuation Safeguard Prompt */}
            {showEndFlightPrompt && (
                <div className="bg-amber-50 dark:bg-[#1f170a] border border-amber-300 dark:border-amber-700/60 p-4 rounded-sm animate-fade-in shadow-xs">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                                    {detectedMultiSectorRoute
                                        ? `Multi-Sector Route: ${detectedMultiSectorRoute.route.name}`
                                        : "Finish Flight Recording?"}
                                </h3>
                                <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                                    {detectedMultiSectorRoute ? (
                                        <>
                                            The aircraft is parked at{" "}
                                            <strong>
                                                {detectedMultiSectorRoute.currentAirportIcao}
                                            </strong>{" "}
                                            with engines shut down. Next planned destination:{" "}
                                            <strong>
                                                {detectedMultiSectorRoute.nextSectorArrivalIcao ||
                                                    detectedMultiSectorRoute.route.arrivalIcao}
                                            </strong>
                                            . Keep recording for the next sector, or finish and save this flight now?
                                        </>
                                    ) : (
                                        "The aircraft has been stationary for over 30 seconds with engines shut down. Would you like to finish recording and log this flight?"
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowEndFlightPrompt(false)}
                                className="px-3 py-1.5 text-xs font-medium rounded-sm text-neutral-700 dark:text-neutral-300 hover:bg-amber-100/60 dark:hover:bg-[#2c210e] border border-neutral-300 dark:border-neutral-700 transition-colors"
                            >
                                Keep Recording
                            </button>
                            <button
                                type="button"
                                onClick={() => endActiveFlight()}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-sm bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center gap-1.5 shadow-xs"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Finish & Save Flight</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Telemetry Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3.5 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <span>Altitude MSL</span>
                        <Gauge className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                        {currentTelemetry.simConnected
                            ? currentTelemetry.altitudeMsl.toLocaleString()
                            : "--"}{" "}
                        <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted">
                            {currentTelemetry.simConnected ? "ft" : ""}
                        </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 truncate">
                        {currentTelemetry.simConnected
                            ? `AGL ${currentTelemetry.altitudeAgl} ft`
                            : "No Sim Connection"}
                    </div>
                </div>

                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3.5 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <span>Ground Speed</span>
                        <Wind className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                        {currentTelemetry.simConnected
                            ? currentTelemetry.groundSpeed
                            : "--"}{" "}
                        <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted">
                            {currentTelemetry.simConnected ? "kt" : ""}
                        </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 truncate">
                        {currentTelemetry.simConnected
                            ? `IAS ${currentTelemetry.indicatedAirspeed} · TAS ${currentTelemetry.trueAirspeed}`
                            : "Standby"}
                    </div>
                </div>

                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3.5 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <span>Magnetic Heading</span>
                        <Compass className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                        {currentTelemetry.simConnected
                            ? `${String(Math.round(currentTelemetry.heading)).padStart(3, "0")}°`
                            : "--"}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 truncate">
                        {currentTelemetry.simConnected
                            ? currentTelemetry.heading >= 315 ||
                              currentTelemetry.heading < 45
                                ? "North"
                                : currentTelemetry.heading >= 45 &&
                                    currentTelemetry.heading < 135
                                  ? "East"
                                  : currentTelemetry.heading >= 135 &&
                                      currentTelemetry.heading < 225
                                    ? "South"
                                    : "West"
                            : "Standby"}
                    </div>
                </div>

                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3.5 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <span>Vertical Speed</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div
                        className={`text-2xl font-semibold tabular-nums tracking-tight ${
                            !currentTelemetry.simConnected
                                ? "text-neutral-900 dark:text-white"
                                : currentTelemetry.verticalSpeed > 100
                                  ? "text-emerald-600 dark:text-geist-success"
                                  : currentTelemetry.verticalSpeed < -100
                                    ? "text-red-600 dark:text-geist-error"
                                    : "text-neutral-900 dark:text-white"
                        }`}
                    >
                        {currentTelemetry.simConnected
                            ? currentTelemetry.verticalSpeed > 0
                                ? `+${currentTelemetry.verticalSpeed}`
                                : currentTelemetry.verticalSpeed
                            : "--"}
                        <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted ml-1">
                            {currentTelemetry.simConnected ? "fpm" : ""}
                        </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 truncate">
                        {currentTelemetry.simConnected
                            ? currentTelemetry.isOnGround
                                ? "On Runway / Surface"
                                : "Airborne"
                            : "Standby"}
                    </div>
                </div>

                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3.5 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <span>Attitude & Engine</span>
                        <Navigation className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                        {currentTelemetry.simConnected
                            ? `${currentTelemetry.pitch}° / ${currentTelemetry.bank}°`
                            : "-- / --"}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 flex items-center gap-1.5 truncate">
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${
                                currentTelemetry.simConnected &&
                                currentTelemetry.isEngineRunning
                                    ? "bg-emerald-500"
                                    : "bg-neutral-400"
                            }`}
                        />
                        <span>
                            {currentTelemetry.simConnected
                                ? currentTelemetry.isEngineRunning
                                    ? "Engines Running"
                                    : "Engines Off"
                                : "Sim Disconnected"}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3.5 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
                        <span>Flight Stage</span>
                        <Activity className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="text-sm font-semibold tracking-tight uppercase truncate">
                        <span
                            className={`inline-block px-1.5 py-0.5 rounded-sm text-[11px] border font-mono ${getStageColor(
                                flightStage,
                            )}`}
                        >
                            {flightStage.replace(/_/g, " ")}
                        </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1">
                        Lifecycle State Machine
                    </div>
                </div>
            </div>

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left Column: Flight Control + Weather Information */}
                <div className="lg:col-span-5 space-y-4">
                    {/* Flight Control Section */}
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200 dark:border-geist-hairline">
                            <div className="flex items-center gap-2">
                                <PlaneTakeoff className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                                    Flight Control
                                </h2>
                            </div>
                            {nearestAirport && (
                                <span className="text-[11px] text-neutral-500 dark:text-geist-muted">
                                    Nearest:{" "}
                                    <strong className="font-mono text-neutral-800 dark:text-neutral-200">
                                        {nearestAirport.icao}
                                    </strong>
                                </span>
                            )}
                        </div>

                        {activeFlight ? (
                            <div className="p-3 bg-red-50 dark:bg-[#140a0a] border border-red-200 dark:border-red-900/60 rounded-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        <span>Flight Recording In Progress</span>
                                    </div>
                                    <span className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200">
                                        {activeFlight.departureIcao} ➔{" "}
                                        {activeFlight.arrivalIcao}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                                    <div className="truncate">
                                        Aircraft:{" "}
                                        <strong className="text-neutral-900 dark:text-white">
                                            {activeFlight.aircraftType || "MSFS Aircraft"}
                                        </strong>
                                    </div>
                                    <div>
                                        Distance:{" "}
                                        <strong className="text-neutral-900 dark:text-white tabular-nums">
                                            {activeFlight.distanceFlownNm} NM
                                        </strong>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => endActiveFlight()}
                                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs py-2 px-3 rounded-sm font-medium transition-colors shadow-xs"
                                >
                                    <Square className="w-3.5 h-3.5 fill-white" />
                                    <span>Finish & Save Flight</span>
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {currentTelemetry.simConnected ? (
                                    <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-neutral-500 dark:text-geist-muted">
                                                Departure Aerodrome
                                            </span>
                                            <span className="font-mono font-medium text-neutral-900 dark:text-white">
                                                {nearestAirport
                                                    ? `${nearestAirport.icao} • ${nearestAirport.name}`
                                                    : "Resolving nearest aerodrome..."}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-neutral-500 dark:text-geist-muted">
                                                Detected Aircraft
                                            </span>
                                            <span
                                                className="font-medium text-neutral-900 dark:text-white truncate max-w-[210px]"
                                                title={currentTelemetry.aircraftTitle}
                                            >
                                                {currentTelemetry.aircraftTitle &&
                                                currentTelemetry.aircraftTitle !==
                                                    "Standby (Waiting for MSFS)"
                                                    ? currentTelemetry.aircraftTitle
                                                    : "MSFS Aircraft"}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between p-2.5 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs">
                                        <span className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                                            Simulator Status
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-geist-hairline">
                                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                                            MSFS Disconnected
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-0.5">
                                    <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={autoStartRecording}
                                            onChange={(e) =>
                                                setAutoStartRecording(e.target.checked)
                                            }
                                            className="rounded border-neutral-300 dark:border-neutral-700 text-blue-600 focus:ring-0"
                                        />
                                        <span>Auto-detect takeoff & landing</span>
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        startManualFlight(
                                            nearestAirport?.icao || "ORIG",
                                            "DEST",
                                            currentTelemetry.aircraftTitle &&
                                                currentTelemetry.aircraftTitle !==
                                                    "Standby (Waiting for MSFS)"
                                                ? currentTelemetry.aircraftTitle
                                                : "MSFS Aircraft",
                                        )
                                    }
                                    className="w-full flex items-center justify-center gap-2 bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black text-xs py-2 px-3 rounded-sm font-medium transition-colors shadow-xs cursor-pointer"
                                >
                                    <Play className="w-3.5 h-3.5 fill-current text-emerald-500 dark:text-emerald-600" />
                                    <span>Start Recording Flight</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Airport Information Section */}
                    <div
                        ref={airportSectionRef}
                        className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-3.5 scroll-mt-4"
                    >
                        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200 dark:border-geist-hairline">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                                    Airport Information
                                </h2>
                            </div>
                            {selectedAirportDetails && (
                                <span className="font-mono text-xs font-bold text-neutral-700 dark:text-neutral-300">
                                    {selectedAirportDetails.icao}
                                </span>
                            )}
                        </div>

                        {/* Search Bar */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    maxLength={4}
                                    value={airportSearchIcao}
                                    onChange={(e) =>
                                        setAirportSearchIcao(
                                            e.target.value.toUpperCase(),
                                        )
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                            handleSelectAirportInfo();
                                    }}
                                    placeholder="Enter Airport ICAO (e.g. LOWI, EDDM, KJFK)"
                                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono uppercase bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline rounded-sm focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                                />
                                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5 pointer-events-none" />
                            </div>

                            <button
                                type="button"
                                disabled={
                                    airportDetailsLoading ||
                                    !airportSearchIcao.trim()
                                }
                                onClick={() => handleSelectAirportInfo()}
                                className="px-3 py-1.5 text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-sm transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                            >
                                <RefreshCw
                                    className={`w-3.5 h-3.5 ${
                                        airportDetailsLoading
                                            ? "animate-spin"
                                            : ""
                                    }`}
                                />
                                <span>Lookup</span>
                            </button>
                        </div>

                        {/* Quick Lookup Pills */}
                        {nearestAirport && (
                            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-geist-muted">
                                <span>Quick lookup:</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        handleSelectAirportInfo(
                                            nearestAirport.icao,
                                            false,
                                        )
                                    }
                                    className="font-mono font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                >
                                    {nearestAirport.icao} (Nearest)
                                </button>
                                {activeFlight && (
                                    <>
                                        <span>•</span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSelectAirportInfo(
                                                    activeFlight.departureIcao,
                                                    false,
                                                )
                                            }
                                            className="font-mono font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                        >
                                            {activeFlight.departureIcao} (Departure)
                                        </button>
                                        <span>•</span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSelectAirportInfo(
                                                    activeFlight.arrivalIcao,
                                                    false,
                                                )
                                            }
                                            className="font-mono font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                        >
                                            {activeFlight.arrivalIcao} (Arrival)
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Airport Details Body */}
                        {airportDetailsLoading ? (
                            <div className="p-4 text-center text-xs text-neutral-400 animate-pulse">
                                Loading aerodrome specifications...
                            </div>
                        ) : selectedAirportDetails ? (
                            <div className="space-y-3 pt-1">
                                {/* Name and Country Header */}
                                <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono font-bold bg-neutral-900 text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded text-xs">
                                                {selectedAirportDetails.icao}
                                            </span>
                                            <span className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                                                {selectedAirportDetails.name}
                                            </span>
                                        </div>
                                        {selectedAirportDetails.airportType && (
                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 shrink-0">
                                                {selectedAirportDetails.airportType.replace(
                                                    "_",
                                                    " ",
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted">
                                        {[
                                            selectedAirportDetails.municipality,
                                            selectedAirportDetails.countryName,
                                        ]
                                            .filter(Boolean)
                                            .join(", ")}
                                        {selectedAirportDetails.continent &&
                                            ` • Continent: ${selectedAirportDetails.continent}`}
                                    </div>
                                </div>

                                {/* Key Metrics 4-grid */}
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
                                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-medium">
                                            Elevation
                                        </span>
                                        <div className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                            {selectedAirportDetails.elevationFt !=
                                            null
                                                ? `${selectedAirportDetails.elevationFt.toLocaleString()} ft`
                                                : "—"}
                                        </div>
                                    </div>

                                    <div className="p-2 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
                                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-medium">
                                            Longest Runway
                                        </span>
                                        <div className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                            {selectedAirportDetails.maxRunwayLengthFt !=
                                            null
                                                ? `${selectedAirportDetails.maxRunwayLengthFt.toLocaleString()} ft`
                                                : "—"}
                                        </div>
                                    </div>

                                    <div className="p-2 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
                                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-medium">
                                            Surface Types
                                        </span>
                                        <div className="font-semibold text-neutral-900 dark:text-white">
                                            {selectedAirportDetails.hasPaved &&
                                            selectedAirportDetails.hasUnpaved
                                                ? "Paved & Unpaved"
                                                : selectedAirportDetails.hasPaved
                                                  ? "Paved"
                                                  : selectedAirportDetails.hasUnpaved
                                                    ? "Unpaved"
                                                    : "Standard"}
                                        </div>
                                    </div>

                                    <div className="p-2 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
                                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-medium">
                                            Coordinates
                                        </span>
                                        <div className="font-mono text-[11px] text-neutral-900 dark:text-white tabular-nums">
                                            {typeof selectedAirportDetails.latitude === "number"
                                                ? `${selectedAirportDetails.latitude.toFixed(3)}°`
                                                : "—"}
                                            ,{" "}
                                            {typeof selectedAirportDetails.longitude === "number"
                                                ? `${selectedAirportDetails.longitude.toFixed(3)}°`
                                                : "—"}
                                        </div>
                                    </div>
                                </div>

                                {/* Runways List */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                                            Runway Specifications (
                                            {selectedAirportRunways.length > 0
                                                ? selectedAirportRunways.length
                                                : "General"}
                                            )
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSearchWeather(
                                                    selectedAirportDetails.icao,
                                                )
                                            }
                                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                                        >
                                            <CloudRain className="w-3 h-3" />
                                            <span>Check Weather →</span>
                                        </button>
                                    </div>

                                    {selectedAirportRunways.length > 0 ? (
                                        <div className="space-y-1 max-h-44 overflow-y-auto">
                                            {selectedAirportRunways.map(
                                                (rwy) => (
                                                    <div
                                                        key={rwy.id}
                                                        className="flex items-center justify-between p-2 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs font-mono"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-neutral-900 dark:text-white">
                                                                {rwy.lengthFt ??
                                                                    "?"}{" "}
                                                                x{" "}
                                                                {rwy.widthFt ??
                                                                    "?"}{" "}
                                                                ft
                                                            </span>
                                                            <span className="font-sans text-[10px] text-neutral-500">
                                                                (
                                                                {rwy.surface ||
                                                                    (rwy.isPaved
                                                                        ? "Paved"
                                                                        : "Unpaved")}
                                                                )
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] font-sans">
                                                            {rwy.lighted && (
                                                                <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400">
                                                                    Lighted
                                                                </span>
                                                            )}
                                                            {rwy.closed ? (
                                                                <span className="px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400">
                                                                    Closed
                                                                </span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                                                                    Active
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-2.5 rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-[11px] text-neutral-500">
                                            {selectedAirportDetails.maxRunwayLengthFt
                                                ? `Registered maximum runway length: ${selectedAirportDetails.maxRunwayLengthFt.toLocaleString()} ft (${
                                                      selectedAirportDetails.hasPaved
                                                          ? "Paved"
                                                          : "Unpaved"
                                                  }).`
                                                : "Individual runway dimensional records not registered in navdata."}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 text-center rounded bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs text-neutral-500">
                                Search an aerodrome ICAO above or click any
                                marker on the map to inspect full aerodrome
                                specs and runways.
                            </div>
                        )}
                    </div>

                    {/* Weather Information Section */}
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200 dark:border-geist-hairline">
                            <div className="flex items-center gap-2">
                                <CloudRain className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                                    Weather Information
                                </h2>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    maxLength={4}
                                    value={searchIcao}
                                    onChange={(e) =>
                                        setSearchIcao(e.target.value.toUpperCase())
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSearchWeather();
                                    }}
                                    placeholder="Enter Airport ICAO (e.g. KJFK, EGLL, LOWI)"
                                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono uppercase bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline rounded-sm focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                                />
                                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5 pointer-events-none" />
                            </div>

                            <button
                                type="button"
                                disabled={weatherLoading || !searchIcao.trim()}
                                onClick={() => handleSearchWeather()}
                                className="px-3 py-1.5 text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-sm transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                            >
                                <RefreshCw
                                    className={`w-3.5 h-3.5 ${
                                        weatherLoading ? "animate-spin" : ""
                                    }`}
                                />
                                <span>Fetch</span>
                            </button>
                        </div>

                        {/* Quick Airport Buttons */}
                        {nearestAirport && (
                            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-geist-muted">
                                <span>Quick lookup:</span>
                                <button
                                    type="button"
                                    onClick={() => handleSearchWeather(nearestAirport.icao)}
                                    className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    {nearestAirport.icao} (Nearest)
                                </button>
                                {activeFlight && (
                                    <>
                                        <span>•</span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSearchWeather(activeFlight.departureIcao)
                                            }
                                            className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            {activeFlight.departureIcao} (Departure)
                                        </button>
                                        <span>•</span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSearchWeather(activeFlight.arrivalIcao)
                                            }
                                            className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            {activeFlight.arrivalIcao} (Arrival)
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Weather Results */}
                        {weatherError && (
                            <div className="p-2.5 rounded text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300">
                                {weatherError}
                            </div>
                        )}

                        {weatherData && (
                            <div className="space-y-3 pt-1">
                                <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-geist-muted">
                                    <span className="font-semibold text-neutral-900 dark:text-white font-mono text-xs">
                                        Station: {weatherData.icao}
                                    </span>
                                    <span>Updated: {weatherData.fetchedAt}</span>
                                </div>

                                {/* METAR Block */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                                            METAR Observation
                                        </span>
                                        {weatherData.metar && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleCopy(weatherData.metar!, "metar")
                                                }
                                                className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                            >
                                                {copiedKey === "metar" ? (
                                                    <Check className="w-3 h-3 text-emerald-500" />
                                                ) : (
                                                    <Copy className="w-3 h-3" />
                                                )}
                                                <span>Copy</span>
                                            </button>
                                        )}
                                    </div>
                                    <pre className="p-2.5 rounded bg-neutral-100 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline font-mono text-xs whitespace-pre-wrap break-all text-neutral-900 dark:text-neutral-100">
                                        {weatherData.metar || "No METAR reported for this station"}
                                    </pre>
                                </div>

                                {/* TAF Block */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                                            TAF Aerodrome Forecast
                                        </span>
                                        {weatherData.taf && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleCopy(weatherData.taf!, "taf")
                                                }
                                                className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                            >
                                                {copiedKey === "taf" ? (
                                                    <Check className="w-3 h-3 text-emerald-500" />
                                                ) : (
                                                    <Copy className="w-3 h-3" />
                                                )}
                                                <span>Copy</span>
                                            </button>
                                        )}
                                    </div>
                                    <pre className="p-2.5 rounded bg-neutral-100 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline font-mono text-xs whitespace-pre-wrap break-all text-neutral-900 dark:text-neutral-100 max-h-48 overflow-y-auto">
                                        {weatherData.taf || "No TAF forecast available for this aerodrome"}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Interactive Map Section */}
                <div className="lg:col-span-7 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-geist-hairline">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                                Map
                            </h2>
                            {!activeFlight && allAirports.length > 0 && (
                                <span className="text-[11px] text-neutral-500 dark:text-geist-muted">
                                    ({allAirports.length} aerodromes)
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-[11px] text-neutral-500 dark:text-geist-muted font-mono tabular-nums">
                                {currentTelemetry?.simConnected &&
                                typeof currentTelemetry.latitude === "number" &&
                                typeof currentTelemetry.longitude === "number"
                                    ? `LAT ${currentTelemetry.latitude.toFixed(4)}° · LON ${currentTelemetry.longitude.toFixed(4)}°`
                                    : "Sim Disconnected"}
                            </span>

                            <button
                                type="button"
                                onClick={() => setIsFollow(!isFollow)}
                                title={isFollow ? "Follow Plane (Enabled)" : "Free Pan (Disabled)"}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${
                                    isFollow
                                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white font-medium shadow-xs"
                                        : "bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1a1a1a] dark:hover:bg-[#252525] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-geist-hairline"
                                }`}
                            >
                                {isFollow ? (
                                    <>
                                        <LocateFixed className="w-3.5 h-3.5 text-blue-400" />
                                        <span>Following</span>
                                    </>
                                ) : (
                                    <>
                                        <Locate className="w-3.5 h-3.5" />
                                        <span>Free Pan</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Interactive Leaflet Map Container */}
                    <div className="h-[620px] w-full border border-neutral-200 dark:border-geist-hairline rounded overflow-hidden relative">
                        <MapErrorBoundary>
                            <MapContainer
                                key="overview-interactive-map"
                                center={mapCenter}
                                zoom={hasSimCoords ? 10 : 5}
                                preferCanvas={true}
                                style={{ height: "100%", width: "100%" }}
                                className={theme === "dark" ? "dark-tiles" : ""}
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                                    url="https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                    maxZoom={19}
                                />

                                {/* Recorded Flight Path Trail */}
                                {activeFlight && flightPath.length > 1 && (
                                    <Polyline
                                        positions={flightPath}
                                        color="#3b82f6"
                                        weight={3.5}
                                        opacity={0.85}
                                    />
                                )}

                                {/* Live Aircraft Marker */}
                                {hasSimCoords && (
                                    <Marker
                                        position={[
                                            currentTelemetry.latitude,
                                            currentTelemetry.longitude,
                                        ]}
                                        icon={createPlaneIcon(
                                            currentTelemetry.heading,
                                            theme === "dark",
                                        )}
                                    />
                                )}

                                {/* Airport Markers Layer (Only shown when not recording a flight) */}
                                {!activeFlight &&
                                    validAirports.map((apt, idx) => (
                                        <CircleMarker
                                            key={`apt-${apt.icao}-${idx}`}
                                            center={[apt.latitude, apt.longitude]}
                                            radius={3.5}
                                            pathOptions={{
                                                color:
                                                    theme === "dark"
                                                        ? "#38bdf8"
                                                        : "#0284c7",
                                                fillColor:
                                                    theme === "dark"
                                                        ? "#0284c7"
                                                        : "#38bdf8",
                                                fillOpacity: 0.75,
                                                weight: 1.5,
                                            }}
                                            eventHandlers={{
                                                click: () => {
                                                    setSelectedMapAirport(apt);
                                                },
                                            }}
                                        />
                                    ))}

                                {/* Single Active Popup for clicked airport marker */}
                                {!activeFlight && selectedMapAirport && (
                                    <Popup
                                        position={[
                                            selectedMapAirport.latitude,
                                            selectedMapAirport.longitude,
                                        ]}
                                        eventHandlers={{
                                            remove: () => setSelectedMapAirport(null),
                                        }}
                                        minWidth={320}
                                        maxWidth={380}
                                        maxHeight={360}
                                        className="custom-airport-popup"
                                    >
                                        <AirportPopupContent
                                            airport={selectedMapAirport}
                                            onSelectForWeather={(icao) => {
                                                setSearchIcao(icao);
                                                handleSearchWeather(icao);
                                            }}
                                            onSelectAirportInfo={(icao) => {
                                                handleSelectAirportInfo(
                                                    icao,
                                                    true,
                                                );
                                            }}
                                        />
                                    </Popup>
                                )}

                                {/* Auto follow controller */}
                                <MapFollowController
                                    lat={currentTelemetry.latitude}
                                    lon={currentTelemetry.longitude}
                                    isFollow={isFollow}
                                />

                                {/* Safe window resize invalidation */}
                                <MapResizeHandler />
                            </MapContainer>
                        </MapErrorBoundary>

                        {/* Status Overlay */}
                        <div className="absolute bottom-3 left-3 z-[400] bg-white/90 dark:bg-black/85 backdrop-blur-xs px-2.5 py-1 rounded text-[11px] border border-neutral-200 dark:border-geist-hairline shadow-xs flex items-center gap-2">
                            <span
                                className={`w-2 h-2 rounded-full ${
                                    currentTelemetry.simConnected
                                        ? "bg-emerald-500"
                                        : "bg-neutral-400"
                                }`}
                            />
                            <span>
                                {currentTelemetry.simConnected
                                    ? `MSFS: ${currentTelemetry.aircraftTitle || "Connected"}`
                                    : "MSFS Standby"}
                            </span>
                            {activeFlight && (
                                <span className="font-semibold text-red-600 dark:text-red-400 ml-1">
                                    • Recording {activeFlight.departureIcao} ➔{" "}
                                    {activeFlight.arrivalIcao}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
