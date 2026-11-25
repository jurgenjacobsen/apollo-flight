import React from "react";
import { useFlightStore } from "../../../store/flightStore";

interface MeasurementUnitsTabProps {
    notifySaved: () => void;
}

export const MeasurementUnitsTab: React.FC<MeasurementUnitsTabProps> = ({
    notifySaved,
}) => {
    const {
        weightUnit,
        setWeightUnit,
        visibilityUnit,
        setVisibilityUnit,
        windSpeedUnit,
        setWindSpeedUnit,
        temperatureUnit,
        setTemperatureUnit,
    } = useFlightStore();

    return (
        <div className="space-y-4">
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                {/* Preference: Aircraft Weight Units */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            Aircraft Weight Units
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Choose whether weight units across pages are displayed in kilograms or pounds.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                            {(
                                [
                                    { value: "kg", label: "Kilograms (kg)" },
                                    { value: "lbs", label: "Pounds (lbs)" },
                                ] as const
                            ).map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={async () => {
                                        await setWeightUnit(opt.value);
                                        notifySaved();
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                        weightUnit === opt.value
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preference: Atmospheric Visibility Units */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            Atmospheric Visibility Units
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Choose whether atmospheric visibility across telemetry displays, debrief charts, and EFB is shown in Statute Miles or Meters / Kilometers.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                            {(
                                [
                                    { value: "sm", label: "Statute Miles (SM)" },
                                    { value: "metric", label: "Meters / Kilometers (m / km)" },
                                ] as const
                            ).map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={async () => {
                                        await setVisibilityUnit(opt.value);
                                        notifySaved();
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                        visibilityUnit === opt.value
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preference: Wind Speed Units */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            Wind Speed Units
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Choose whether wind velocity, gusts, and crosswind vectors are formatted in Knots (kt) or Meters per second (m/s).
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                            {(
                                [
                                    { value: "kt", label: "Knots (kt)" },
                                    { value: "mps", label: "Meters / sec (m/s)" },
                                ] as const
                            ).map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={async () => {
                                        await setWindSpeedUnit(opt.value);
                                        notifySaved();
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                        windSpeedUnit === opt.value
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preference: Temperature Units */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            Temperature Units
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Choose whether static air temperature (OAT/TAT) and environmental metrics are formatted in Celsius (°C) or Fahrenheit (°F).
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                            {(
                                [
                                    { value: "c", label: "Celsius (°C)" },
                                    { value: "f", label: "Fahrenheit (°F)" },
                                ] as const
                            ).map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={async () => {
                                        await setTemperatureUnit(opt.value);
                                        notifySaved();
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                        temperatureUnit === opt.value
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
