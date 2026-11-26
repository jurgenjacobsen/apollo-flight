import React from "react";
import { Wind, Thermometer, Eye, Compass } from "lucide-react";
import {
    formatVisibility,
    formatWindVector,
    formatTemperature,
} from "../../utils/weatherUnits";

export interface WeatherStats {
    hasWeather: boolean;
    minOat?: number;
    maxOat?: number;
    minVis?: number;
    avgCruiseWindSpd?: number;
    avgCruiseWindDir?: number;
    maxWindSpd?: number;
    maxWindDir?: number;
}

interface AtmosphericCardsProps {
    weatherStats: WeatherStats;
    temperatureUnit: "c" | "f";
    visibilityUnit: "sm" | "metric";
    windSpeedUnit: "kt" | "mps";
}

export const AtmosphericCards: React.FC<AtmosphericCardsProps> = ({
    weatherStats,
    temperatureUnit,
    visibilityUnit,
    windSpeedUnit,
}) => {
    if (!weatherStats.hasWeather) return null;

    return (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-xs">
            <div className="flex items-center gap-2">
                <Wind className="w-3.5 h-3.5 text-neutral-500" />
                <h3 className="text-xs font-medium tracking-tight text-neutral-900 dark:text-white">
                    Atmospheric & Environmental Totals
                </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                {/* OAT Range */}
                <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                        <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                        <span>OAT Range (Min / Max)</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {weatherStats.minOat !== undefined
                            ? formatTemperature(
                                  weatherStats.minOat,
                                  temperatureUnit,
                              )
                            : "--"}
                        <span className="text-neutral-400 font-sans mx-1">
                            /
                        </span>
                        {weatherStats.maxOat !== undefined
                            ? formatTemperature(
                                  weatherStats.maxOat,
                                  temperatureUnit,
                              )
                            : "--"}
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-tight">
                        Lowest and highest static air temperature
                    </p>
                </div>

                {/* Lowest Visibility */}
                <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                        <Eye className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Lowest Visibility</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {formatVisibility(weatherStats.minVis, visibilityUnit)}
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-tight">
                        Minimum atmospheric visibility range
                    </p>
                </div>

                {/* Average Wind During Cruise */}
                <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                        <Compass className="w-3.5 h-3.5 text-sky-500" />
                        <span>Cruise Wind (Avg)</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {formatWindVector(
                            weatherStats.avgCruiseWindDir,
                            weatherStats.avgCruiseWindSpd,
                            windSpeedUnit,
                        )}
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-tight">
                        Vector-averaged wind during cruise
                    </p>
                </div>

                {/* Maximum Wind Speed */}
                <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
                    <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                        <Wind className="w-3.5 h-3.5 text-rose-500" />
                        <span>Max Wind Encountered</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">
                        {formatWindVector(
                            weatherStats.maxWindDir,
                            weatherStats.maxWindSpd,
                            windSpeedUnit,
                        )}
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-tight">
                        Peak wind velocity and direction recorded
                    </p>
                </div>
            </div>
        </div>
    );
};
