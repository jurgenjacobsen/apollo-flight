import React from "react";
import { Tooltip } from "../ui";
import {
    MapContainer,
    TileLayer,
    Polyline,
    Marker,
    Popup,
    useMap,
} from "react-leaflet";
import L from "leaflet";
import { ARCGIS_WORLD_IMAGERY_ATTRIBUTION, ARCGIS_WORLD_IMAGERY_URL } from "../../utils/mapTiles";
import {
    Navigation,
    Plane,
    Loader2,
    Wind,
} from "lucide-react";
import { FlightRecord, TelemetryPoint, TouchdownEvent } from "../../types/flight";
import { formatWindVector, formatTemperature, formatVisibility } from "../../utils/weatherUnits";
import { calculateTouchdownGForce } from "../../utils/touchdownPhysics";

export function createTouchdownIcon(index: number, rate: number) {
    const absFpm = Math.abs(rate);
    const color =
        absFpm < 200 ? "#10b981" : absFpm < 350 ? "#f59e0b" : "#ef4444";
    return L.divIcon({
        className: "custom-td-marker",
        html: `<div style="padding: 2px 5px; font-size: 10px; font-weight: 700; font-family: monospace; background: ${color}; color: #ffffff; border: 1.5px solid #ffffff; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); white-space: nowrap;">TD ${index}</div>`,
        iconSize: [36, 18],
        iconAnchor: [18, 9],
    });
}

