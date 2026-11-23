import React from "react";
import { GeneratedRoute } from "../../types/route";
import { formatFlightLevelOrAltitude } from "../../data/aircraftCategories";
import { Radio, ChevronDown, Mountain, AlertTriangle, GitBranch } from "lucide-react";
import { formatDurationHoursMinutes } from "../../data/aircraftCategories";

interface SectorAccordionListProps {
    route: GeneratedRoute;
    expandedSectors: Record<number, boolean>;
    toggleSectorExpanded: (sectorIndex: number) => void;
    setExpandedSectors: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
    runwayUnit: "ft" | "m";
    airacStatus?: { isInstalled: boolean; currentCycle?: string } | null;
    sectorProcedures: Record<number, any>;
    setSectorProcedures: React.Dispatch<React.SetStateAction<Record<number, any>>>;
    handleRouteAirwaysForSector: (sectorIndexZeroBased: number) => Promise<void>;
    isRoutingAirways: boolean;
}

export const SectorAccordionList: React.FC<SectorAccordionListProps> = ({
    route,
    expandedSectors,
    toggleSectorExpanded,
    setExpandedSectors,
    runwayUnit,
    airacStatus,
    sectorProcedures,
    setSectorProcedures,
    handleRouteAirwaysForSector,
    isRoutingAirways,
}) => {
    return (
        <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                        Sector Flight Dispatch
                    </h3>
                    <p className="text-[11px] text-neutral-500 dark:text-geist-muted">
                        Calculated using standard cruise TAS and direct distance
                    </p>
                </div>
                {route.sectors.length > 1 && (
                    <button
                        type="button"
                        onClick={() => {
                            const allExpanded = route.sectors.every(
                                (s) => expandedSectors[s.sectorIndex],
                            );
                            const nextState: Record<number, boolean> = {};
                            route.sectors.forEach((s) => {
                                nextState[s.sectorIndex] = !allExpanded;
                            });
                            setExpandedSectors(nextState);
                        }}
                        className="text-[11px] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors self-start sm:self-auto cursor-pointer"
                    >
                        {route.sectors.every((s) => expandedSectors[s.sectorIndex])
                            ? "Collapse All Details"
                            : "Expand All Details"}
                    </button>
                )}
            </div>

            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[680px]">
                        <thead>
                            <tr className="border-b border-neutral-200 dark:border-geist-hairline bg-neutral-50/80 dark:bg-[#151c28] text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 select-none">
                                <th className="py-2.5 px-3 w-10 text-center">#</th>
                                <th className="py-2.5 px-3">Sector</th>
                                <th className="py-2.5 px-3">Aerodrome Runways</th>
                                <th className="py-2.5 px-3">Distance</th>
                                <th className="py-2.5 px-3">Cruise & MORA</th>
                                <th className="py-2.5 px-3">
                                    {route.includeGroundTime ? "Block Time" : "Airborne"}
                                </th>
                                <th className="py-2.5 px-3 w-10 text-center">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-geist-hairline text-xs">
                            {route.sectors.map((sector) => {
                                const isExpanded = Boolean(expandedSectors[sector.sectorIndex]);
                                return (
                                    <React.Fragment key={sector.sectorIndex}>
                                        <tr
                                            onClick={() => toggleSectorExpanded(sector.sectorIndex)}
                                            className={`cursor-pointer transition-colors ${
                                                isExpanded
                                                    ? "bg-neutral-50/60 dark:bg-geist-card/60"
                                                    : "hover:bg-neutral-50/80 dark:hover:bg-[#161d2b]/60"
                                            }`}
                                        >
                                            {/* Leg Number */}
                                            <td className="py-3 px-3 text-center align-middle">
                                                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black inline-flex items-center justify-center text-[10px] font-bold">
                                                    {sector.sectorIndex}
                                                </span>
                                            </td>

                                            {/* Sector Route */}
                                            <td className="py-3 px-3 align-middle">
                                                <div className="flex items-center gap-1.5 font-bold text-neutral-900 dark:text-white">
                                                    <span>{sector.departure.icao}</span>
                                                    <span className="text-neutral-400 font-normal">➔</span>
                                                    <span>{sector.arrival.icao}</span>
                                                </div>
                                                <div
                                                    className="text-[11px] text-neutral-500 dark:text-geist-muted truncate max-w-[200px]"
                                                    title={`${sector.departure.name} to ${sector.arrival.name}`}
                                                >
                                                    {sector.departure.name} ➔ {sector.arrival.name}
                                                </div>
                                            </td>

                                            {/* Aerodrome Runways */}
                                            <td className="py-3 px-3 align-middle">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1.5 text-[11px]">
                                                        <span className="text-neutral-400 font-medium">Dep:</span>
                                                        {sector.departure.maxRunwayLengthFt && sector.departure.maxRunwayLengthFt > 0 ? (
                                                            <span className="text-neutral-800 dark:text-neutral-200 tabular-nums">
                                                                {runwayUnit === "m"
                                                                    ? `${Math.round(sector.departure.maxRunwayLengthFt * 0.3048).toLocaleString()} m`
                                                                    : `${sector.departure.maxRunwayLengthFt.toLocaleString()} ft`}
                                                            </span>
                                                        ) : null}
                                                        <span
                                                            className={`px-1 py-0.2 rounded text-[9px] font-medium ${
                                                                sector.departure.hasPaved
                                                                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                                                    : sector.departure.hasUnpaved
                                                                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                                                                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                                                            }`}
                                                        >
                                                            {sector.departure.hasPaved
                                                                ? "Paved"
                                                                : sector.departure.hasUnpaved
                                                                ? "Unpaved"
                                                                : "Std"}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[11px]">
                                                        <span className="text-neutral-400 font-medium">Arr:</span>
                                                        {sector.arrival.maxRunwayLengthFt && sector.arrival.maxRunwayLengthFt > 0 ? (
                                                            <span className="text-neutral-800 dark:text-neutral-200 tabular-nums">
                                                                {runwayUnit === "m"
                                                                    ? `${Math.round(sector.arrival.maxRunwayLengthFt * 0.3048).toLocaleString()} m`
                                                                    : `${sector.arrival.maxRunwayLengthFt.toLocaleString()} ft`}
                                                            </span>
                                                        ) : null}
                                                        <span
                                                            className={`px-1 py-0.2 rounded text-[9px] font-medium ${
                                                                sector.arrival.hasPaved
                                                                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                                                    : sector.arrival.hasUnpaved
                                                                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                                                                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                                                            }`}
                                                        >
                                                            {sector.arrival.hasPaved
                                                                ? "Paved"
                                                                : sector.arrival.hasUnpaved
                                                                ? "Unpaved"
                                                                : "Std"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Distance */}
                                            <td className="py-3 px-3 align-middle font-semibold text-neutral-900 dark:text-white tabular-nums">
                                                {sector.distanceNm} NM
                                            </td>

                                            {/* Altitude & MORA */}
                                            <td className="py-3 px-3 align-middle">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-semibold text-neutral-900 dark:text-white">
                                                        {formatFlightLevelOrAltitude(sector.cruiseAltitudeFt)}
                                                    </span>
                                                    {sector.isMountainous && (
                                                        <span
                                                            className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60"
                                                            title="Mountainous Terrain (≥3,000 ft variation within 10 NM)"
                                                        >
                                                            Mountainous
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                                                    {sector.corridorMsaFt !== undefined
                                                        ? `MORA ${formatFlightLevelOrAltitude(sector.corridorMsaFt)}`
                                                        : `${sector.cruiseAltitudeFt.toLocaleString()} ft`}
                                                </div>
                                            </td>

                                            {/* Duration */}
                                            <td className="py-3 px-3 align-middle">
                                                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                    {formatDurationHoursMinutes(sector.totalMinutes)}
                                                </span>
                                            </td>

                                            {/* Expand Chevron */}
                                            <td className="py-3 px-3 text-center align-middle">
                                                <div className="inline-flex items-center justify-center p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
                                                    <ChevronDown
                                                        className={`w-4 h-4 transition-transform duration-200 ${
                                                            isExpanded ? "rotate-180" : ""
                                                        }`}
                                                    />
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Expanded Row for Terrain Corridor Details & Procedures */}
                                        {isExpanded && (
                                            <tr className="bg-neutral-50/80 dark:bg-black/30 border-b border-neutral-200 dark:border-geist-hairline">
                                                <td colSpan={7} className="p-4 space-y-3">
                                                    {sector.corridorMsaFt !== undefined && (
                                                        <div className="p-3 rounded bg-white dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-xs space-y-1">
                                                            <div className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                                                                <span>Corridor Minimum Safe Altitude:</span>
                                                                <span className="font-mono text-amber-600 dark:text-amber-400">
                                                                    {formatFlightLevelOrAltitude(sector.corridorMsaFt)} ({sector.corridorMsaFt.toLocaleString()} ft MORA)
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-neutral-500">
                                                                10 NM corridor · Highest relief ~{(sector.peakTerrainFt || 0).toLocaleString()} ft MSL
                                                            </p>
                                                            {sector.isMountainous && (
                                                                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                                                    Mountainous terrain buffer applied (+2,000 ft clearance margin)
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* AIRAC / Procedure Selector */}
                                                    <div className="p-3 rounded bg-white dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-2">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                            <div>
                                                                <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                                                                    IFR Terminal Procedures (SID & STAR)
                                                                </h4>
                                                                <div className="text-[11px] text-neutral-500">
                                                                    AIRAC Cycle:{" "}
                                                                    <span className="font-semibold font-mono">
                                                                        {airacStatus?.isInstalled
                                                                            ? airacStatus.currentCycle
                                                                                ? `Cycle ${airacStatus.currentCycle}`
                                                                                : "Active"
                                                                            : "No AIRAC"}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {airacStatus?.isInstalled ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleRouteAirwaysForSector(sector.sectorIndex - 1);
                                                                    }}
                                                                    disabled={isRoutingAirways}
                                                                    className="px-2.5 py-1 rounded text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                                                                >
                                                                    <Radio className={`w-3 h-3 ${isRoutingAirways ? "animate-spin" : ""}`} />
                                                                    <span>{isRoutingAirways ? "Calculating..." : "Solve Airway Route"}</span>
                                                                </button>
                                                            ) : (
                                                                <span className="text-[11px] text-neutral-400">
                                                                    Install Navigraph AIRAC in Settings to enable
                                                                </span>
                                                            )}
                                                        </div>

                                                        {airacStatus?.isInstalled && (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                                                <div>
                                                                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                                                                        Departure SID ({sector.departure.icao})
                                                                    </label>
                                                                    <select
                                                                        value={sectorProcedures[sector.sectorIndex]?.selectedSid || ""}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setSectorProcedures((prev) => ({
                                                                                ...prev,
                                                                                [sector.sectorIndex]: {
                                                                                    ...prev[sector.sectorIndex],
                                                                                    selectedSid: val,
                                                                                },
                                                                            }));
                                                                        }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="w-full text-xs p-1.5 rounded border border-neutral-300 dark:border-geist-hairline bg-neutral-50 dark:bg-geist-card text-neutral-900 dark:text-white font-mono"
                                                                    >
                                                                        <option value="">-- Direct / Default Exit --</option>
                                                                        {sectorProcedures[sector.sectorIndex]?.depProcs?.sids?.map((sid: any) => (
                                                                            <option key={sid.ident} value={sid.ident}>
                                                                                {sid.ident} {sid.transition ? `(${sid.transition})` : ""}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>

                                                                <div>
                                                                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                                                                        Arrival STAR ({sector.arrival.icao})
                                                                    </label>
                                                                    <select
                                                                        value={sectorProcedures[sector.sectorIndex]?.selectedStar || ""}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setSectorProcedures((prev) => ({
                                                                                ...prev,
                                                                                [sector.sectorIndex]: {
                                                                                    ...prev[sector.sectorIndex],
                                                                                    selectedStar: val,
                                                                                },
                                                                            }));
                                                                        }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="w-full text-xs p-1.5 rounded border border-neutral-300 dark:border-geist-hairline bg-neutral-50 dark:bg-geist-card text-neutral-900 dark:text-white font-mono"
                                                                    >
                                                                        <option value="">-- Direct / Default Entry --</option>
                                                                        {sectorProcedures[sector.sectorIndex]?.arrProcs?.stars?.map((star: any) => (
                                                                            <option key={star.ident} value={star.ident}>
                                                                                {star.ident} {star.transition ? `(${star.transition})` : ""}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Waypoint Sequence Chips */}
                                                        {sector.waypoints && sector.waypoints.length > 0 && (
                                                            <div className="pt-2 border-t border-neutral-100 dark:border-geist-hairline">
                                                                <div className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 flex items-center justify-between">
                                                                    <span>Contiguous Airway Routing ({sector.waypoints.length} Fixes):</span>
                                                                    <span className="text-[10px] text-neutral-400 font-mono">
                                                                        {sector.distanceNm} NM Total
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto p-1.5 rounded bg-neutral-50 dark:bg-black/30 border border-neutral-200 dark:border-geist-hairline font-mono text-[11px]">
                                                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                                        {sector.departure.icao}
                                                                    </span>
                                                                    {sector.waypoints.map((w, wIdx) => (
                                                                        <React.Fragment key={`${w.ident}-${wIdx}`}>
                                                                            <span className="text-neutral-400 text-[10px]">➔</span>
                                                                            <span
                                                                                className="px-1.5 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 shadow-2xs"
                                                                                title={`Fix: ${w.ident}${w.airway ? ` · Airway: ${w.airway}` : ""} · Distance: ${w.distanceNm?.toFixed(1) || 0} NM`}
                                                                            >
                                                                                <span className="font-semibold text-sky-600 dark:text-sky-400">
                                                                                    {w.ident}
                                                                                </span>
                                                                                {w.airway && (
                                                                                    <span className="text-neutral-400 text-[9px] ml-1">
                                                                                        [{w.airway}]
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        </React.Fragment>
                                                                    ))}
                                                                    <span className="text-neutral-400 text-[10px]">➔</span>
                                                                    <span className="font-bold text-purple-600 dark:text-purple-400">
                                                                        {sector.arrival.icao}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
