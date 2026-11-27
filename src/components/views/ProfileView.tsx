import React, { useState, useMemo, useEffect } from "react";
import { useFlightStore } from "../../store/flightStore";
import { Tooltip } from "../ui";
import { ARCGIS_WORLD_IMAGERY_ATTRIBUTION, ARCGIS_WORLD_IMAGERY_URL } from "../../utils/mapTiles";
import {
    MapContainer,
    TileLayer,
    CircleMarker,
    Popup,
    GeoJSON,
    Polyline,
    Tooltip as LeafletTooltip,
} from "react-leaflet";
import {
    Globe2,
    MapPin,
    Plane,
    Award,
    Search,
    Layers,
    ShieldCheck,
    Loader2,
    User,
    Clock,
    Compass,
    PlaneTakeoff,
    PlaneLanding,
    Mountain,
    Navigation,
    Milestone,
    Send,
    Globe,
    ShieldAlert,
    Feather,
    Sparkles,
    History,
    Crown,
    CheckCircle2,
    Lock,
    BarChart3,
    TrendingUp,
    Gauge,
    Activity,
    ArrowUpRight,
    Route as RouteIcon,
} from "lucide-react";
import type { FlightRecord, VisitedAirport, VisitedCountry } from "../../types/flight";
import { ACHIEVEMENTS } from "../../data/achievements";
import type { AchievementCategory, AchievementUserData } from "../../types/achievement";

let cachedCountriesGeoJson: any = null;
let preloadPromise: Promise<any> | null = null;

export function preloadCountriesGeoJson(): Promise<any> {
    if (cachedCountriesGeoJson) return Promise.resolve(cachedCountriesGeoJson);
    if (preloadPromise) return preloadPromise;

    preloadPromise = fetch("/ne_110m_countries.geojson")
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((data) => {
            cachedCountriesGeoJson = data;
            return data;
        })
        .catch((err) => {
            console.warn(
                "Could not load ne_110m_countries.geojson, falling back to /countries.geojson:",
                err,
            );
            return fetch("/countries.geojson")
                .then((res) => res.json())
                .then((fallbackData) => {
                    cachedCountriesGeoJson = fallbackData;
                    return fallbackData;
                })
                .catch((fallbackErr) => {
                    console.error(
                        "Failed to preload country boundaries:",
                        fallbackErr,
                    );
                    return null;
                });
        });

    return preloadPromise;
}

const getFeatureIso = (props: Record<string, any>): string => {
    if (!props) return "";
    const code =
        props["ISO3166-1-Alpha-2"] ||
        props.ISO_A2_EH ||
        (props.ISO_A2 !== "-99" ? props.ISO_A2 : null) ||
        props.WB_A2 ||
        props.POSTAL;
    if (code && typeof code === "string" && code.length === 2) {
        return code.toUpperCase();
    }
    return "";
};

const getFeatureName = (props: Record<string, any>): string => {
    if (!props) return "";
    return (
        props.name || props.NAME || props.NAME_LONG || props.ADMIN || "Unknown"
    );
};

const renderBadgeIcon = (iconName: string, className: string) => {
    switch (iconName) {
        case "PlaneTakeoff":
            return <PlaneTakeoff className={className} />;
        case "Mountain":
            return <Mountain className={className} />;
        case "Globe2":
            return <Globe2 className={className} />;
        case "Compass":
            return <Compass className={className} />;
        case "Navigation":
            return <Navigation className={className} />;
        case "MapPin":
            return <MapPin className={className} />;
        case "Award":
            return <Award className={className} />;
        case "Layers":
            return <Layers className={className} />;
        case "Milestone":
            return <Milestone className={className} />;
        case "Send":
            return <Send className={className} />;
        case "Globe":
            return <Globe className={className} />;
        case "Clock":
            return <Clock className={className} />;
        case "ShieldAlert":
            return <ShieldAlert className={className} />;
        case "Feather":
            return <Feather className={className} />;
        case "Sparkles":
            return <Sparkles className={className} />;
        case "PlaneLanding":
            return <PlaneLanding className={className} />;
        case "History":
            return <History className={className} />;
        case "Crown":
            return <Crown className={className} />;
        default:
            return <Award className={className} />;
    }
};

const formatFlightTime = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
};

