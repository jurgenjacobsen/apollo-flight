import React, { useEffect, useState } from "react";
import { useFlightStore } from "../../store/flightStore";
import { Plane, ArrowRight, MapPin, Gauge } from "lucide-react";
import { RouteSector } from "../../types/route";
import { isRunningInBrowser } from "../../services/efbService";

export const EfbRouteView: React.FC = () => {
    const currentGeneratedRoute = useFlightStore((s) => s.currentGeneratedRoute);
    const [fetchedRoute, setFetchedRoute] = useState<any | null>(null);

    // In browser / mobile mode, poll or fetch route from /api/route
    useEffect(() => {
        if (isRunningInBrowser()) {
            const fetchRoute = async () => {
                try {
                    const res = await fetch("/api/route");
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data !== null) {
                            setFetchedRoute(data);
                        }
                    }
                } catch {}
            };
            fetchRoute();
            const interval = setInterval(fetchRoute, 5000);
            return () => clearInterval(interval);
        }
    }, []);

    const routeData: any = currentGeneratedRoute || fetchedRoute;

    if (!routeData) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center select-none bg-neutral-50 dark:bg-black">
                <div className="p-6 rounded-xl bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline text-neutral-500 dark:text-geist-muted max-w-md shadow-xs">
                    <Plane className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-500" />
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">
                        No Active Route Planned
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                        Generate a new procedural route or select a saved route from the
                        Apollo Flight desktop app to view the Operational Flight Plan (OFP),
                        sector waypoints, and airport metadata here.
                    </p>
                </div>
            </div>
        );
    }

    const sectors: RouteSector[] = routeData.sectors || [];
    const origin = routeData.departureAirport || sectors[0]?.departure;
    const destination =
        routeData.arrivalAirport || sectors[sectors.length - 1]?.arrival;

    return (
        <div className="flex flex-col h-full w-full p-4 md:p-6 overflow-y-auto select-none space-y-4 bg-neutral-50 dark:bg-black font-sans">
            {/* Header Summary Card */}
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs font-mono">
                <div className="flex items-center justify-between border-b border-neutral-100 dark:border-geist-hairline pb-3.5 mb-3.5">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
                            {origin?.icao || "ZZZZ"}
                        </span>
                        <ArrowRight className="w-5 h-5 text-blue-500" />
                        <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
                            {destination?.icao || "ZZZZ"}
                        </span>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-semibold font-sans">
                        {routeData.aircraftCategory || "Cat C"}
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                        <div className="text-neutral-400 dark:text-geist-muted text-[10px] uppercase font-sans">
                            TOTAL DISTANCE
                        </div>
                        <div className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                            {Math.round(routeData.totalDistanceNm || 0)} NM
                        </div>
                    </div>
                    <div>
                        <div className="text-neutral-400 dark:text-geist-muted text-[10px] uppercase font-sans">
                            EST. FLIGHT TIME
                        </div>
                        <div className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                            {Math.round((routeData.totalFlightTimeSeconds || 0) / 60)} min
                        </div>
                    </div>
                    <div>
                        <div className="text-neutral-400 dark:text-geist-muted text-[10px] uppercase font-sans">
                            SECTORS
                        </div>
                        <div className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                            {sectors.length || 1} Leg{sectors.length > 1 ? "s" : ""}
                        </div>
                    </div>
                    <div>
                        <div className="text-neutral-400 dark:text-geist-muted text-[10px] uppercase font-sans">
                            RECOMMENDED CRUISE
                        </div>
                        <div className="text-base font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                            {routeData.recommendedAltitude || "FL240"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Leg-by-Leg Sector Breakdown */}
            <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-geist-muted px-1">
                    Flight Sectors
                </h4>
                {sectors.map((sec, idx) => (
                    <div
                        key={idx}
                        className="p-4 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono"
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs flex items-center justify-center font-bold">
                                {idx + 1}
                            </span>
                            <div>
                                <div className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                                    <span>{sec.departure?.icao}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                                    <span>{sec.arrival?.icao}</span>
                                </div>
                                <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-sans">
                                    {sec.departure?.name} → {sec.arrival?.name}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-right text-xs">
                            <div>
                                <div className="text-neutral-400 dark:text-geist-muted text-[10px] font-sans">DISTANCE</div>
                                <div className="font-semibold text-neutral-900 dark:text-white">{Math.round(sec.distanceNm)} NM</div>
                            </div>
                            <div>
                                <div className="text-neutral-400 dark:text-geist-muted text-[10px] font-sans">TRACK</div>
                                <div className="font-semibold text-neutral-900 dark:text-white">
                                    {String(Math.round(sec.initialBearingDeg || 0)).padStart(3, "0")}°
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-400 dark:text-geist-muted text-[10px] font-sans">LEVEL</div>
                                <div className="font-semibold text-blue-600 dark:text-blue-400">
                                    {sec.cruiseAltitudeFt
                                        ? sec.cruiseAltitudeFt <= 3000
                                            ? `${sec.cruiseAltitudeFt} ft`
                                            : `FL${String(Math.round(sec.cruiseAltitudeFt / 100)).padStart(3, "0")}`
                                        : "FL240"}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Aerodrome Quick Reference */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {origin && (
                    <div className="p-4 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs font-mono">
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> DEPARTURE: {origin.icao}
                        </div>
                        <div className="text-xs font-semibold text-neutral-900 dark:text-white font-sans">{origin.name}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-sans mt-0.5">
                            {origin.municipality ? `${origin.municipality}, ` : ""}
                            {origin.countryName}
                        </div>
                        <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-2 pt-2 border-t border-neutral-100 dark:border-geist-hairline">
                            Elev: {origin.elevationFt?.toLocaleString() || "—"} ft │ Max Runway:{" "}
                            {origin.maxRunwayLengthFt
                                ? `${origin.maxRunwayLengthFt.toLocaleString()} ft`
                                : "—"}
                        </div>
                    </div>
                )}

                {destination && (
                    <div className="p-4 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs font-mono">
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> DESTINATION: {destination.icao}
                        </div>
                        <div className="text-xs font-semibold text-neutral-900 dark:text-white font-sans">{destination.name}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-sans mt-0.5">
                            {destination.municipality ? `${destination.municipality}, ` : ""}
                            {destination.countryName}
                        </div>
                        <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-2 pt-2 border-t border-neutral-100 dark:border-geist-hairline">
                            Elev: {destination.elevationFt?.toLocaleString() || "—"} ft │ Max Runway:{" "}
                            {destination.maxRunwayLengthFt
                                ? `${destination.maxRunwayLengthFt.toLocaleString()} ft`
                                : "—"}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
