import React, { useEffect, useState, useRef } from "react";
import { Tooltip } from "../ui";
import { useFlightStore } from "../../store/flightStore";
import { useSmoothedTelemetry } from "../../hooks/useSmoothedTelemetry";
import { formatPitchParts, formatRollParts } from "../../utils/flightFormatters";
import { ARCGIS_WORLD_IMAGERY_ATTRIBUTION, ARCGIS_WORLD_IMAGERY_URL } from "../../utils/mapTiles";
import { TouchdownFlyoutBanner } from "../telemetry/TouchdownFlyoutBanner";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
    Activity,
    ArrowUpRight,
    Compass,
    Gauge,
    Wind,
    Navigation,
    LocateFixed,
    Locate,
    MapPin,
} from "lucide-react";

function createPlaneIcon(heading: number, isDark: boolean) {
    const safeHeading =
        typeof heading === "number" && !isNaN(heading) ? heading : 0;
    const color = isDark ? "#38bdf8" : "#0284c7";
    const svgHtml = `
        <div style="transform: rotate(${safeHeading}deg); transform-origin: center center; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
            <svg viewBox="0 0 24 24" width="26" height="26" stroke="${color}" stroke-width="2.2" fill="${color}" fill-opacity="0.45" stroke-linecap="round" stroke-linejoin="round">
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

const MapFollowController: React.FC<{
    lat: number;
    lon: number;
    isFollow: boolean;
}> = ({ lat, lon, isFollow }) => {
    const map = useMap();
    useEffect(() => {
        if (isFollow && lat !== 0 && lon !== 0) {
            map.panTo([lat, lon], { animate: true, duration: 1.0 });
        }
    }, [lat, lon, isFollow, map]);

    return null;
};

function getStageColor(stage: string) {
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
}

export const EfbHudView: React.FC = () => {
    const {
        currentTelemetry: rawTelemetry,
        theme,
        nearestAirport,
        flightStage,
    } = useFlightStore();
    const currentTelemetry = useSmoothedTelemetry(rawTelemetry);
    const [isFollow, setIsFollow] = useState(true);
    const [trackTrail, setTrackTrail] = useState<[number, number][]>([]);
    const lastPosRef = useRef<[number, number] | null>(null);

    const lat = currentTelemetry.latitude ?? 0;
    const lon = currentTelemetry.longitude ?? 0;
    const heading = Math.round(currentTelemetry.heading ?? 0);
    const isDark = theme === "dark";

    useEffect(() => {
        if (lat === 0 && lon === 0) return;
        const current: [number, number] = [lat, lon];
        if (!lastPosRef.current) {
            lastPosRef.current = current;
            setTrackTrail([current]);
            return;
        }
        const dLat = Math.abs(current[0] - lastPosRef.current[0]);
        const dLon = Math.abs(current[1] - lastPosRef.current[1]);
        if (dLat > 0.0005 || dLon > 0.0005) {
            lastPosRef.current = current;
            setTrackTrail((prev) => [...prev.slice(-300), current]);
        }
    }, [lat, lon]);

    const hasValidCoords = lat !== 0 || lon !== 0;
    const centerCoords: [number, number] = hasValidCoords ? [lat, lon] : [51.505, -0.09];

    return (
        <div className="flex flex-col h-full w-full select-none bg-neutral-50 dark:bg-black text-neutral-900 dark:text-[#ededed] font-sans">
            {/* Telemetry Metric Cards (Matching desktop Overview.tsx) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-3 sm:p-4 border-b border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-black">
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

            {/* Interactive Leaflet Map */}
            <div className="relative flex-1 w-full overflow-hidden">
                <MapContainer
                    center={centerCoords}
                    zoom={12}
                    zoomControl={false}
                    className="h-full w-full z-0"
                >
                    <TileLayer
                        attribution={ARCGIS_WORLD_IMAGERY_ATTRIBUTION}
                        url={ARCGIS_WORLD_IMAGERY_URL}
                        maxZoom={19}
                    />

                    {trackTrail.length > 1 && (
                        <Polyline
                            positions={trackTrail}
                            color="#0070f3"
                            weight={3.5}
                            opacity={0.85}
                        />
                    )}

                    {hasValidCoords && (
                        <Marker
                            position={[lat, lon]}
                            icon={createPlaneIcon(heading, isDark)}
                        />
                    )}

                    <MapFollowController lat={lat} lon={lon} isFollow={isFollow} />
                </MapContainer>

                {/* Floating Map Controls */}
                <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
                    <Tooltip content={isFollow ? "Follow Plane (Enabled)" : "Free Pan (Disabled)"}>
                        <button
                            type="button"
                            onClick={() => setIsFollow(!isFollow)}
                            aria-label={isFollow ? "Disable follow plane" : "Enable follow plane"}
                            className={`p-2.5 rounded-sm shadow-xs border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer ${
                                isFollow
                                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white"
                                    : "bg-white/95 dark:bg-geist-surface/95 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1f1f1f]"
                            }`}
                        >
                        {isFollow ? (
                            <LocateFixed className="w-4 h-4 text-sky-400 dark:text-blue-600" />
                        ) : (
                            <Locate className="w-4 h-4" />
                        )}
                        </button>
                    </Tooltip>
                </div>

                {/* Coordinates & Nearest Airport Floating Overlay */}
                <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
                    <div className="px-2.5 py-1.5 rounded-sm bg-white/90 dark:bg-geist-surface/90 border border-neutral-200 dark:border-geist-hairline text-xs backdrop-blur-xs text-neutral-800 dark:text-neutral-200 flex items-center gap-2 shadow-xs">
                        <Navigation className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                        <span className="font-mono tabular-nums">
                            {lat.toFixed(4)}°, {lon.toFixed(4)}°
                        </span>
                        <span className="text-neutral-300 dark:text-neutral-700">|</span>
                        <span className="truncate max-w-[180px] font-medium">
                            {currentTelemetry.aircraftTitle || "MSFS Aircraft"}
                        </span>
                    </div>

                    {nearestAirport && (
                        <div className="px-2.5 py-1.5 rounded-sm bg-white/90 dark:bg-geist-surface/90 border border-neutral-200 dark:border-geist-hairline text-xs backdrop-blur-xs text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 shadow-xs">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>
                                Nearest:{" "}
                                <strong className="font-semibold font-mono">{nearestAirport.icao}</strong>{" "}
                                <span className="text-neutral-500 dark:text-geist-muted">({nearestAirport.name})</span>
                            </span>
                        </div>
                    )}
                </div>

                {/* Instant Touchdown Banner */}
                <TouchdownFlyoutBanner />
            </div>
        </div>
    );
};