export const ProfileView: React.FC = () => {
    const { visitedAirports, visitedCountries, flights, theme } = useFlightStore();
    const [activeTab, setActiveTab] = useState<"badges" | "stats" | "fleet" | "map">("badges");
    const [filterCategory, setFilterCategory] = useState<"all" | AchievementCategory>("all");
    const [badgeSearch, setBadgeSearch] = useState("");
    const [fleetSearch, setFleetSearch] = useState("");
    const [filterText, setFilterText] = useState("");
    const [airportFilterText, setAirportFilterText] = useState("");
    const [showAllBorders, setShowAllBorders] = useState(true);
    const [showRoutes, setShowRoutes] = useState(true);
    const [geoJsonData, setGeoJsonData] = useState<any>(cachedCountriesGeoJson);
    const [isLoadingBoundaries, setIsLoadingBoundaries] = useState(
        !cachedCountriesGeoJson,
    );
    const [isMapReady, setIsMapReady] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsMapReady(true);
        }, 40);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (cachedCountriesGeoJson) {
            setGeoJsonData(cachedCountriesGeoJson);
            setIsLoadingBoundaries(false);
            return;
        }

        let isMounted = true;
        setIsLoadingBoundaries(true);

        preloadCountriesGeoJson().then((data) => {
            if (isMounted) {
                if (data) setGeoJsonData(data);
                setIsLoadingBoundaries(false);
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    // User Statistics Computations
    const completedFlights = useMemo(
        () => flights.filter((f) => f.status === "COMPLETED"),
        [flights],
    );

    const totalDistanceNm = useMemo(
        () => completedFlights.reduce((acc, f) => acc + (f.distanceFlownNm || 0), 0),
        [completedFlights],
    );

    const totalFlightTimeSeconds = useMemo(
        () => completedFlights.reduce((acc, f) => acc + (f.flightTimeSeconds || 0), 0),
        [completedFlights],
    );

    const totalLandings = useMemo(
        () =>
            completedFlights.reduce(
                (acc, f) =>
                    acc +
                    (f.touchdowns && f.touchdowns.length > 0
                        ? f.touchdowns.length
                        : f.landingRateFpm
                          ? 1
                          : 0),
                0,
            ),
        [completedFlights],
    );

    const softestLandingFpm = useMemo(() => {
        let softest: number | null = null;
        completedFlights.forEach((f) => {
            if (f.landingRateFpm && f.landingRateFpm < 0) {
                if (softest === null || f.landingRateFpm > softest) {
                    softest = f.landingRateFpm;
                }
            }
            f.touchdowns?.forEach((td) => {
                if (td.verticalSpeedFpm < 0) {
                    if (softest === null || td.verticalSpeedFpm > softest) {
                        softest = td.verticalSpeedFpm;
                    }
                }
            });
        });
        return softest;
    }, [completedFlights]);

    const hardestLandingFpm = useMemo(() => {
        let hardest: number | null = null;
        completedFlights.forEach((f) => {
            if (f.landingRateFpm && f.landingRateFpm < 0) {
                if (hardest === null || f.landingRateFpm < hardest) {
                    hardest = f.landingRateFpm;
                }
            }
            f.touchdowns?.forEach((td) => {
                if (td.verticalSpeedFpm < 0) {
                    if (hardest === null || td.verticalSpeedFpm < hardest) {
                        hardest = td.verticalSpeedFpm;
                    }
                }
            });
        });
        return hardest;
    }, [completedFlights]);

    const mostFlownAircraft = useMemo(() => {
        const counts: Record<string, number> = {};
        completedFlights.forEach((f) => {
            if (f.aircraftType) {
                counts[f.aircraftType] = (counts[f.aircraftType] || 0) + 1;
            }
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return sorted[0] ? sorted[0][0] : null;
    }, [completedFlights]);

    const favoriteAirport = useMemo(() => {
        if (visitedAirports.length === 0) return null;
        const sorted = [...visitedAirports].sort((a, b) => b.visitCount - a.visitCount);
        return sorted[0] ? `${sorted[0].icao} (${sorted[0].visitCount})` : null;
    }, [visitedAirports]);

    const userData: AchievementUserData = useMemo(
        () => ({
            flights: completedFlights,
            visitedAirports,
            visitedCountries,
            totalDistanceNm,
            totalFlightTimeSeconds,
            totalLandings,
            completedFlightsCount: completedFlights.length,
            softestLandingFpm,
            mostFlownAircraft,
            favoriteAirport,
        }),
        [
            completedFlights,
            visitedAirports,
            visitedCountries,
            totalDistanceNm,
            totalFlightTimeSeconds,
            totalLandings,
            softestLandingFpm,
            mostFlownAircraft,
            favoriteAirport,
        ],
    );

    // Evaluate Achievements
    const evaluatedAchievements = useMemo(() => {
        return ACHIEVEMENTS.map((ach) => {
            const result = ach.expression(userData);
            return {
                ...ach,
                result,
            };
        });
    }, [userData]);

    const unlockedCount = useMemo(
        () => evaluatedAchievements.filter((a) => a.result.completed).length,
        [evaluatedAchievements],
    );
    const totalAchievements = evaluatedAchievements.length;
    const achievementPercentage = Math.round(
        (unlockedCount / Math.max(1, totalAchievements)) * 100,
    );

    const filteredAchievements = useMemo(() => {
        return evaluatedAchievements.filter((ach) => {
            if (filterCategory !== "all" && ach.category !== filterCategory) {
                return false;
            }
            if (badgeSearch.trim()) {
                const q = badgeSearch.toLowerCase();
                return (
                    ach.name.toLowerCase().includes(q) ||
                    ach.description.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [evaluatedAchievements, filterCategory, badgeSearch]);

    // Unique Connected Flight Routes
    const uniqueRoutes = useMemo(() => {
        const airportMap = new Map(
            visitedAirports.map((a) => [a.icao.toUpperCase(), a]),
        );
        const routeMap: Record<
            string,
            {
                key: string;
                from: VisitedAirport;
                to: VisitedAirport;
                count: number;
            }
        > = {};

        completedFlights.forEach((f) => {
            const dep = f.departureIcao?.trim().toUpperCase();
            const arr = f.arrivalIcao?.trim().toUpperCase();
            if (dep && arr && dep !== arr) {
                const depApt = airportMap.get(dep);
                const arrApt = airportMap.get(arr);
                if (depApt && arrApt) {
                    const key = `${dep}->${arr}`;
                    if (!routeMap[key]) {
                        routeMap[key] = {
                            key,
                            from: depApt,
                            to: arrApt,
                            count: 0,
                        };
                    }
                    routeMap[key].count++;
                }
            }
        });

        return Object.values(routeMap).sort((a, b) => b.count - a.count);
    }, [completedFlights, visitedAirports]);

    // Detailed Flight Statistics Calculations
    const maxAltitudeAll = useMemo(
        () => Math.max(0, ...completedFlights.map((f) => f.maxAltitude || 0)),
        [completedFlights],
    );

    const maxGroundSpeedAll = useMemo(
        () => Math.max(0, ...completedFlights.map((f) => f.maxGroundSpeed || 0)),
        [completedFlights],
    );

    const longestFlightByDistance = useMemo(() => {
        return completedFlights.reduce(
            (longest, f) =>
                (f.distanceFlownNm || 0) > (longest?.distanceFlownNm || 0) ? f : longest,
            null as FlightRecord | null,
        );
    }, [completedFlights]);

    const longestFlightByTime = useMemo(() => {
        return completedFlights.reduce(
            (longest, f) =>
                (f.flightTimeSeconds || 0) > (longest?.flightTimeSeconds || 0) ? f : longest,
            null as FlightRecord | null,
        );
    }, [completedFlights]);

    const avgFlightDistance =
        completedFlights.length > 0
            ? Math.round(totalDistanceNm / completedFlights.length)
            : 0;

    const avgFlightTimeSeconds =
        completedFlights.length > 0
            ? Math.round(totalFlightTimeSeconds / completedFlights.length)
            : 0;

    // Landing Breakdown
    const landingStats = useMemo(() => {
        let butter = 0;
        let normal = 0;
        let firm = 0;
        let totalFpm = 0;
        let landingCount = 0;

        const processRate = (rate: number) => {
            if (rate >= 0) return;
            landingCount++;
            totalFpm += Math.abs(rate);
            if (rate > -120) {
                butter++;
            } else if (rate >= -300) {
                normal++;
            } else {
                firm++;
            }
        };

        completedFlights.forEach((f) => {
            if (f.landingRateFpm) {
                processRate(f.landingRateFpm);
            }
            f.touchdowns?.forEach((td) => {
                if (td.verticalSpeedFpm) {
                    processRate(td.verticalSpeedFpm);
                }
            });
        });

        return {
            butter,
            normal,
            firm,
            totalCount: landingCount,
            avgFpm: landingCount > 0 ? Math.round(totalFpm / landingCount) : null,
        };
    }, [completedFlights]);

    // Aircraft Fleet Breakdown
    const fleetStats = useMemo(() => {
        const map: Record<
            string,
            {
                type: string;
                count: number;
                distance: number;
                timeSec: number;
                softestLanding: number | null;
                lastFlightDate: string | null;
                lastRoute: string | null;
                maxAlt: number;
                maxGs: number;
            }
        > = {};

        completedFlights.forEach((f) => {
            const type = f.aircraftType?.trim() || "General Aviation";
            if (!map[type]) {
                map[type] = {
                    type,
                    count: 0,
                    distance: 0,
                    timeSec: 0,
                    softestLanding: null,
                    lastFlightDate: null,
                    lastRoute: null,
                    maxAlt: 0,
                    maxGs: 0,
                };
            }
            const item = map[type];
            item.count++;
            item.distance += f.distanceFlownNm || 0;
            item.timeSec += f.flightTimeSeconds || 0;
            if ((f.maxAltitude || 0) > item.maxAlt) item.maxAlt = f.maxAltitude;
            if ((f.maxGroundSpeed || 0) > item.maxGs) item.maxGs = f.maxGroundSpeed;

            const flightDate = f.endTime || f.startTime;
            if (
                flightDate &&
                (!item.lastFlightDate ||
                    new Date(flightDate) > new Date(item.lastFlightDate))
            ) {
                item.lastFlightDate = flightDate;
                if (f.departureIcao && f.arrivalIcao) {
                    item.lastRoute = `${f.departureIcao} ➔ ${f.arrivalIcao}`;
                }
            }

            if (f.landingRateFpm && f.landingRateFpm < 0) {
                if (
                    item.softestLanding === null ||
                    f.landingRateFpm > item.softestLanding
                ) {
                    item.softestLanding = f.landingRateFpm;
                }
            }
            f.touchdowns?.forEach((td) => {
                if (td.verticalSpeedFpm < 0) {
                    if (
                        item.softestLanding === null ||
                        td.verticalSpeedFpm > item.softestLanding
                    ) {
                        item.softestLanding = td.verticalSpeedFpm;
                    }
                }
            });
        });

        return Object.values(map).sort((a, b) => b.count - a.count);
    }, [completedFlights]);

    const filteredFleetStats = useMemo(() => {
        if (!fleetSearch.trim()) return fleetStats;
        const q = fleetSearch.toLowerCase();
        return fleetStats.filter((f) => f.type.toLowerCase().includes(q));
    }, [fleetStats, fleetSearch]);

    // Country & Map Metrics
    const totalCountriesWorld = 195;
    const visitedCount = visitedCountries.length;
    const countryPercentage = ((visitedCount / totalCountriesWorld) * 100).toFixed(1);

    const europeanCountries = visitedCountries.filter((c) =>
        ["NL", "GB", "DE", "AT", "FR", "ES", "IT", "CH", "SE", "NO"].includes(
            c.isoA2,
        ),
    ).length;
    const northAmericanCountries = visitedCountries.filter((c) =>
        ["US", "CA", "MX"].includes(c.isoA2),
    ).length;
    const asianCountries = visitedCountries.filter((c) =>
        ["JP", "HK", "AE", "SG", "KR", "CN"].includes(c.isoA2),
    ).length;

    const visitedIsoSet = useMemo(
        () => new Set(visitedCountries.map((c) => c.isoA2)),
        [visitedCountries],
    );
    const visitedNameSet = useMemo(
        () => new Set(visitedCountries.map((c) => c.name.toLowerCase())),
        [visitedCountries],
    );

    const isFeatureVisited = (props: Record<string, any>) => {
        const iso = getFeatureIso(props);
        const name = getFeatureName(props).toLowerCase();
        return visitedIsoSet.has(iso) || visitedNameSet.has(name);
    };

    const filteredCountries = useMemo(() => {
        if (!filterText.trim()) return visitedCountries;
        const q = filterText.toLowerCase();
        return visitedCountries.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.isoA2.toLowerCase().includes(q),
        );
    }, [visitedCountries, filterText]);

    const filteredAirports = useMemo(() => {
        const sorted = [...visitedAirports].sort(
            (a, b) => b.visitCount - a.visitCount,
        );
        if (!airportFilterText.trim()) return sorted;
        const q = airportFilterText.toLowerCase();
        return sorted.filter(
            (a) =>
                a.icao.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                (a.countryName && a.countryName.toLowerCase().includes(q)),
        );
    }, [visitedAirports, airportFilterText]);

    return (
        <div className="flex-1 min-h-0 h-full overflow-y-auto p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
            {/* Header & Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                        <User className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                            Pilot Profile
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Flight operations statistics, earned badges & achievements, and global destination passport
                        </p>
                    </div>
                </div>
            </div>

            {/* Pilot Lifetime Statistics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Total Distance */}
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-xs mb-1">
                        <span className="font-medium">Total Distance Flown</span>
                        <Navigation className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div className="text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                        {Math.round(totalDistanceNm).toLocaleString()}{" "}
                        <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                            NM
                        </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 truncate">
                        {completedFlights.length} completed flight logs
                    </div>
                </div>

                {/* Total Flight Time */}
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-xs mb-1">
                        <span className="font-medium">Total Flight Hours</span>
                        <Clock className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div className="text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                        {formatFlightTime(totalFlightTimeSeconds)}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 truncate">
                        {mostFlownAircraft ? `Primary: ${mostFlownAircraft}` : "No logged flights"}
                    </div>
                </div>

                {/* Total Landings */}
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-xs mb-1">
                        <span className="font-medium">Logged Landings</span>
                        <PlaneLanding className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div className="text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                        {totalLandings}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 truncate">
                        {softestLandingFpm !== null
                            ? `Best touchdown: ${Math.round(softestLandingFpm)} FPM`
                            : "Awaiting first landing"}
                    </div>
                </div>

                {/* Achievement Completion */}
                <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-xs mb-1">
                        <span className="font-medium">Badges Unlocked</span>
                        <Award className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                            {unlockedCount} / {totalAchievements}
                        </span>
                        <span className="text-xs text-neutral-500 dark:text-geist-muted tabular-nums">
                            ({achievementPercentage}%)
                        </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-[#1c1c1c] rounded-xs h-1.5 mt-2 overflow-hidden">
                        <div
                            className="bg-amber-500 h-1.5 rounded-xs transition-all duration-300 ease-out"
                            style={{
                                width: `${Math.max(4, achievementPercentage)}%`,
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 p-1 bg-neutral-200/60 dark:bg-[#161616] rounded-sm border border-neutral-200 dark:border-geist-hairline self-start">
                    <button
                        type="button"
                        onClick={() => setActiveTab("badges")}
                        className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                            activeTab === "badges"
                                ? "bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs"
                                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                        }`}
                    >
                        <Award className="w-3.5 h-3.5" />
                        <span>Badges & Achievements</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("stats")}
                        className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                            activeTab === "stats"
                                ? "bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs"
                                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                        }`}
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>Flight Statistics</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("fleet")}
                        className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                            activeTab === "fleet"
                                ? "bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs"
                                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                        }`}
                    >
                        <Plane className="w-3.5 h-3.5" />
                        <span>Aircraft Fleet</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("map")}
                        className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                            activeTab === "map"
                                ? "bg-white dark:bg-[#222] text-neutral-900 dark:text-white shadow-xs"
                                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                        }`}
                    >
                        <Globe2 className="w-3.5 h-3.5" />
                        <span>World Passport & Aerodromes</span>
                    </button>
                </div>
            </div>

            {/* TAB 1: Badges & Achievements */}
            {activeTab === "badges" && (
                <div className="space-y-4">
                    {/* Category Filter and Search Toolbar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs">
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto text-xs">
                            {(
                                [
                                    { id: "all", label: "All Badges" },
                                    { id: "milestones", label: "Milestones" },
                                    { id: "exploration", label: "Exploration" },
                                    { id: "distance", label: "Distance" },
                                    { id: "hours", label: "Hours" },
                                    { id: "landings", label: "Landings" },
                                ] as const
                            ).map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setFilterCategory(cat.id)}
                                    className={`px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                                        filterCategory === cat.id
                                            ? "bg-neutral-900 dark:bg-white text-white dark:text-black font-medium"
                                            : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#181818]"
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        <div className="relative w-full sm:w-56 shrink-0">
                            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search achievements..."
                                value={badgeSearch}
                                onChange={(e) => setBadgeSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1 text-xs rounded-sm bg-neutral-100 dark:bg-[#111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Achievements Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {filteredAchievements.length === 0 ? (
                            <div className="col-span-full p-8 text-center bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm text-xs text-neutral-500 dark:text-neutral-400">
                                No achievements found matching your filter.
                            </div>
                        ) : (
                            filteredAchievements.map((ach) => {
                                const isUnlocked = ach.result.completed;
                                const pct = Math.round(ach.result.progression * 100);

                                const rarityStyles = {
                                    bronze: "border-amber-700/30 text-amber-600 dark:text-amber-500 bg-amber-500/10",
                                    silver: "border-neutral-400/30 text-neutral-600 dark:text-neutral-300 bg-neutral-400/10",
                                    gold: "border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-500/10",
                                    platinum: "border-cyan-500/30 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
                                }[ach.rarity];

                                return (
                                    <div
                                        key={ach.id}
                                        className={`p-4 rounded-sm border transition-all duration-150 flex flex-col justify-between shadow-xs ${
                                            isUnlocked
                                                ? "bg-white dark:bg-geist-surface border-neutral-300 dark:border-neutral-700"
                                                : "bg-neutral-50/70 dark:bg-[#0c0c0c] border-neutral-200/80 dark:border-geist-hairline opacity-85"
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-start justify-between gap-3 mb-2.5">
                                                <div
                                                    className={`w-9 h-9 rounded-sm flex items-center justify-center shrink-0 border ${
                                                        isUnlocked
                                                            ? rarityStyles
                                                            : "border-neutral-200 dark:border-neutral-800 text-neutral-400 dark:text-neutral-600 bg-neutral-100 dark:bg-[#141414]"
                                                    }`}
                                                >
                                                    {renderBadgeIcon(
                                                        ach.icon,
                                                        "w-4 h-4",
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 text-[10px]">
                                                    <span className="uppercase tracking-wider font-medium text-neutral-500 dark:text-neutral-400">
                                                        {ach.rarity}
                                                    </span>
                                                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                                                    {isUnlocked ? (
                                                        <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            <span>Unlocked</span>
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                                                            <Lock className="w-3 h-3" />
                                                            <span>Locked</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <h3 className="text-xs font-semibold text-neutral-900 dark:text-white tracking-tight">
                                                {ach.name}
                                            </h3>
                                            <p className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 leading-relaxed">
                                                {ach.description}
                                            </p>
                                        </div>

                                        {/* Progress Bar & Current / Target Values */}
                                        <div className="mt-3.5 pt-2.5 border-t border-neutral-100 dark:border-[#1a1a1a]">
                                            <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-geist-muted mb-1.5">
                                                <span className="tabular-nums">
                                                    {ach.result.currentValue || `${pct}%`}
                                                </span>
                                                <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                                                    {isUnlocked ? "100%" : `${pct}%`}
                                                </span>
                                            </div>

                                            <div className="w-full bg-neutral-200 dark:bg-[#1c1c1c] rounded-xs h-1.5 overflow-hidden">
                                                <div
                                                    className={`h-1.5 rounded-xs transition-all duration-300 ease-out ${
                                                        isUnlocked
                                                            ? "bg-emerald-500"
                                                            : "bg-neutral-900 dark:bg-neutral-300"
                                                    }`}
                                                    style={{
                                                        width: `${Math.max(
                                                            isUnlocked ? 100 : 3,
                                                            pct,
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: Flight Statistics Dashboard */}
            {activeTab === "stats" && (
                <div className="space-y-4">
                    {/* Performance & Operational Envelope */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Avg Flight Distance</span>
                                <Milestone className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {avgFlightDistance}{" "}
                                <span className="text-xs text-neutral-500 font-normal">NM / flight</span>
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                                Across {completedFlights.length} completed legs
                            </div>
                        </div>

                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Avg Flight Duration</span>
                                <Clock className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {formatFlightTime(avgFlightTimeSeconds)}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                                Airborne cruise & approach
                            </div>
                        </div>

                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Peak Altitude Attained</span>
                                <TrendingUp className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {maxAltitudeAll.toLocaleString()}{" "}
                                <span className="text-xs text-neutral-500 font-normal">FT MSL</span>
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                                Highest cruise level logged
                            </div>
                        </div>

                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Top Ground Speed</span>
                                <Gauge className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {maxGroundSpeedAll}{" "}
                                <span className="text-xs text-neutral-500 font-normal">KT GS</span>
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                                Maximum ground track velocity
                            </div>
                        </div>
                    </div>

                    {/* Landing Performance & Longest Flight Records */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Landing Touchdown Quality Breakdown */}
                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-geist-hairline">
                                <div className="flex items-center gap-2">
                                    <PlaneLanding className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-white">
                                        Touchdown Quality Analytics
                                    </h3>
                                </div>
                                <span className="text-xs text-neutral-500 tabular-nums">
                                    {landingStats.totalCount} Total Landings
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-center">
                                    <div className="text-[10px] uppercase font-semibold tracking-wider text-emerald-600 dark:text-emerald-400">
                                        Butter (&lt; -120 FPM)
                                    </div>
                                    <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                                        {landingStats.butter}
                                    </div>
                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                        {landingStats.totalCount > 0
                                            ? `${Math.round((landingStats.butter / landingStats.totalCount) * 100)}%`
                                            : "0%"}
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-sm bg-blue-500/10 border border-blue-500/20 text-center">
                                    <div className="text-[10px] uppercase font-semibold tracking-wider text-blue-600 dark:text-blue-400">
                                        Firm (-120 to -300)
                                    </div>
                                    <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1 tabular-nums">
                                        {landingStats.normal}
                                    </div>
                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                        {landingStats.totalCount > 0
                                            ? `${Math.round((landingStats.normal / landingStats.totalCount) * 100)}%`
                                            : "0%"}
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-center">
                                    <div className="text-[10px] uppercase font-semibold tracking-wider text-amber-600 dark:text-amber-400">
                                        Hard (&gt; -300 FPM)
                                    </div>
                                    <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
                                        {landingStats.firm}
                                    </div>
                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                        {landingStats.totalCount > 0
                                            ? `${Math.round((landingStats.firm / landingStats.totalCount) * 100)}%`
                                            : "0%"}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-1 flex items-center justify-between text-xs border-t border-neutral-100 dark:border-geist-hairline">
                                <span className="text-neutral-500 dark:text-geist-muted">
                                    Average Sink Rate at Touchdown:
                                </span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {landingStats.avgFpm !== null
                                        ? `-${landingStats.avgFpm} FPM`
                                        : "N/A"}
                                </span>
                            </div>
                        </div>

                        {/* Milestone Flight Records */}
                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-geist-hairline">
                                <div className="flex items-center gap-2">
                                    <Crown className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-white">
                                        Record Flight Milestones
                                    </h3>
                                </div>
                            </div>

                            <div className="space-y-2.5 text-xs">
                                <div className="p-2.5 rounded-sm bg-neutral-50 dark:bg-[#0f0f0f] border border-neutral-200 dark:border-geist-hairline flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-neutral-900 dark:text-white">
                                            Longest Flight by Distance
                                        </div>
                                        <div className="text-[11px] text-neutral-500 mt-0.5">
                                            {longestFlightByDistance
                                                ? `${longestFlightByDistance.departureIcao || "Unknown"} ➔ ${longestFlightByDistance.arrivalIcao || "Unknown"} (${longestFlightByDistance.aircraftType || "Aircraft"})`
                                                : "No flights recorded"}
                                        </div>
                                    </div>
                                    <div className="tabular-nums font-bold text-neutral-900 dark:text-white">
                                        {longestFlightByDistance
                                            ? `${Math.round(longestFlightByDistance.distanceFlownNm)} NM`
                                            : "0 NM"}
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-sm bg-neutral-50 dark:bg-[#0f0f0f] border border-neutral-200 dark:border-geist-hairline flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-neutral-900 dark:text-white">
                                            Longest Flight by Duration
                                        </div>
                                        <div className="text-[11px] text-neutral-500 mt-0.5">
                                            {longestFlightByTime
                                                ? `${longestFlightByTime.departureIcao || "Unknown"} ➔ ${longestFlightByTime.arrivalIcao || "Unknown"}`
                                                : "No flights recorded"}
                                        </div>
                                    </div>
                                    <div className="tabular-nums font-bold text-neutral-900 dark:text-white">
                                        {longestFlightByTime
                                            ? formatFlightTime(longestFlightByTime.flightTimeSeconds)
                                            : "0m"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: Aircraft Fleet Management & Hangar */}
            {activeTab === "fleet" && (
                <div className="space-y-4">
                    {/* Fleet Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Total Aircraft Types</span>
                                <Plane className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {fleetStats.length}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                                Distinct models logged in simulator
                            </div>
                        </div>

                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Primary Airframe</span>
                                <Crown className="w-4 h-4 text-amber-500" />
                            </div>
                            <div className="text-lg font-semibold text-neutral-900 dark:text-white truncate tracking-tight">
                                {fleetStats[0]?.type || "None"}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1 truncate">
                                {fleetStats[0]
                                    ? `${fleetStats[0].count} flights • ${formatFlightTime(fleetStats[0].timeSec)}`
                                    : "Awaiting flight logs"}
                            </div>
                        </div>

                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Avg Distance / Aircraft</span>
                                <Navigation className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {fleetStats.length > 0
                                    ? Math.round(totalDistanceNm / fleetStats.length).toLocaleString()
                                    : 0}{" "}
                                <span className="text-xs text-neutral-500 font-normal">NM</span>
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                                Across entire logged fleet
                            </div>
                        </div>

                        <div className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs">
                            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-1">
                                <span className="font-medium">Total Fleet Flight Time</span>
                                <Clock className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {formatFlightTime(totalFlightTimeSeconds)}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                                Cumulative pilot airborne time
                            </div>
                        </div>
                    </div>

                    {/* Fleet Filter Bar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-xs">
                        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                            <Plane className="w-4 h-4 text-neutral-500" />
                            <span>Logged Aircraft Fleet ({filteredFleetStats.length})</span>
                        </div>

                        <div className="relative w-full sm:w-64">
                            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search aircraft models..."
                                value={fleetSearch}
                                onChange={(e) => setFleetSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1 text-xs rounded-sm bg-neutral-100 dark:bg-[#111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Fleet Cards Grid */}
                    {filteredFleetStats.length === 0 ? (
                        <div className="p-8 text-center bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm text-xs text-neutral-500">
                            {fleetSearch.trim()
                                ? "No aircraft models found matching your search."
                                : "No aircraft models logged yet. Complete flights to populate your fleet!"}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {filteredFleetStats.map((item, idx) => {
                                const sharePct =
                                    totalFlightTimeSeconds > 0
                                        ? Math.round((item.timeSec / totalFlightTimeSeconds) * 100)
                                        : 0;
                                const isPrimary = idx === 0 && !fleetSearch.trim();

                                return (
                                    <div
                                        key={item.type}
                                        className="p-4 rounded-sm bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline shadow-xs flex flex-col justify-between space-y-3"
                                    >
                                        <div>
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline shrink-0">
                                                        <Plane className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                                                            {item.type}
                                                        </h4>
                                                        {item.lastRoute && (
                                                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                                                                Last route: {item.lastRoute}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {isPrimary && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-[3px] bg-amber-500/10 border border-amber-500/30 shrink-0">
                                                        <Crown className="w-3 h-3" />
                                                        <span>Primary</span>
                                                    </span>
                                                )}
                                            </div>

                                            {/* Metrics Row */}
                                            <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-neutral-100 dark:border-geist-hairline text-center text-xs">
                                                <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-100 dark:border-geist-hairline">
                                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                                        Flights
                                                    </div>
                                                    <div className="font-semibold text-neutral-900 dark:text-white mt-0.5 tabular-nums">
                                                        {item.count}
                                                    </div>
                                                </div>

                                                <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-100 dark:border-geist-hairline">
                                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                                        Flight Time
                                                    </div>
                                                    <div className="font-semibold text-neutral-900 dark:text-white mt-0.5 tabular-nums">
                                                        {formatFlightTime(item.timeSec)}
                                                    </div>
                                                </div>

                                                <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-100 dark:border-geist-hairline">
                                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                                        Distance
                                                    </div>
                                                    <div className="font-semibold text-neutral-900 dark:text-white mt-0.5 tabular-nums">
                                                        {Math.round(item.distance).toLocaleString()} NM
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Secondary Stats: Best landing & Envelope */}
                                            <div className="mt-2.5 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                                                <span>
                                                    Best Touchdown:{" "}
                                                    <strong className="text-neutral-800 dark:text-neutral-200 tabular-nums">
                                                        {item.softestLanding !== null
                                                            ? `${Math.round(item.softestLanding)} FPM`
                                                            : "N/A"}
                                                    </strong>
                                                </span>
                                                <span>
                                                    Max Alt:{" "}
                                                    <strong className="text-neutral-800 dark:text-neutral-200 tabular-nums">
                                                        {item.maxAlt > 0
                                                            ? `${item.maxAlt.toLocaleString()} FT`
                                                            : "N/A"}
                                                    </strong>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Fleet Share Progress Bar */}
                                        <div className="pt-2 border-t border-neutral-100 dark:border-geist-hairline">
                                            <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1">
                                                <span>Fleet Flight Time Share</span>
                                                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                                                    {sharePct}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-neutral-200 dark:bg-[#1c1c1c] rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-neutral-900 dark:bg-white h-1.5 rounded-full transition-all duration-300 ease-out"
                                                    style={{
                                                        width: `${Math.max(3, sharePct)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: World Passport & Aerodromes (Map & Table) */}
            {activeTab === "map" && (
                <div className="space-y-4">
                    {/* Metrics Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Progress Card */}
                        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs md:col-span-2 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Globe2 className="w-4 h-4 text-neutral-500 dark:text-neutral-300" />
                                        <h2 className="text-xs font-medium text-neutral-900 dark:text-white tracking-wider">
                                            Global Flight Coverage
                                        </h2>
                                    </div>
                                    <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                                        {countryPercentage}% Unlocked
                                    </span>
                                </div>

                                <div className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight mb-3 tabular-nums">
                                    {visitedCount}{" "}
                                    <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">
                                        / {totalCountriesWorld} Sovereign States
                                    </span>
                                </div>
                            </div>

                            <div className="w-full bg-neutral-200 dark:bg-[#1c1c1c] rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-neutral-900 dark:bg-white h-1.5 rounded-full transition-all duration-300 ease-out"
                                    style={{
                                        width: `${Math.max(4, Number(countryPercentage))}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Total Aerodromes */}
                        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-neutral-500 dark:text-geist-muted font-medium">
                                    Logged Aerodromes
                                </span>
                                <MapPin className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                {visitedAirports.length}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
                                Distinct ICAO destinations
                            </div>
                        </div>

                        {/* Continental Breakdown */}
                        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-xs">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-neutral-500 dark:text-geist-muted font-medium">
                                    Continents
                                </span>
                                <Award className="w-4 h-4 text-neutral-400" />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-xs px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#171717] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
                                    Europe {europeanCountries}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#171717] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
                                    N. America {northAmericanCountries}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#171717] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
                                    Asia/ME {asianCountries}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* World Map with Verified Flight Country Outlines, Route Lines & Destination Pins */}
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 flex flex-col space-y-3 shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                            <div className="flex items-center gap-2">
                                <Plane className="w-3.5 h-3.5 text-neutral-500" />
                                <span className="font-medium text-neutral-900 dark:text-white tracking-tight">
                                    Connected Flight Routes & Visited Sovereign Territories
                                </span>
                                {(isLoadingBoundaries || !isMapReady) && (
                                    <span className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                                        <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />
                                        <span>Loading map boundaries...</span>
                                    </span>
                                )}
                            </div>

                            {/* Map Legend & Layer Toggle */}
                            <div className="flex items-center gap-2.5 text-xs flex-wrap">
                                <Tooltip content="Toggle route connection lines">
                                    <button
                                        type="button"
                                        onClick={() => setShowRoutes(!showRoutes)}
                                        className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded-sm border transition-colors cursor-pointer ${
                                            showRoutes
                                                ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60"
                                                : "bg-neutral-100 dark:bg-[#171717] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-geist-hairline"
                                        }`}
                                    >
                                        <RouteIcon className="w-3 h-3" />
                                        <span>Routes ({uniqueRoutes.length})</span>
                                    </button>
                                </Tooltip>

                                <div className="flex items-center gap-1.5">
                                    <span className="w-3.5 h-2.5 rounded-[2px] bg-blue-500/20 border-2 border-blue-500 inline-block" />
                                    <span className="text-neutral-600 dark:text-neutral-300 font-medium">
                                        Nations ({visitedCount})
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 border border-white dark:border-black inline-block" />
                                    <span className="text-neutral-600 dark:text-neutral-300 font-medium">
                                        Airports ({visitedAirports.length})
                                    </span>
                                </div>
                                <Tooltip content="Toggle global borders">
                                    <button
                                        type="button"
                                        onClick={() => setShowAllBorders(!showAllBorders)}
                                        className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-sm bg-neutral-100 dark:bg-[#171717] border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-200 dark:hover:bg-[#222] transition-colors cursor-pointer"
                                    >
                                        <Layers className="w-3 h-3 text-neutral-500" />
                                        <span>
                                            {showAllBorders
                                                ? "Hide Inactive Borders"
                                                : "Show All Borders"}
                                        </span>
                                    </button>
                                </Tooltip>
                            </div>
                        </div>

                        <div className="h-[480px] w-full rounded-sm overflow-hidden border border-neutral-200 dark:border-geist-hairline relative z-0 flex items-center justify-center bg-neutral-100/60 dark:bg-[#111111]/80">
                            {!isMapReady || !geoJsonData ? (
                                <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
                                    <div className="flex flex-col items-center gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                            Initializing global boundaries...
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <MapContainer
                                    center={[20, 0]}
                                    zoom={2}
                                    minZoom={2}
                                    maxZoom={9}
                                    preferCanvas={true}
                                    style={{ height: "100%", width: "100%" }}
                                    className={`z-0 ${theme === "dark" ? "dark-tiles" : ""}`}
                                >
                                    <TileLayer
                                        attribution={ARCGIS_WORLD_IMAGERY_ATTRIBUTION}
                                        url={ARCGIS_WORLD_IMAGERY_URL}
                                        maxZoom={19}
                                    />

                                    <GeoJSON
                                        key={`borders-${theme}-${visitedCount}-${showAllBorders}`}
                                        data={geoJsonData}
                                        style={(feature) => {
                                            const visited = isFeatureVisited(feature?.properties || {});
                                            if (visited) {
                                                return {
                                                    color: "#3b82f6",
                                                    weight: 2,
                                                    opacity: 0.9,
                                                    fillColor: "#3b82f6",
                                                    fillOpacity: theme === "dark" ? 0.35 : 0.25,
                                                };
                                            }
                                            return {
                                                color: theme === "dark" ? "#333333" : "#d1d5db",
                                                weight: showAllBorders ? 0.75 : 0,
                                                opacity: showAllBorders ? 0.4 : 0,
                                                fillColor: "transparent",
                                                fillOpacity: 0,
                                            };
                                        }}
                                        onEachFeature={(feature, layer) => {
                                            const name = getFeatureName(feature.properties);
                                            const iso = getFeatureIso(feature.properties);
                                            const visited = isFeatureVisited(feature.properties);
                                            layer.bindPopup(`
                                                <div style="font-family: system-ui, sans-serif; font-size: 12px; color: #111;">
                                                    <strong>${name}</strong> ${iso ? `(${iso})` : ""}<br/>
                                                    <span style="color: ${visited ? "#10b981" : "#6b7280"}; font-weight: 500;">
                                                        ${visited ? "✓ Visited Destination" : "Unvisited Territory"}
                                                    </span>
                                                </div>
                                            `);
                                        }}
                                    />

                                    {/* Route Lines Connecting Visited Aerodromes */}
                                    {showRoutes &&
                                        uniqueRoutes.map((rt) => (
                                            <Polyline
                                                key={rt.key}
                                                positions={[
                                                    [rt.from.latitude, rt.from.longitude],
                                                    [rt.to.latitude, rt.to.longitude],
                                                ]}
                                                pathOptions={{
                                                    color: theme === "dark" ? "#60a5fa" : "#2563eb",
                                                    weight: Math.min(3.5, 1.5 + rt.count * 0.4),
                                                    opacity: theme === "dark" ? 0.65 : 0.75,
                                                    dashArray: rt.count === 1 ? "4, 6" : undefined,
                                                }}
                                            >
                                                <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.9}>
                                                    <div className="text-xs font-sans font-medium text-neutral-900">
                                                        <span className="font-mono font-bold">{rt.from.icao}</span> ➔ <span className="font-mono font-bold">{rt.to.icao}</span>
                                                        <span className="text-neutral-500 ml-1.5 font-normal">
                                                            ({rt.count} {rt.count === 1 ? "flight" : "flights"})
                                                        </span>
                                                    </div>
                                                </LeafletTooltip>
                                            </Polyline>
                                        ))}

                                    {/* Re-Styled Aerodrome Waypoint Markers */}
                                    {visitedAirports.map((apt) => {
                                        const markerRadius = Math.min(
                                            8.5,
                                            Math.max(5, 4.5 + Math.log2(apt.visitCount)),
                                        );
                                        return (
                                            <CircleMarker
                                                key={apt.icao}
                                                center={[apt.latitude, apt.longitude]}
                                                radius={markerRadius}
                                                pathOptions={{
                                                    fillColor:
                                                        theme === "dark" ? "#3b82f6" : "#2563eb",
                                                    color:
                                                        theme === "dark" ? "#ffffff" : "#1e40af",
                                                    weight: 2,
                                                    opacity: 1,
                                                    fillOpacity: 0.95,
                                                }}
                                            >
                                                <LeafletTooltip
                                                    direction="top"
                                                    offset={[0, -6]}
                                                    opacity={0.95}
                                                >
                                                    <div className="text-xs font-sans">
                                                        <span className="font-mono font-bold text-neutral-900">
                                                            {apt.icao}
                                                        </span>
                                                        <span className="text-neutral-700 ml-1">
                                                            {apt.name}
                                                        </span>
                                                        <div className="text-[10px] text-neutral-500 tabular-nums mt-0.5">
                                                            {apt.visitCount} {apt.visitCount === 1 ? "logged visit" : "logged visits"}
                                                        </div>
                                                    </div>
                                                </LeafletTooltip>

                                                <Popup>
                                                    <div className="text-xs p-1">
                                                        <div className="font-semibold text-neutral-900">
                                                            {apt.icao} — {apt.name}
                                                        </div>
                                                        <div className="text-neutral-500 mt-0.5">
                                                            {apt.countryName} ({apt.countryCode})
                                                        </div>
                                                        <div className="text-neutral-700 tabular-nums mt-1 font-medium">
                                                            Logged Visits: {apt.visitCount}
                                                        </div>
                                                    </div>
                                                </Popup>
                                            </CircleMarker>
                                        );
                                    })}
                                </MapContainer>
                            )}
                        </div>
                    </div>

                    {/* Visited Country & Airport Data Tables */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Sovereign Nations */}
                        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 shadow-xs flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                                        <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
                                        Logged Nations ({visitedCountries.length})
                                    </h3>
                                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                                        Sovereign territories registered
                                    </p>
                                </div>

                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Filter nations..."
                                        value={filterText}
                                        onChange={(e) => setFilterText(e.target.value)}
                                        className="pl-7 pr-2.5 py-1 text-xs rounded-sm bg-neutral-100 dark:bg-[#111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors w-36"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1 flex-1">
                                {filteredCountries.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
                                        {filterText.trim()
                                            ? "No matching nations found."
                                            : "No countries visited yet. Complete flights to unlock sovereign nations!"}
                                    </div>
                                ) : (
                                    filteredCountries.map((c) => (
                                        <div
                                            key={c.isoA2}
                                            className="flex items-center justify-between p-2 rounded-sm bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-200 dark:border-geist-hairline text-xs"
                                        >
                                            <div className="flex items-center gap-2 min-w-0 pr-2">
                                                <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 bg-neutral-200 dark:bg-[#1a1a1a] text-neutral-800 dark:text-neutral-300 rounded-[3px] shrink-0">
                                                    {c.isoA2}
                                                </span>
                                                <span className="font-medium text-neutral-900 dark:text-white truncate">
                                                    {c.name}
                                                </span>
                                            </div>
                                            <span className="bg-neutral-100 dark:bg-[#171717] text-neutral-800 dark:text-neutral-200 px-2 py-0.5 rounded-sm border border-neutral-200 dark:border-geist-hairline tabular-nums font-medium shrink-0">
                                                {c.flightCount} {c.flightCount === 1 ? "flight" : "flights"}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Top Visited Aerodromes */}
                        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 shadow-xs flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                                        <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                                        Logged Aerodromes ({visitedAirports.length})
                                    </h3>
                                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                                        Arrival & departure waypoints
                                    </p>
                                </div>

                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Filter airports..."
                                        value={airportFilterText}
                                        onChange={(e) => setAirportFilterText(e.target.value)}
                                        className="pl-7 pr-2.5 py-1 text-xs rounded-sm bg-neutral-100 dark:bg-[#111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors w-36"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1 flex-1">
                                {filteredAirports.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
                                        {airportFilterText.trim()
                                            ? "No matching aerodromes found."
                                            : "No aerodromes visited yet. Completed flights will automatically register departure & arrival airports."}
                                    </div>
                                ) : (
                                    filteredAirports.map((apt) => (
                                        <div
                                            key={apt.icao}
                                            className="flex items-center justify-between p-2 rounded-sm bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-200 dark:border-geist-hairline text-xs"
                                        >
                                            <div className="min-w-0 pr-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-neutral-900 dark:text-white font-mono">
                                                        {apt.icao}
                                                    </span>
                                                    <span className="text-neutral-700 dark:text-neutral-300 truncate">
                                                        {apt.name}
                                                    </span>
                                                </div>
                                                {apt.countryName && (
                                                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                                                        {[apt.countryName, apt.countryCode]
                                                            .filter(Boolean)
                                                            .join(" • ")}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="bg-neutral-100 dark:bg-[#171717] text-neutral-800 dark:text-neutral-200 px-2 py-0.5 rounded-sm border border-neutral-200 dark:border-geist-hairline tabular-nums font-medium shrink-0">
                                                {apt.visitCount} {apt.visitCount === 1 ? "visit" : "visits"}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export { ProfileView as VisitedWorldView };
