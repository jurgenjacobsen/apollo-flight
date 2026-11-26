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
import { ARCGIS_WORLD_IMAGERY_ATTRIBUTION, ARCGIS_WORLD_IMAGERY_URL } from "../../utils/mapTiles";
import {
    useFlightStore,
    safeInvoke,
} from "../../store/flightStore";
import { useSmoothedTelemetry } from "../../hooks/useSmoothedTelemetry";
import { formatPitchParts, formatRollParts } from "../../utils/flightFormatters";
import { Airport, Runway } from "../../types/flight";
import { LiveTrafficAircraft, LiveTrafficSource } from "../../types/traffic";
import { fetchLiveTraffic } from "../../services/trafficService";
import { FALLBACK_AIRPORTS } from "../../data/fallbackAirports";
import { Checkbox, Tooltip } from "../ui";
import {
    TelemetryChart,
    TelemetryChartPoint,
    DragSelectionState,
} from "../flight-detail/TelemetryChart";
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
    Radio,
} from "lucide-react";

function formatLengthValue(lengthFt: number, unit: "ft" | "m"): string {
    if (unit === "m") {
        return `${Math.round(lengthFt * 0.3048).toLocaleString()} m`;
    }
    return `${lengthFt.toLocaleString()} ft`;
}

// --- Leaflet Plane Icon & Controller ---

