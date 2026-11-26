import React from "react";
import { TrendingDown } from "lucide-react";
import { TouchdownEvent, FlightRecord } from "../../types/flight";
import { calculateTouchdownGForce } from "../../utils/touchdownPhysics";
import { formatWindSpeed } from "../../utils/weatherUnits";
import { formatPitchAngle, formatRollAngle } from "../../utils/flightFormatters";
import { Tooltip } from "../ui";

interface TouchdownCardProps {
    touchdowns: TouchdownEvent[];
    avgTouchdownRate: number | null;
    resolvedTouchdownAirports: Record<number, { icao: string; name?: string }>;
    flight: FlightRecord | null;
    windSpeedUnit: "kt" | "mps";
}

export const TouchdownCard: React.FC<TouchdownCardProps> = ({
    touchdowns,
    avgTouchdownRate,
    resolvedTouchdownAirports,
    flight,
    windSpeedUnit,
}) => {
    if (!touchdowns || touchdowns.length === 0) return null;

    return (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-neutral-500" />
                    <h3 className="text-xs font-medium tracking-tight text-neutral-900 dark:text-white">
                        Touchdown & Landing Analysis
                    </h3>
                </div>
                {avgTouchdownRate !== null && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-2 tabular-nums">
                        <span>Overall Touchdown Rate:</span>
                        <span className="font-semibold text-neutral-900 dark:text-white">
                            {avgTouchdownRate} fpm
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white">
                            (+
                            {calculateTouchdownGForce(
                                avgTouchdownRate,
                            ).toFixed(2)}{" "}
                            G)
                        </span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                {touchdowns.map((td, idx) => {
                    const gVal =
                        td.gForce ??
                        calculateTouchdownGForce(td.verticalSpeedFpm);
                    const airport =
                        resolvedTouchdownAirports[idx] ||
                        (td.airportIcao
                            ? {
                                  icao: td.airportIcao,
                                  name: td.airportName,
                              }
                            : null);
                    const isDifferentFromArrival =
                        airport?.icao &&
                        flight &&
                        airport.icao.toUpperCase() !==
                            flight.arrivalIcao.toUpperCase();

                    return (
                        <div
                            key={`td-card-${idx}`}
                            className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-semibold text-neutral-900 dark:text-white whitespace-nowrap">
                                        Touchdown #{idx + 1}
                                    </span>
                                    {airport?.icao && (
                                        <Tooltip
                                            content={`Touchdown at ${airport.name ? `${airport.name} (${airport.icao})` : airport.icao}`}
                                        >
                                            <span
                                                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs border transition-colors ${
                                                    isDifferentFromArrival
                                                        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                                                        : "bg-neutral-100 dark:bg-[#202020] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700"
                                                }`}
                                            >
                                                {airport.icao}
                                            </span>
                                        </Tooltip>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    {td.bouncesCount && td.bouncesCount > 0 ? (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 tabular-nums">
                                            {td.bouncesCount} {td.bouncesCount === 1 ? "Bounce" : "Bounces"}
                                        </span>
                                    ) : null}
                                    {td.gForceSim !== undefined && (
                                        <Tooltip content="MSFS Simulator Physics G-Force">
                                            <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700">
                                                +{td.gForceSim.toFixed(2)} G (Sim)
                                            </span>
                                        </Tooltip>
                                    )}
                                    <Tooltip content="Oleo Strut Calculated Deceleration Load">
                                        <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700">
                                            +{gVal.toFixed(2)} G (Strut)
                                        </span>
                                    </Tooltip>
                                </div>
                            </div>

                            <div className="flex items-baseline justify-between tabular-nums">
                                <span className="text-lg font-bold text-neutral-900 dark:text-white">
                                    {td.verticalSpeedFpm}{" "}
                                    <span className="text-[11px] font-normal text-neutral-500">
                                        fpm
                                    </span>
                                </span>
                                <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                                    {td.indicatedAirspeedKt !== undefined
                                        ? `${td.indicatedAirspeedKt} kt IAS • `
                                        : ""}
                                    {td.groundSpeedKt !== undefined
                                        ? `${td.groundSpeedKt} kt GS`
                                        : ""}
                                </span>
                            </div>

                            {/* Dynamics & Wind Vector */}
                            {(td.sideslipDeg !== undefined ||
                                td.headwindKt !== undefined ||
                                td.crosswindKt !== undefined) && (
                                <div className="flex items-center justify-between text-[11px] text-neutral-600 dark:text-neutral-400 border-t border-neutral-100 dark:border-geist-hairline pt-1 tabular-nums">
                                    <span>
                                        {td.sideslipDeg !== undefined
                                            ? `${Math.abs(td.sideslipDeg)}° ${
                                                  td.sideslipDeg > 0
                                                      ? "R Drift"
                                                      : td.sideslipDeg < 0
                                                      ? "L Drift"
                                                      : "Aligned"
                                              }`
                                            : ""}
                                    </span>
                                    <span>
                                        {td.headwindKt !== undefined && (
                                            <span>
                                                {td.headwindKt >= 0
                                                    ? `${formatWindSpeed(td.headwindKt, windSpeedUnit)} HW`
                                                    : `${formatWindSpeed(Math.abs(td.headwindKt), windSpeedUnit)} TW`}
                                            </span>
                                        )}
                                        {td.crosswindKt !== undefined && (
                                            <span className="ml-1">
                                                · {formatWindSpeed(Math.abs(td.crosswindKt), windSpeedUnit)}{" "}
                                                {td.crosswindKt >= 0 ? "R" : "L"}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-geist-muted border-t border-neutral-200 dark:border-geist-hairline pt-1.5">
                                <span>
                                    {new Date(
                                        td.timestamp,
                                    ).toLocaleTimeString()}
                                </span>
                                {(td.pitchDeg !== undefined ||
                                    td.bankDeg !== undefined) && (
                                    <span className="tabular-nums">
                                        {td.pitchDeg !== undefined
                                            ? `${formatPitchAngle(td.pitchDeg)} Pitch`
                                            : ""}
                                        {td.pitchDeg !== undefined &&
                                        td.bankDeg !== undefined
                                            ? " · "
                                            : ""}
                                        {td.bankDeg !== undefined
                                            ? `${formatRollAngle(td.bankDeg, false)} Bank`
                                            : ""}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
