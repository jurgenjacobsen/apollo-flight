import React, { useEffect } from "react";
import { useFlightStore } from "../../store/flightStore";
import { formatWindSpeed } from "../../utils/weatherUnits";
import {
    PlaneLanding,
    Gauge,
    Wind,
    Compass,
    X,
    AlertTriangle,
    Award,
    CheckCircle2,
} from "lucide-react";

export const TouchdownFlyoutBanner: React.FC = () => {
    const {
        latestTouchdown,
        showTouchdownBanner,
        dismissTouchdownBanner,
        windSpeedUnit,
    } = useFlightStore();

    // Auto-dismiss after 12 seconds
    useEffect(() => {
        if (!showTouchdownBanner) return;
        const timer = setTimeout(() => {
            dismissTouchdownBanner();
        }, 12000);
        return () => clearTimeout(timer);
    }, [showTouchdownBanner, dismissTouchdownBanner, latestTouchdown?.timestamp]);

    if (!showTouchdownBanner || !latestTouchdown) return null;

    const absFpm = Math.abs(latestTouchdown.verticalSpeedFpm);
    const isButter = absFpm < 120;
    const isSmooth = absFpm >= 120 && absFpm < 180;
    const isFirm = absFpm >= 180 && absFpm < 300;
    const isHard = absFpm >= 300;

    let gradeText = "Smooth";
    let gradeBadgeStyle =
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (isButter) {
        gradeText = "Butter";
        gradeBadgeStyle =
            "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    } else if (isSmooth) {
        gradeText = "Smooth";
        gradeBadgeStyle =
            "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    } else if (isFirm) {
        gradeText = "Firm";
        gradeBadgeStyle =
            "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    } else if (isHard) {
        gradeText = "Hard";
        gradeBadgeStyle =
            "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    }

    const gLoad = latestTouchdown.gForceSim ?? latestTouchdown.gForce ?? 1.0;
    const bounces = latestTouchdown.bouncesCount || 0;

    return (
        <div className="fixed top-14 right-4 z-50 w-80 sm:w-96 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-md border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-2xl p-4 animate-in fade-in slide-in-from-top-4 duration-200 text-neutral-900 dark:text-white select-none">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-neutral-100 dark:border-geist-hairline">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-neutral-700 dark:text-neutral-300">
                        <PlaneLanding className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-xs font-semibold tracking-tight flex items-center gap-1.5">
                            <span>Touchdown Report</span>
                            {latestTouchdown.airportIcao && (
                                <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-geist-hairline">
                                    {latestTouchdown.airportIcao}
                                </span>
                            )}
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-geist-muted">
                            MSFS Landing Dynamics
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span
                        className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-[3px] border ${gradeBadgeStyle}`}
                    >
                        {gradeText}
                    </span>
                    <button
                        type="button"
                        onClick={dismissTouchdownBanner}
                        className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors p-1"
                        title="Dismiss"
                        aria-label="Dismiss banner"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                {/* Landing Rate */}
                <div className="p-2.5 rounded-sm bg-neutral-50 dark:bg-geist-surface border border-neutral-100 dark:border-geist-hairline">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
                        Touchdown Rate
                    </div>
                    <div className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white mt-0.5 tabular-nums">
                        {latestTouchdown.verticalSpeedFpm}{" "}
                        <span className="text-xs font-normal text-neutral-500">
                            fpm
                        </span>
                    </div>
                </div>

                {/* Impact G-Load */}
                <div className="p-2.5 rounded-sm bg-neutral-50 dark:bg-geist-surface border border-neutral-100 dark:border-geist-hairline">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium flex items-center justify-between">
                        <span>Peak Load</span>
                        <span className="text-[9px] text-neutral-400">
                            {latestTouchdown.gForceSim ? "SIM" : "STRUT"}
                        </span>
                    </div>
                    <div className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white mt-0.5 tabular-nums">
                        {gLoad.toFixed(2)}{" "}
                        <span className="text-xs font-normal text-neutral-500">
                            G
                        </span>
                    </div>
                </div>
            </div>

            {/* Speeds & Alignment Breakdown */}
            <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-geist-hairline space-y-1.5 text-[11px]">
                {/* Speeds */}
                <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                    <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <Gauge className="w-3 h-3" />
                        <span>Air & Ground Speed</span>
                    </span>
                    <span className="font-medium tabular-nums">
                        {latestTouchdown.indicatedAirspeedKt ?? latestTouchdown.groundSpeedKt}{" "}
                        <span className="text-neutral-400">IAS</span> •{" "}
                        {latestTouchdown.groundSpeedKt}{" "}
                        <span className="text-neutral-400">GS</span>
                    </span>
                </div>

                {/* Wind Component */}
                {(latestTouchdown.headwindKt !== undefined ||
                    latestTouchdown.crosswindKt !== undefined) && (
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                        <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                            <Wind className="w-3 h-3" />
                            <span>Wind Vector</span>
                        </span>
                        <span className="font-medium tabular-nums">
                            {latestTouchdown.headwindKt !== undefined && (
                                <span>
                                    {latestTouchdown.headwindKt >= 0
                                        ? `${formatWindSpeed(latestTouchdown.headwindKt, windSpeedUnit)} H/W`
                                        : `${formatWindSpeed(Math.abs(latestTouchdown.headwindKt), windSpeedUnit)} T/W`}
                                </span>
                            )}
                            {latestTouchdown.crosswindKt !== undefined && (
                                <span className="ml-1.5">
                                    • {formatWindSpeed(Math.abs(latestTouchdown.crosswindKt), windSpeedUnit)}{" "}
                                    {latestTouchdown.crosswindKt >= 0 ? "R" : "L"}
                                </span>
                            )}
                        </span>
                    </div>
                )}

                {/* Crab / Sideslip Angle */}
                {latestTouchdown.sideslipDeg !== undefined && (
                    <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                        <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                            <Compass className="w-3 h-3" />
                            <span>Alignment / Sideslip</span>
                        </span>
                        <span className="font-medium tabular-nums">
                            {Math.abs(latestTouchdown.sideslipDeg)}°{" "}
                            {latestTouchdown.sideslipDeg > 0
                                ? "Right Drift"
                                : latestTouchdown.sideslipDeg < 0
                                ? "Left Drift"
                                : "Aligned"}
                        </span>
                    </div>
                )}

                {/* Bounce Count */}
                <div className="flex items-center justify-between pt-1">
                    <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        {bounces > 0 ? (
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                        ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        )}
                        <span>Bounces</span>
                    </span>
                    <span
                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded tabular-nums ${
                            bounces > 0
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : "text-neutral-600 dark:text-neutral-400"
                        }`}
                    >
                        {bounces === 0 ? "0 (Clean)" : `${bounces} Bounced`}
                    </span>
                </div>
            </div>
        </div>
    );
};