function createPlaneIcon(heading: number, isDark: boolean) {
    const safeHeading =
        typeof heading === "number" && !isNaN(heading) ? heading : 0;
    const color = isDark ? "#52ab29" : "#52ab29";
    const svgHtml = `
        <div style="transform: rotate(${safeHeading}deg); transform-origin: center center; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
            <svg viewBox="0 0 24 24" width="26" height="26" stroke="${"rgba(0,0,0,0.75)"}" stroke-width="1.5" fill="${color}" fill-opacity="1" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 20 21 12 17 4 21 12 2" />
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

function createTrafficPlaneIcon(heading: number, isDark: boolean) {
    const safeHeading =
        typeof heading === "number" && !isNaN(heading) ? heading : 0;
    const color = isDark ? "#3F6CEE" : "#3F6CEE";
    const svgHtml = `
        <div style="transform: rotate(${safeHeading}deg); transform-origin: center center; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="${"rgba(0,0,0,0.5)"}" stroke-width="1.8" fill="${color}" fill-opacity="1" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));">
                <polygon points="12 2 20 21 12 17 4 21 12 2" />
            </svg>
        </div>
    `;

    return L.divIcon({
        html: svgHtml,
        className: "traffic-marker-icon",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
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

interface MapViewport {
    north: number;
    south: number;
    east: number;
    west: number;
    zoom: number;
}

const MapViewportTracker: React.FC<{
    onViewportChange: (vp: MapViewport) => void;
}> = ({ onViewportChange }) => {
    const map = useMap();

    useEffect(() => {
        const update = () => {
            try {
                const bounds = map.getBounds();
                const latSpan = bounds.getNorth() - bounds.getSouth();
                const lngSpan = bounds.getEast() - bounds.getWest();
                const latPad = latSpan * 0.1;
                const lngPad = lngSpan * 0.1;

                onViewportChange({
                    north: bounds.getNorth() + latPad,
                    south: bounds.getSouth() - latPad,
                    east: bounds.getEast() + lngPad,
                    west: bounds.getWest() - lngPad,
                    zoom: map.getZoom(),
                });
            } catch {}
        };

        update();
        map.on("moveend", update);
        map.on("zoomend", update);
        return () => {
            map.off("moveend", update);
            map.off("zoomend", update);
        };
    }, [map, onViewportChange]);

    return null;
};

const AirportMarkersLayer = React.memo<{
    airports: Airport[];
    isDark: boolean;
    onSelectAirport: (apt: Airport) => void;
}>(({ airports, isDark, onSelectAirport }) => {
    const pathOptions = useMemo(
        () => ({
            color: isDark ? "#d4d4d4" : "#404040",
            fillColor: isDark ? "#888888" : "#737373",
            fillOpacity: 0.85,
            weight: 1.25,
        }),
        [isDark],
    );

    return (
        <>
            {airports.map((apt) => (
                <CircleMarker
                    key={`apt-${apt.icao}`}
                    center={[apt.latitude, apt.longitude]}
                    radius={2.75}
                    pathOptions={pathOptions}
                    eventHandlers={{
                        click: () => onSelectAirport(apt),
                    }}
                />
            ))}
        </>
    );
});

const LiveTrafficMarkersLayer = React.memo<{
    aircraft: LiveTrafficAircraft[];
    isDark: boolean;
    onSelectTraffic: (ac: LiveTrafficAircraft) => void;
}>(({ aircraft, isDark, onSelectTraffic }) => {
    return (
        <>
            {aircraft.map((ac) => (
                <Marker
                    key={ac.id}
                    position={[ac.latitude, ac.longitude]}
                    icon={createTrafficPlaneIcon(ac.headingDeg, isDark)}
                    eventHandlers={{
                        click: () => onSelectTraffic(ac),
                    }}
                />
            ))}
        </>
    );
});

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
    const typeLabel = airport.airportType
        ? airport.airportType.replace(/_airport$/i, "").replace(/_/g, " ")
        : "airport";
    const location = [airport.municipality, airport.countryName]
        .filter(Boolean)
        .join(", ");

    return (
        <div className="text-xs font-sans space-y-1.5 min-w-[220px] px-1 text-neutral-900 dark:text-neutral-100">
            <div className="flex items-center justify-between gap-3 pb-1.5 pr-6 border-b border-neutral-200 dark:border-geist-hairline">
                <span className="font-mono font-bold text-neutral-900 dark:text-white">
                    {airport.icao}
                </span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded-sm bg-neutral-100 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 shrink-0">
                    {typeLabel}
                </span>
            </div>

            <div className="space-y-0.5">
                <div
                    className="font-semibold text-neutral-900 dark:text-white truncate"
                    title={airport.name}
                >
                    {airport.name}
                </div>
                {location && (
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {location}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-neutral-600 dark:text-neutral-300 tabular-nums">
                {typeof airport.elevationFt === "number" && (
                    <div>
                        Elev:{" "}
                        <strong className="text-neutral-900 dark:text-white">
                            {airport.elevationFt.toLocaleString()} ft
                        </strong>
                    </div>
                )}
                <div>
                    Pos:{" "}
                    <strong className="text-neutral-900 dark:text-white">
                        {airport.latitude.toFixed(2)}, {airport.longitude.toFixed(2)}
                    </strong>
                </div>
            </div>

            {(onSelectAirportInfo || onSelectForWeather) && (
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-200/70 dark:border-geist-hairline/70 text-[10px]">
                    {onSelectAirportInfo && (
                        <Tooltip content="View detailed specs and all runways in panel">
                            <button
                                type="button"
                                onClick={() => onSelectAirportInfo(airport.icao)}
                                className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 font-semibold underline cursor-pointer"
                            >
                                View Details →
                            </button>
                        </Tooltip>
                    )}
                    {onSelectForWeather && (
                        <button
                            type="button"
                            onClick={() => onSelectForWeather(airport.icao)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline cursor-pointer ml-auto"
                        >
                            Weather →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Main Overview Component ---

export const Overview: React.FC = () => {
    const {
        currentTelemetry: rawTelemetry,
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
        lengthUnit,
        windSpeedUnit,
        temperatureUnit,
        visibilityUnit,
        setActiveView,
        liveTrafficNetwork,
        setLiveTrafficNetwork,
        devShowTestAircraftOnMap,
    } = useFlightStore();
    const currentTelemetry = useSmoothedTelemetry(rawTelemetry);

    const [zoomTimeRange, setZoomTimeRange] = useState<{
        start: number;
        end: number;
    } | null>(null);
    const [dragSelection, setDragSelection] =
        useState<DragSelectionState | null>(null);
    const [, setOverviewScrubIndex] = useState<number | null>(null);

    const liveChartData = useMemo<TelemetryChartPoint[]>(() => {
        const pts = activeFlight?.telemetryPoints;
        if (!pts || pts.length === 0) return [];

        const mapped = pts.map((pt, idx) => ({
            pointIndex: idx,
            time: pt.timestamp,
            altitude: Math.round(pt.altitudeMsl),
            groundSpeed: Math.round(pt.groundSpeed),
            windSpeed: pt.windSpeed,
            windDirection: pt.windDirection,
            heading: pt.heading,
            oat: pt.oat,
            tat: pt.tat,
            visibility: pt.visibility,
        }));

        if (!zoomTimeRange) return mapped;
        return mapped.filter((p) => {
            const ts = new Date(p.time).getTime();
            return ts >= zoomTimeRange.start && ts <= zoomTimeRange.end;
        });
    }, [activeFlight?.telemetryPoints, zoomTimeRange]);

    // Map controls & layer data
    const [isFollow, setIsFollow] = useState(true);
    const [allAirports, setAllAirports] = useState<Airport[]>([]);
    const [isLoadingAirports, setIsLoadingAirports] = useState(false);
    const [selectedMapAirport, setSelectedMapAirport] = useState<Airport | null>(null);
    const [mapViewport, setMapViewport] = useState<MapViewport | null>(null);
    const [liveTrafficAircraft, setLiveTrafficAircraft] = useState<LiveTrafficAircraft[]>([]);
    const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);
    const [trafficError, setTrafficError] = useState<string | null>(null);
    const [selectedTrafficAircraft, setSelectedTrafficAircraft] =
        useState<LiveTrafficAircraft | null>(null);
    const lastTrafficNetworkRef = useRef<LiveTrafficSource>(
        liveTrafficNetwork !== "off" ? liveTrafficNetwork : "vatsim",
    );

    useEffect(() => {
        if (liveTrafficNetwork !== "off") {
            lastTrafficNetworkRef.current = liveTrafficNetwork;
        }
    }, [liveTrafficNetwork]);

    useEffect(() => {
        if (liveTrafficNetwork === "off") {
            setLiveTrafficAircraft([]);
            setTrafficError(null);
            setIsLoadingTraffic(false);
            setSelectedTrafficAircraft(null);
            return;
        }

        let isCancelled = false;
        let activeController: AbortController | null = null;

        const loadTraffic = async () => {
            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            setIsLoadingTraffic(true);
            try {
                const res = await fetchLiveTraffic(liveTrafficNetwork, {
                    signal: controller.signal,
                });
                if (!isCancelled) {
                    setLiveTrafficAircraft(res.aircraft);
                    setTrafficError(null);
                }
            } catch (err) {
                if (!isCancelled && !(err instanceof DOMException && err.name === "AbortError")) {
                    setTrafficError(
                        err instanceof Error ? err.message : "Failed to fetch live traffic",
                    );
                }
            } finally {
                if (!isCancelled) {
                    setIsLoadingTraffic(false);
                }
            }
        };

        void loadTraffic();
        const intervalId = window.setInterval(() => {
            void loadTraffic();
        }, 15000);

        return () => {
            isCancelled = true;
            activeController?.abort();
            window.clearInterval(intervalId);
        };
    }, [liveTrafficNetwork]);

    const handleViewportChange = useCallback((vp: MapViewport) => {
        setMapViewport(vp);
    }, []);

    const handleSelectMapAirport = useCallback((apt: Airport) => {
        setSelectedTrafficAircraft(null);
        setSelectedMapAirport(apt);
    }, []);

    const handleSelectTrafficAircraft = useCallback((ac: LiveTrafficAircraft) => {
        setSelectedMapAirport(null);
        setSelectedTrafficAircraft(ac);
    }, []);

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
            setWeatherError(null);
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
        setWeatherError(null);
        const target = (icaoToQuery || searchIcao).trim().toUpperCase();
        if (!target) return;
        setSearchIcao(target);
        setWeatherLoading(true);

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

    const showUserAircraft = hasSimCoords || devShowTestAircraftOnMap;
    const userAircraftLat = hasSimCoords ? currentTelemetry.latitude : 47.2602;
    const userAircraftLon = hasSimCoords ? currentTelemetry.longitude : 11.344;
    const userAircraftHeading = hasSimCoords ? currentTelemetry.heading : 260;

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
            }
        }
        return res;
    }, [allAirports]);

    // Viewport-bounds and zoom-level culled airports to avoid uncapped marker reconciliation
    const visibleAirports = useMemo(() => {
        if (validAirports.length === 0) return [];
        if (!mapViewport) {
            return validAirports.slice(0, 350);
        }

        const { north, south, east, west, zoom } = mapViewport;
        const maxMarkers = zoom < 5 ? 350 : zoom < 7 ? 600 : 1000;
        const result: Airport[] = [];

        for (const apt of validAirports) {
            if (
                apt.latitude < south ||
                apt.latitude > north ||
                apt.longitude < west ||
                apt.longitude > east
            ) {
                continue;
            }

            if (zoom < 5 && apt.airportType && apt.airportType !== "large_airport") {
                continue;
            }
            if (
                zoom >= 5 &&
                zoom < 7 &&
                apt.airportType &&
                apt.airportType !== "large_airport" &&
                apt.airportType !== "medium_airport"
            ) {
                continue;
            }

            result.push(apt);
            if (result.length >= maxMarkers) break;
        }

        return result;
    }, [validAirports, mapViewport]);

    const visibleTraffic = useMemo(() => {
        if (liveTrafficNetwork === "off" || liveTrafficAircraft.length === 0) {
            return [];
        }

        const zoom = mapViewport?.zoom ?? 5;
        // At zoom >= 7 show all aircraft in the current viewport; when zoomed out,
        // declutter spatially by view scale instead of capping at a fixed count.
        const cellDeg =
            zoom >= 7 ? 0 : zoom >= 6 ? 0.4 : zoom >= 5 ? 1 : zoom >= 4 ? 2 : 4;
        const seenCells = cellDeg > 0 ? new Set<string>() : null;
        const result: LiveTrafficAircraft[] = [];

        for (const ac of liveTrafficAircraft) {
            if (mapViewport) {
                if (
                    ac.latitude < mapViewport.south ||
                    ac.latitude > mapViewport.north ||
                    ac.longitude < mapViewport.west ||
                    ac.longitude > mapViewport.east
                ) {
                    continue;
                }
            }

            if (seenCells) {
                const cellKey = `${Math.floor(ac.latitude / cellDeg)}:${Math.floor(ac.longitude / cellDeg)}`;
                if (seenCells.has(cellKey)) continue;
                seenCells.add(cellKey);
            }

            result.push(ac);
        }
        return result;
    }, [liveTrafficNetwork, liveTrafficAircraft, mapViewport]);

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
                return "text-neutral-900 dark:text-white bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline";
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* ALTITUDE */}
                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium pb-2">
                        <span>Altitude</span>
                        <Gauge className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="px-3 py-1.5 rounded-sm border min-h-[42px] flex items-center justify-between gap-2 text-lg sm:text-xl font-semibold tabular-nums tracking-tight truncate text-neutral-900 dark:text-white bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline">
                        {currentTelemetry.simConnected ? (
                            <>
                                <span className="truncate">{currentTelemetry.altitudeMsl.toLocaleString()}</span>
                                <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted shrink-0">ft</span>
                            </>
                        ) : (
                            "-"
                        )}
                    </div>
                </div>

                {/* GROUND SPEED */}
                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium pb-2">
                        <span>Ground Speed</span>
                        <Wind className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="px-3 py-1.5 rounded-sm border min-h-[42px] flex items-center justify-between gap-2 text-lg sm:text-xl font-semibold tabular-nums tracking-tight truncate text-neutral-900 dark:text-white bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline">
                        {currentTelemetry.simConnected ? (
                            <>
                                <span className="truncate">{currentTelemetry.groundSpeed}</span>
                                <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted shrink-0">kt</span>
                            </>
                        ) : (
                            "-"
                        )}
                    </div>
                </div>

                {/* HEADING */}
                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium pb-2">
                        <span>Heading</span>
                        <Compass className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="px-3 py-1.5 rounded-sm border min-h-[42px] flex items-center text-lg sm:text-xl font-semibold tabular-nums tracking-tight truncate text-neutral-900 dark:text-white bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline">
                        {currentTelemetry.simConnected
                            ? `${String(Math.round(currentTelemetry.heading)).padStart(3, "0")}°`
                            : "-"}
                    </div>
                </div>

                {/* VERTICAL SPEED */}
                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium pb-2">
                        <span>Vertical Speed</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="px-3 py-1.5 rounded-sm border min-h-[42px] flex items-center justify-between gap-2 text-lg sm:text-xl font-semibold tabular-nums tracking-tight truncate text-neutral-900 dark:text-white bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline">
                        {currentTelemetry.simConnected ? (
                            <>
                                <span className="truncate">
                                    {currentTelemetry.verticalSpeed > 0
                                        ? `+${currentTelemetry.verticalSpeed}`
                                        : currentTelemetry.verticalSpeed}
                                </span>
                                <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted shrink-0">fpm</span>
                            </>
                        ) : (
                            "-"
                        )}
                    </div>
                </div>

                {/* ATTITUDE */}
                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium pb-2">
                        <span>Attitude</span>
                        <Navigation className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="px-2.5 py-1.5 rounded-sm border min-h-[42px] flex items-center text-xs sm:text-sm font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline">
                        {currentTelemetry.simConnected ? (() => {
                            const pitchParts = formatPitchParts(currentTelemetry.pitch);
                            const rollParts = formatRollParts(currentTelemetry.bank, false);
                            return (
                                <div className="w-full grid grid-cols-2 divide-x divide-neutral-300 dark:divide-neutral-700">
                                    <div className="flex items-center justify-between gap-1 pr-2 min-w-0">
                                        <span className="truncate">{pitchParts.angle}</span>
                                        <span className="text-[11px] font-normal text-neutral-500 dark:text-geist-muted shrink-0">
                                            {pitchParts.direction ?? ""}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-1 pl-2 min-w-0">
                                        <span className="truncate">{rollParts.angle}</span>
                                        <span className="text-[11px] font-normal text-neutral-500 dark:text-geist-muted shrink-0">
                                            {rollParts.direction ?? ""}
                                        </span>
                                    </div>
                                </div>
                            );
                        })() : (
                            "-"
                        )}
                    </div>
                </div>

                {/* STAGE */}
                <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium pb-2">
                        <span>Flight Stage</span>
                        <Activity className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div
                        className={`px-3 py-1.5 rounded-sm border min-h-[42px] flex items-center text-xs font-semibold uppercase tracking-wider truncate ${getStageColor(
                            flightStage,
                        )}`}
                    >
                        {flightStage.replace(/_/g, " ")}
                    </div>
                </div>
            </div>

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left Column: Flight Control + Weather Information */}
                <div className="lg:col-span-4 space-y-4">
                    {/* Flight Control Section */}
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <PlaneTakeoff className="w-4 h-4 text-neutral-600 dark:text-neutral-400 shrink-0" />
                                <h2 className="text-xs font-semibold tracking-wider text-neutral-800 dark:text-neutral-200">
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
                                    <div className="p-2.5 rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-neutral-500 dark:text-geist-muted">
                                                Departure Aerodrome
                                            </span>
                                            <span className="font-medium text-neutral-900 dark:text-white">
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
                                    <div className="flex items-center justify-between p-2.5 rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs">
                                        <span className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                                            Simulator Status
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-geist-hairline">
                                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                                            MSFS Disconnected
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-0.5">
                                    <Checkbox
                                        checked={autoStartRecording}
                                        onChange={setAutoStartRecording}
                                        label="Auto-start flight recording"
                                    />
                                </div>

                                <Tooltip
                                    content={
                                        currentTelemetry.simConnected
                                            ? "Manually begin recording a flight log"
                                            : "Simulator disconnected. Launch MSFS & FSUIPC7 to start recording."
                                    }
                                >
                                    <span className="inline-flex w-full">
                                        <button
                                            type="button"
                                            disabled={!currentTelemetry.simConnected}
                                            onClick={() => {
                                                if (!currentTelemetry.simConnected)
                                                    return;
                                                startManualFlight(
                                                    nearestAirport?.icao || "ORIG",
                                                    "DEST",
                                                    currentTelemetry.aircraftTitle &&
                                                        currentTelemetry.aircraftTitle !==
                                                            "Standby (Waiting for MSFS)"
                                                        ? currentTelemetry.aircraftTitle
                                                        : "MSFS Aircraft",
                                                );
                                            }}
                                            className="w-full flex items-center justify-center gap-2 bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black text-xs py-2 px-3 rounded-sm font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-default"
                                        >
                                            <Play className="w-3.5 h-3.5 fill-current disabled:text-emerald-500 dark:text-emerald-600" />
                                            <span>Start Recording Flight</span>
                                        </button>
                                    </span>
                                </Tooltip>
                            </div>
                        )}
                    </div>

                    {/* Airport Information Section */}
                    <div
                        ref={airportSectionRef}
                        className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-4 scroll-mt-4"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-neutral-600 dark:text-neutral-400 shrink-0" />
                                <h2 className="text-xs font-semibold tracking-wider text-neutral-800 dark:text-neutral-200">
                                    Airport Information
                                </h2>
                            </div>
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
                                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>

                            <Tooltip
                                content={
                                    !airportSearchIcao.trim()
                                        ? "Enter a 4-letter ICAO code first"
                                        : "Look up airport details and runway data"
                                }
                            >
                                <span className="inline-flex shrink-0">
                                    <button
                                        type="button"
                                        disabled={
                                            airportDetailsLoading ||
                                            !airportSearchIcao.trim()
                                        }
                                        onClick={() => handleSelectAirportInfo()}
                                        className="px-3 py-1.5 text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-sm transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer disabled:cursor-default"
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
                                </span>
                            </Tooltip>
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
                            <div className="p-4 text-center rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs text-neutral-500">
                                Loading aerodrome specifications...
                            </div>
                        ) : selectedAirportDetails ? (
                            <div className="space-y-2 pt-0">
                                {/* Name and Country Header */}
                                <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono font-bold bg-neutral-900 text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded-sm text-xs">
                                                {selectedAirportDetails.icao}
                                            </span>
                                            <span className="font-semibold text-xs text-neutral-900 dark:text-white truncate">
                                                {selectedAirportDetails.name}
                                            </span>
                                        </div>
                                        {selectedAirportDetails.airportType && (
                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 shrink-0 capitalize">
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
                                    <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
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

                                    <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
                                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-medium">
                                            Longest Runway
                                        </span>
                                        <div className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                            {selectedAirportDetails.maxRunwayLengthFt !=
                                            null
                                                ? formatLengthValue(
                                                      selectedAirportDetails.maxRunwayLengthFt,
                                                      lengthUnit,
                                                  )
                                                : "—"}
                                        </div>
                                    </div>

                                    <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
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

                                    <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline space-y-0.5">
                                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-medium">
                                            Coordinates
                                        </span>
                                        <div className="font-semibold text-neutral-900 dark:text-white tabular-nums">
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
                            </div>
                        ) : (
                            <div className="p-4 text-center rounded-sm bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline text-xs text-neutral-500">
                                Search an aerodrome ICAO above or click any
                                marker on the map to inspect full aerodrome
                                specs and runways.
                            </div>
                        )}
                    </div>

                    {/* Weather Information Section */}
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CloudRain className="w-4 h-4 text-neutral-600 dark:text-neutral-400 shrink-0" />
                                <h2 className="text-xs font-semibold tracking-wider text-neutral-800 dark:text-neutral-200">
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
                                    onChange={(e) => {
                                        setSearchIcao(e.target.value.toUpperCase());
                                        if (weatherError) setWeatherError(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSearchWeather();
                                    }}
                                    placeholder="Enter Airport ICAO (e.g. KJFK, EGLL, LOWI)"
                                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono uppercase bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline rounded-sm focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                                />
                                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>

                            <Tooltip
                                content={
                                    !searchIcao.trim()
                                        ? "Enter a 4-letter ICAO code first"
                                        : "Fetch live METAR & TAF weather"
                                }
                            >
                                <span className="inline-flex shrink-0">
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
                                </span>
                            </Tooltip>
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
                            <div className="p-2 rounded-sm text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300">
                                {weatherError}
                            </div>
                        )}

                        {weatherData && (
                            <div className="space-y-2 pt-0">
                                {/* METAR Block */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                                            METAR - Meteorological Aerodrome Report
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
                                    <pre className="p-2 rounded-sm bg-neutral-100 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline font-mono text-xs whitespace-pre-wrap break-words text-neutral-900 dark:text-neutral-100">
                                        {weatherData.metar || "No METAR reported for this station"}
                                    </pre>
                                </div>

                                {/* TAF Block */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                                            TAF - Terminal Aerodrome Forecast
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
                                    <pre className="p-2 rounded-sm bg-neutral-100 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline font-mono text-xs whitespace-pre-wrap break-words text-neutral-900 dark:text-neutral-100 max-h-48 overflow-y-auto">
                                        {weatherData.taf || "No TAF forecast available for this aerodrome"}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Interactive Map & Live Telemetry Graph */}
                <div className="lg:col-span-8 space-y-4">
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-neutral-600 dark:text-neutral-400 shrink-0" />
                            <h2 className="text-xs font-semibold tracking-wider text-neutral-800 dark:text-neutral-200">
                                Map
                            </h2>
                        </div>

                        <div className="flex items-center gap-2">
                            <Tooltip
                                placement="bottom"
                                content={
                                    liveTrafficNetwork === "off"
                                        ? `Show Live Traffic (${lastTrafficNetworkRef.current.toUpperCase()})`
                                        : trafficError
                                          ? `Live Traffic (${liveTrafficNetwork.toUpperCase()}) error: ${trafficError}`
                                          : `Live Traffic: ${liveTrafficNetwork.toUpperCase()} · Click to hide`
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        void setLiveTrafficNetwork(
                                            liveTrafficNetwork === "off"
                                                ? lastTrafficNetworkRef.current
                                                : "off",
                                        )
                                    }
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs border transition-colors ${
                                        liveTrafficNetwork !== "off"
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white font-medium shadow-xs"
                                            : "bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1a1a1a] dark:hover:bg-[#252525] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-geist-hairline"
                                    }`}
                                >
                                    {isLoadingTraffic ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Radio className="w-3.5 h-3.5" />
                                    )}
                                    <span>
                                        {liveTrafficNetwork !== "off"
                                            ? `Live Traffic`
                                            : "Live Traffic"}
                                    </span>
                                </button>
                            </Tooltip>

                            <Tooltip
                                placement="bottom"
                                content={
                                    isFollow
                                        ? "Follow Plane (Enabled)"
                                        : "Free Pan (Disabled)"
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() => setIsFollow(!isFollow)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs border transition-colors ${
                                        isFollow
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white font-medium shadow-xs"
                                            : "bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1a1a1a] dark:hover:bg-[#252525] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-geist-hairline"
                                    }`}
                                >
                                    {isFollow ? (
                                        <>
                                            <LocateFixed className="w-3.5 h-3.5" />
                                            <span>Following</span>
                                        </>
                                    ) : (
                                        <>
                                            <Locate className="w-3.5 h-3.5" />
                                            <span>Free Pan</span>
                                        </>
                                    )}
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Interactive Leaflet Map Container */}
                    <div className="h-[425px] w-full border border-neutral-200 dark:border-geist-hairline rounded-sm overflow-hidden relative">
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
                                    attribution={ARCGIS_WORLD_IMAGERY_ATTRIBUTION}
                                    url={ARCGIS_WORLD_IMAGERY_URL}
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

                                {/* Live / Test User Aircraft Marker */}
                                {showUserAircraft && (
                                    <Marker
                                        position={[
                                            userAircraftLat,
                                            userAircraftLon,
                                        ]}
                                        icon={createPlaneIcon(
                                            userAircraftHeading,
                                            theme === "dark",
                                        )}
                                    />
                                )}

                                {/* Airport Markers Layer (Only shown when not recording a flight) */}
                                {!activeFlight && (
                                    <AirportMarkersLayer
                                        airports={visibleAirports}
                                        isDark={theme === "dark"}
                                        onSelectAirport={handleSelectMapAirport}
                                    />
                                )}

                                {/* Live Traffic Markers Layer */}
                                {liveTrafficNetwork !== "off" && (
                                    <LiveTrafficMarkersLayer
                                        aircraft={visibleTraffic}
                                        isDark={theme === "dark"}
                                        onSelectTraffic={handleSelectTrafficAircraft}
                                    />
                                )}

                                {/* Single Active Popup for clicked live traffic aircraft */}
                                {liveTrafficNetwork !== "off" &&
                                    selectedTrafficAircraft && (
                                        <Popup
                                            position={[
                                                selectedTrafficAircraft.latitude,
                                                selectedTrafficAircraft.longitude,
                                            ]}
                                            eventHandlers={{
                                                remove: () =>
                                                    setSelectedTrafficAircraft(null),
                                            }}
                                            minWidth={240}
                                            maxWidth={300}
                                            className="custom-airport-popup"
                                        >
                                            <div className="text-xs font-sans space-y-1.5 min-w-[220px] px-1">
                                                <div className="flex items-center justify-between gap-3 pb-1.5 pr-6 border-b border-neutral-200 dark:border-geist-hairline">
                                                    <span className="font-mono font-bold text-neutral-900 dark:text-white">
                                                        {selectedTrafficAircraft.callsign}
                                                    </span>
                                                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded-sm bg-neutral-100 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                                                        {selectedTrafficAircraft.network}
                                                    </span>
                                                </div>
                                                {(selectedTrafficAircraft.departureIcao ||
                                                    selectedTrafficAircraft.arrivalIcao) && (
                                                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                                                        <span>
                                                            {selectedTrafficAircraft.departureIcao ||
                                                                "----"}
                                                        </span>
                                                        <span className="text-neutral-400">
                                                            ➔
                                                        </span>
                                                        <span>
                                                            {selectedTrafficAircraft.arrivalIcao ||
                                                                "----"}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-neutral-600 dark:text-neutral-300 tabular-nums">
                                                    <div>
                                                        Alt:{" "}
                                                        <strong className="text-neutral-900 dark:text-white">
                                                            {Math.round(
                                                                selectedTrafficAircraft.altitudeFt,
                                                            ).toLocaleString()}{" "}
                                                            ft
                                                        </strong>
                                                    </div>
                                                    <div>
                                                        GS:{" "}
                                                        <strong className="text-neutral-900 dark:text-white">
                                                            {Math.round(
                                                                selectedTrafficAircraft.groundSpeedKt,
                                                            )}{" "}
                                                            kt
                                                        </strong>
                                                    </div>
                                                    <div>
                                                        HDG:{" "}
                                                        <strong className="text-neutral-900 dark:text-white">
                                                            {Math.round(
                                                                selectedTrafficAircraft.headingDeg,
                                                            )}
                                                            °
                                                        </strong>
                                                    </div>
                                                    {selectedTrafficAircraft.aircraftType && (
                                                        <div className="truncate">
                                                            Type:{" "}
                                                            <strong className="text-neutral-900 dark:text-white">
                                                                {
                                                                    selectedTrafficAircraft.aircraftType
                                                                }
                                                            </strong>
                                                        </div>
                                                    )}
                                                </div>
                                                {selectedTrafficAircraft.pilotName && (
                                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate pt-0.5">
                                                        Pilot: {selectedTrafficAircraft.pilotName}
                                                    </div>
                                                )}
                                            </div>
                                        </Popup>
                                    )}

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
                                        minWidth={240}
                                        maxWidth={300}
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
                                    lat={userAircraftLat}
                                    lon={userAircraftLon}
                                    isFollow={isFollow && showUserAircraft}
                                />

                                {/* Safe window resize invalidation & viewport tracking */}
                                <MapResizeHandler />
                                <MapViewportTracker onViewportChange={handleViewportChange} />
                            </MapContainer>
                        </MapErrorBoundary>
                    </div>
                    </div>

                    <TelemetryChart
                        chartData={liveChartData}
                        zoomTimeRange={zoomTimeRange}
                        setZoomTimeRange={setZoomTimeRange}
                        dragSelection={dragSelection}
                        setDragSelection={setDragSelection}
                        setScrubbedTelemetryIndex={setOverviewScrubIndex}
                        isHeavyReady={true}
                        isLoadingFlightDetails={false}
                        theme={theme}
                        windSpeedUnit={windSpeedUnit}
                        temperatureUnit={temperatureUnit}
                        visibilityUnit={visibilityUnit}
                    />
                </div>
            </div>
        </div>
    );
};
