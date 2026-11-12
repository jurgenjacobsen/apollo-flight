import React, { useEffect, useState, useRef } from "react";
import { useFlightStore } from "../../store/flightStore";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
    Compass,
    Gauge,
    Wind,
    Navigation,
    LocateFixed,
    Locate,
    Thermometer,
    CloudSun,
    MapPin,
} from "lucide-react";

function createPlaneIcon(heading: number, isDark: boolean) {
    const color = isDark ? "#3b82f6" : "#2563eb";
    const svgHtml = `
        <div style="transform: rotate(${heading}deg); transform-origin: center center; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;">
            <svg viewBox="0 0 24 24" width="30" height="30" stroke="${color}" stroke-width="2" fill="${color}" fill-opacity="0.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
            </svg>
        </div>
    `;

    return L.divIcon({
        html: svgHtml,
        className: "plane-marker-icon",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
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

export const EfbHudView: React.FC = () => {
    const { currentTelemetry, theme, nearestAirport } = useFlightStore();
    const [isFollow, setIsFollow] = useState(true);
    const [trackTrail, setTrackTrail] = useState<[number, number][]>([]);
    const lastPosRef = useRef<[number, number] | null>(null);

    const lat = currentTelemetry.latitude ?? 0;
    const lon = currentTelemetry.longitude ?? 0;
    const heading = Math.round(currentTelemetry.heading ?? 0);
    const altMsl = Math.round(currentTelemetry.altitudeMsl ?? 0);
    const altAgl = Math.round(currentTelemetry.altitudeAgl ?? 0);
    const ias = Math.round(currentTelemetry.indicatedAirspeed ?? 0);
    const tas = Math.round(currentTelemetry.trueAirspeed ?? 0);
    const gs = Math.round(currentTelemetry.groundSpeed ?? 0);
    const vs = Math.round(currentTelemetry.verticalSpeed ?? 0);
    const windSpd = Math.round(currentTelemetry.windSpeed ?? 0);
    const windDir = Math.round(currentTelemetry.windDirection ?? 0);
    const oat = (currentTelemetry.oat ?? 15).toFixed(1);
    const vis = (currentTelemetry.visibility ?? 10).toFixed(1);

    const angleRad = ((windDir - heading) * Math.PI) / 180;
    const crosswind = Math.round(windSpd * Math.sin(angleRad));
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
        <div className="flex flex-col h-full w-full select-none bg-neutral-50 dark:bg-black text-neutral-900 dark:text-[#ededed]">
            {/* Top Telemetry KPI Ribbon (Matching desktop Dashboard KPI cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 border-b border-neutral-200 dark:border-geist-hairline bg-white/50 dark:bg-geist-surface/50 font-mono">
                {/* Speed Card */}
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] text-neutral-500 dark:text-geist-muted font-sans font-medium uppercase">
                        Speed (KT)
                    </span>
                    <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white tabular-nums my-0.5">
                        {ias} <span className="text-xs font-normal text-neutral-400">IAS</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted truncate">
                        {tas} TAS │ {gs} GS
                    </div>
                </div>

                {/* Altitude Card */}
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] text-neutral-500 dark:text-geist-muted font-sans font-medium uppercase">
                        Altitude (FT)
                    </span>
                    <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white tabular-nums my-0.5">
                        {altMsl.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-neutral-400">MSL</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted truncate">
                        {altAgl.toLocaleString()} AGL
                    </div>
                </div>

                {/* Heading Card */}
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] text-neutral-500 dark:text-geist-muted font-sans font-medium uppercase">
                        Heading
                    </span>
                    <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white tabular-nums my-0.5">
                        {String(heading).padStart(3, "0")}°
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted truncate">
                        MAGNETIC
                    </div>
                </div>

                {/* Vertical Speed Card */}
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] text-neutral-500 dark:text-geist-muted font-sans font-medium uppercase">
                        Vertical Speed
                    </span>
                    <div
                        className={`text-xl sm:text-2xl font-bold tracking-tight tabular-nums my-0.5 ${
                            vs > 100
                                ? "text-emerald-600 dark:text-emerald-400"
                                : vs < -100
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-neutral-900 dark:text-white"
                        }`}
                    >
                        {vs > 0 ? `+${vs}` : vs}
                        <span className="text-xs font-normal text-neutral-400 ml-1">FPM</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted truncate">
                        {vs > 150 ? "CLIMBING" : vs < -150 ? "DESCENDING" : "CRUISING"}
                    </div>
                </div>

                {/* Wind Card */}
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] text-neutral-500 dark:text-geist-muted font-sans font-medium uppercase flex items-center gap-1">
                        <Wind className="w-3 h-3 text-blue-500" /> Wind
                    </span>
                    <div className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white tabular-nums my-0.5">
                        {String(windDir).padStart(3, "0")}° / {windSpd} kt
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted truncate">
                        {Math.abs(crosswind)} kt X-WIND ({crosswind > 0 ? "R" : "L"})
                    </div>
                </div>

                {/* Atmosphere Card */}
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <span className="text-[10px] text-neutral-500 dark:text-geist-muted font-sans font-medium uppercase flex items-center gap-1">
                        <Thermometer className="w-3 h-3 text-amber-500" /> Atmosphere
                    </span>
                    <div className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white tabular-nums my-0.5">
                        {oat}°C OAT
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-geist-muted truncate">
                        {vis} NM VISIBILITY
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
                        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                        url={
                            isDark
                                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        }
                        maxZoom={18}
                    />

                    {trackTrail.length > 1 && (
                        <Polyline
                            positions={trackTrail}
                            color="#3b82f6"
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
                    <button
                        onClick={() => setIsFollow(!isFollow)}
                        title={isFollow ? "Follow Plane (Enabled)" : "Free Pan (Disabled)"}
                        className={`p-3 rounded-xl shadow-md border transition-all ${
                            isFollow
                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white"
                                : "bg-white dark:bg-geist-surface text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline"
                        }`}
                    >
                        {isFollow ? (
                            <LocateFixed className="w-5 h-5 text-blue-500" />
                        ) : (
                            <Locate className="w-5 h-5" />
                        )}
                    </button>
                </div>

                {/* Coordinates & Nearest Airport Floating Overlay */}
                <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
                    <div className="px-3 py-1.5 rounded-lg bg-white/90 dark:bg-geist-surface/90 border border-neutral-200 dark:border-geist-hairline text-xs font-mono backdrop-blur-md text-neutral-800 dark:text-neutral-200 flex items-center gap-2 shadow-xs">
                        <Navigation className="w-3.5 h-3.5 text-blue-500" />
                        <span>
                            {lat.toFixed(4)}°, {lon.toFixed(4)}°
                        </span>
                        <span className="opacity-40">│</span>
                        <span className="truncate max-w-[180px]">
                            {currentTelemetry.aircraftTitle || "MSFS Aircraft"}
                        </span>
                    </div>

                    {nearestAirport && (
                        <div className="px-3 py-1.5 rounded-lg bg-white/90 dark:bg-geist-surface/90 border border-neutral-200 dark:border-geist-hairline text-xs font-mono backdrop-blur-md text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 shadow-xs">
                            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                            <span>
                                Nearest: <strong className="font-bold">{nearestAirport.icao}</strong> ({nearestAirport.name})
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