const defaultIcon = L.divIcon({
    className: "custom-leaflet-marker",
    html: `<div style="width: 12px; height: 12px; background: #0070f3; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 0 2px rgba(0,112,243,0.3);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

const planeIcon = L.divIcon({
    className: "custom-plane-icon",
    html: `
    <div style="transform: rotate(0deg); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: #171717; border: 1.5px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
      </svg>
    </div>
  `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

const tocIcon = L.divIcon({
    className: "custom-toc-marker",
    html: `<div style="padding: 2px 6px; font-size: 10px; font-weight: 700; font-family: monospace; background: #10b981; color: #ffffff; border: 1.5px solid #ffffff; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); white-space: nowrap;">TOC</div>`,
    iconSize: [32, 18],
    iconAnchor: [16, 9],
});

const todIcon = L.divIcon({
    className: "custom-tod-marker",
    html: `<div style="padding: 2px 6px; font-size: 10px; font-weight: 700; font-family: monospace; background: #f59e0b; color: #ffffff; border: 1.5px solid #ffffff; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); white-space: nowrap;">TOD</div>`,
    iconSize: [32, 18],
    iconAnchor: [16, 9],
});

interface ColorStop {
    alt: number;
    r: number;
    g: number;
    b: number;
}

const ALTITUDE_COLOR_STOPS: ColorStop[] = [
    { alt: 0, r: 34, g: 197, b: 94 },
    { alt: 10000, r: 132, g: 204, b: 22 },
    { alt: 20000, r: 234, g: 179, b: 8 },
    { alt: 32000, r: 249, g: 115, b: 22 },
    { alt: 45000, r: 239, g: 68, b: 68 },
];

export function getAltitudeColor(altitudeFt: number): string {
    const alt = Math.max(0, altitudeFt);
    const firstStop = ALTITUDE_COLOR_STOPS[0];
    if (alt <= firstStop.alt) {
        return `rgb(${firstStop.r}, ${firstStop.g}, ${firstStop.b})`;
    }
    const lastStop = ALTITUDE_COLOR_STOPS[ALTITUDE_COLOR_STOPS.length - 1];
    if (alt >= lastStop.alt) {
        return `rgb(${lastStop.r}, ${lastStop.g}, ${lastStop.b})`;
    }

    for (let i = 0; i < ALTITUDE_COLOR_STOPS.length - 1; i++) {
        const s0 = ALTITUDE_COLOR_STOPS[i];
        const s1 = ALTITUDE_COLOR_STOPS[i + 1];
        if (alt >= s0.alt && alt <= s1.alt) {
            const t = (alt - s0.alt) / (s1.alt - s0.alt);
            const r = Math.round(s0.r + t * (s1.r - s0.r));
            const g = Math.round(s0.g + t * (s1.g - s0.g));
            const b = Math.round(s0.b + t * (s1.b - s0.b));
            return `rgb(${r}, ${g}, ${b})`;
        }
    }

    return `rgb(${lastStop.r}, ${lastStop.g}, ${lastStop.b})`;
}

function ChangeView({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
    const map = useMap();
    React.useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }, [bounds, map]);
    return null;
}

export interface AltitudeSegment {
    positions: [number, number][];
    color: string;
}

interface DebriefMapProps {
    flight: FlightRecord;
    coordinates: [number, number][];
    bounds: L.LatLngBoundsExpression | null;
    points: TelemetryPoint[];
    altitudeSegments: AltitudeSegment[];
    tocPoint: TelemetryPoint | null;
    todPoint: TelemetryPoint | null;
    touchdowns: TouchdownEvent[];
    resolvedTouchdownAirports: Record<number, { icao: string; name?: string }>;
    activeScrubPoint: TelemetryPoint | null;
    isHeavyReady: boolean;
    isLoadingFlightDetails: boolean;
    theme: string;
    windSpeedUnit: "kt" | "mps";
    temperatureUnit: "c" | "f";
    visibilityUnit: "sm" | "metric";
}

export const DebriefMap: React.FC<DebriefMapProps> = ({
    flight,
    coordinates,
    bounds,
    points,
    altitudeSegments,
    tocPoint,
    todPoint,
    touchdowns,
    resolvedTouchdownAirports,
    activeScrubPoint,
    isHeavyReady,
    isLoadingFlightDetails,
    theme,
    windSpeedUnit,
    temperatureUnit,
    visibilityUnit,
}) => {
    return (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 flex flex-col space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                <div className="flex items-center gap-2">
                    <Navigation className="w-3.5 h-3.5 text-neutral-500" />
                    <span className="font-medium text-neutral-900 dark:text-white tracking-tight">
                        Flight Recording Map
                    </span>
                </div>

                {/* Altitude Gradient Legend (0 ft Green -> 45,000+ ft Red) */}
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    <div className="flex items-center gap-2">
                        <span className="text-neutral-500 dark:text-neutral-400 text-[10px]">
                            0 ft
                        </span>
                        <Tooltip content="Altitude color gradient: 0 ft to 45,000+ ft">
                            <div
                                className="w-28 sm:w-36 h-2 rounded-full border border-neutral-200 dark:border-neutral-700 shadow-inner"
                                style={{
                                    background:
                                        "linear-gradient(to right, #22c55e 0%, #84cc16 22%, #eab308 44%, #f97316 71%, #ef4444 100%)",
                                }}
                            />
                        </Tooltip>
                        <span className="text-neutral-500 dark:text-neutral-400 text-[10px]">
                            45,000+ ft
                        </span>
                    </div>
                </div>
            </div>

            <div className="h-[360px] w-full rounded-sm overflow-hidden border border-neutral-200 dark:border-geist-hairline relative z-0 flex items-center justify-center bg-neutral-50 dark:bg-black/20">
                {!isHeavyReady ||
                isLoadingFlightDetails ||
                points.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden bg-neutral-100/60 dark:bg-[#111111]/80">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                        <div className="relative flex flex-col items-center gap-2 px-4 py-3 rounded-sm bg-white/90 dark:bg-black/70 border border-neutral-200/80 dark:border-neutral-800 backdrop-blur-xs shadow-xs">
                            {points.length === 0 &&
                            !isLoadingFlightDetails ? (
                                <div className="flex flex-col items-center gap-1.5 text-center">
                                    <div className="flex items-center gap-2">
                                        <Plane className="w-4 h-4 text-neutral-500" />
                                        <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                                            Summary Flight (No Raw
                                            Telemetry)
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-neutral-500 max-w-xs">
                                        This flight was logged or imported
                                        without raw GPS telemetry tracks.
                                        Flight metrics and touchdowns are
                                        preserved.
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-neutral-500 dark:text-neutral-400" />
                                        <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                            {isLoadingFlightDetails
                                                ? "Fetching flight trajectory..."
                                                : "Initializing 2D GPS track..."}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                        Rendering altitude gradient waypoint
                                        segments
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                ) : coordinates.length > 0 ? (
                    <MapContainer
                        key={flight.id}
                        center={coordinates[0]}
                        zoom={8}
                        preferCanvas={true}
                        style={{ height: "100%", width: "100%" }}
                        className={theme === "dark" ? "dark-tiles" : ""}
                    >
                        <ChangeView bounds={bounds} />
                        <TileLayer
                            attribution={ARCGIS_WORLD_IMAGERY_ATTRIBUTION}
                            url={ARCGIS_WORLD_IMAGERY_URL}
                            maxZoom={19}
                        />

                        {/* Multi-Colored Altitude Segments */}
                        {altitudeSegments.map((seg, idx) => (
                            <Polyline
                                key={`seg-${idx}`}
                                positions={seg.positions}
                                color={seg.color}
                                weight={3.5}
                                opacity={0.9}
                            />
                        ))}

                        {/* Origin Marker */}
                        {points.length > 0 && (
                            <Marker
                                position={[
                                    points[0].latitude,
                                    points[0].longitude,
                                ]}
                                icon={defaultIcon}
                            >
                                <Popup>
                                    <div className="text-xs">
                                        <strong>
                                            Origin: {flight.departureIcao}
                                        </strong>
                                    </div>
                                </Popup>
                            </Marker>
                        )}

                        {/* Destination Marker */}
                        {points.length > 1 && (
                            <Marker
                                position={[
                                    points[points.length - 1].latitude,
                                    points[points.length - 1].longitude,
                                ]}
                                icon={defaultIcon}
                            >
                                <Popup>
                                    <div className="text-xs">
                                        <strong>
                                            Destination:{" "}
                                            {flight.arrivalIcao}
                                        </strong>
                                    </div>
                                </Popup>
                            </Marker>
                        )}

                        {/* Top of Climb (TOC) Marker */}
                        {tocPoint && (
                            <Marker
                                position={[
                                    tocPoint.latitude,
                                    tocPoint.longitude,
                                ]}
                                icon={tocIcon}
                            >
                                <Popup>
                                    <div className="text-xs">
                                        <strong className="text-emerald-600">
                                            Top of Climb (TOC)
                                        </strong>
                                        <br />
                                        Altitude:{" "}
                                        {tocPoint.altitudeMsl.toLocaleString()}{" "}
                                        ft
                                        <br />
                                        Time:{" "}
                                        {new Date(
                                            tocPoint.timestamp,
                                        ).toLocaleTimeString()}
                                    </div>
                                </Popup>
                            </Marker>
                        )}

                        {/* Top of Descent (TOD) Marker */}
                        {todPoint && (
                            <Marker
                                position={[
                                    todPoint.latitude,
                                    todPoint.longitude,
                                ]}
                                icon={todIcon}
                            >
                                <Popup>
                                    <div className="text-xs">
                                        <strong className="text-amber-600">
                                            Top of Descent (TOD)
                                        </strong>
                                        <br />
                                        Altitude:{" "}
                                        {todPoint.altitudeMsl.toLocaleString()}{" "}
                                        ft
                                        <br />
                                        Time:{" "}
                                        {new Date(
                                            todPoint.timestamp,
                                        ).toLocaleTimeString()}
                                    </div>
                                </Popup>
                            </Marker>
                        )}

                        {/* Touchdown Markers */}
                        {touchdowns.map((td, idx) => {
                            const gVal =
                                td.gForce ??
                                calculateTouchdownGForce(
                                    td.verticalSpeedFpm,
                                );
                            const airport =
                                resolvedTouchdownAirports[idx] ||
                                (td.airportIcao
                                    ? {
                                          icao: td.airportIcao,
                                          name: td.airportName,
                                      }
                                    : null);
                            return (
                                <Marker
                                    key={`map-td-${idx}`}
                                    position={[td.latitude, td.longitude]}
                                    icon={createTouchdownIcon(
                                        idx + 1,
                                        td.verticalSpeedFpm,
                                    )}
                                >
                                    <Popup>
                                        <div className="text-xs space-y-0.5">
                                            <div className="flex items-center gap-1.5 font-semibold text-neutral-900">
                                                <span>
                                                    Touchdown #{idx + 1}
                                                </span>
                                                {airport?.icao && (
                                                    <Tooltip
                                                        content={
                                                            airport.name
                                                                ? `Touchdown at ${airport.name} (${airport.icao})`
                                                                : `Touchdown at ${airport.icao}`
                                                        }
                                                    >
                                                        <span className="text-[10px] font-mono px-1 py-0.2 rounded-sm bg-neutral-100 text-neutral-800 border border-neutral-300">
                                                            {airport.icao}
                                                        </span>
                                                    </Tooltip>
                                                )}
                                            </div>
                                            <div>
                                                Rate:{" "}
                                                <span className="font-mono font-bold">
                                                    {td.verticalSpeedFpm}{" "}
                                                    fpm
                                                </span>
                                            </div>
                                            <div>
                                                Load:{" "}
                                                <span className="font-mono font-bold">
                                                    +{gVal.toFixed(2)} G
                                                </span>
                                            </div>
                                            {td.groundSpeedKt !==
                                                undefined && (
                                                <div>
                                                    GS: {td.groundSpeedKt}{" "}
                                                    kt
                                                </div>
                                            )}
                                            <div>
                                                Time:{" "}
                                                {new Date(
                                                    td.timestamp,
                                                ).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}

                        {/* Scrubbed Live Aircraft Marker */}
                        {activeScrubPoint && (
                            <Marker
                                position={[
                                    activeScrubPoint.latitude,
                                    activeScrubPoint.longitude,
                                ]}
                                icon={planeIcon}
                            >
                                <Popup>
                                    <div className="text-xs space-y-0.5">
                                        <div>
                                            <strong>Alt:</strong>{" "}
                                            {activeScrubPoint.altitudeMsl.toLocaleString()}{" "}
                                            ft
                                        </div>
                                        <div>
                                            <strong>GS:</strong>{" "}
                                            {activeScrubPoint.groundSpeed}{" "}
                                            kt · <strong>HDG:</strong>{" "}
                                            {activeScrubPoint.heading}°
                                        </div>
                                        {activeScrubPoint.windSpeed !==
                                            undefined &&
                                            activeScrubPoint.windDirection !==
                                                undefined && (
                                                <div>
                                                    <strong>Wind:</strong>{" "}
                                                    {formatWindVector(
                                                        activeScrubPoint.windDirection,
                                                        activeScrubPoint.windSpeed,
                                                        windSpeedUnit,
                                                    )}
                                                </div>
                                            )}
                                        {(activeScrubPoint.oat !==
                                            undefined ||
                                            activeScrubPoint.tat !==
                                                undefined) && (
                                            <div>
                                                <strong>Temp:</strong> OAT{" "}
                                                {activeScrubPoint.oat !==
                                                undefined
                                                    ? formatTemperature(
                                                          activeScrubPoint.oat,
                                                          temperatureUnit,
                                                      )
                                                    : "--"}
                                                {activeScrubPoint.tat !==
                                                undefined
                                                    ? ` · TAT ${formatTemperature(
                                                          activeScrubPoint.tat,
                                                          temperatureUnit,
                                                      )}`
                                                    : ""}
                                            </div>
                                        )}
                                        {activeScrubPoint.visibility !==
                                            undefined && (
                                            <div>
                                                <strong>Vis:</strong>{" "}
                                                {formatVisibility(
                                                    activeScrubPoint.visibility,
                                                    visibilityUnit,
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        )}
                    </MapContainer>
                ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-400">
                        <Navigation className="w-8 h-8 mb-2 animate-pulse text-neutral-400 dark:text-neutral-500" />
                        <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            {isLoadingFlightDetails
                                ? "Loading GPS Trajectory..."
                                : "No telemetry points recorded for this flight"}
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                            {isLoadingFlightDetails
                                ? "Fetching telemetry dataset from local SQLite store"
                                : "Flight contains header information without GPS track samples"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
