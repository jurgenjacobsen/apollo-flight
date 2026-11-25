import React from "react";
import { GeneratedRoute } from "../../types/route";
import { formatFlightLevelOrAltitude } from "../../data/aircraftCategories";
import { Mountain, ShieldAlert, ArrowRight } from "lucide-react";

interface ElevationProfileChartProps {
    route: GeneratedRoute;
}

export const ElevationProfileChart: React.FC<ElevationProfileChartProps> = ({
    route,
}) => {
    if (!route.sectors || route.sectors.length === 0) return null;

    return (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Mountain className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                        Terrain Clearance & MORA Profile
                    </h3>
                </div>
                <div className="text-[11px] text-neutral-500">
                    {route.sectors.length} {route.sectors.length === 1 ? "Sector" : "Sectors"} · {route.totalDistanceNm} NM Total
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {route.sectors.map((sector) => {
                    const depElev = sector.departure.elevationFt || 0;
                    const arrElev = sector.arrival.elevationFt || 0;
                    const cruiseAlt = sector.cruiseAltitudeFt || 0;
                    const peakRelief = sector.peakTerrainFt || 0;
                    const morAlt = sector.corridorMsaFt || 0;

                    return (
                        <div
                            key={`profile-leg-${sector.sectorIndex}`}
                            className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-2"
                        >
                            <div className="flex items-center justify-between text-xs font-semibold">
                                <div className="flex items-center gap-1.5 text-neutral-900 dark:text-white">
                                    <span>Leg {sector.sectorIndex}:</span>
                                    <span>{sector.departure.icao}</span>
                                    <ArrowRight className="w-3 h-3 text-neutral-400" />
                                    <span>{sector.arrival.icao}</span>
                                </div>
                                <span className="text-[10px] font-normal text-neutral-500 tabular-nums">
                                    {sector.distanceNm} NM
                                </span>
                            </div>

                            {/* Altitude & MORA comparison bar */}
                            <div className="space-y-1.5 pt-1">
                                <div className="flex justify-between text-[11px] tabular-nums">
                                    <span className="text-sky-600 dark:text-sky-400 font-semibold">
                                        Cruise: {formatFlightLevelOrAltitude(cruiseAlt)}
                                    </span>
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                                        MORA: {formatFlightLevelOrAltitude(morAlt)}
                                    </span>
                                </div>

                                {/* Visual Relative Step Bar */}
                                <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-2 rounded-full overflow-hidden relative">
                                    {cruiseAlt > 0 && (
                                        <div
                                            className="bg-sky-500 h-full rounded-full transition-all"
                                            style={{
                                                width: `${Math.min(100, Math.max(15, (morAlt / Math.max(cruiseAlt, morAlt)) * 100))}%`,
                                            }}
                                            title={`MORA: ${morAlt} ft / Cruise: ${cruiseAlt} ft`}
                                        />
                                    )}
                                </div>

                                <div className="flex justify-between text-[10px] text-neutral-400">
                                    <span>Dep: {depElev.toLocaleString()} ft</span>
                                    <span>Peak: ~{peakRelief.toLocaleString()} ft</span>
                                    <span>Arr: {arrElev.toLocaleString()} ft</span>
                                </div>
                            </div>

                            {sector.isMountainous && (
                                <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium pt-1 border-t border-neutral-100 dark:border-neutral-800">
                                    <ShieldAlert className="w-3 h-3 shrink-0" />
                                    <span>Mountainous corridor clearance applied</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
