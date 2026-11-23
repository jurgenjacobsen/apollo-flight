import React from "react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";
import { Gauge, RotateCcw, Loader2, Wind, Thermometer, Eye } from "lucide-react";
import { formatWindVector, formatTemperature, formatVisibility } from "../../utils/weatherUnits";

export interface TelemetryChartPoint {
    pointIndex: number;
    time: string;
    altitude: number;
    groundSpeed: number;
    windSpeed?: number;
    windDirection?: number;
    heading?: number;
    oat?: number;
    tat?: number;
    visibility?: number;
}

export interface DragSelectionState {
    startX: number;
    currentX: number;
    startIndex: number;
    currentIndex: number;
}

interface TelemetryChartProps {
    chartData: TelemetryChartPoint[];
    zoomTimeRange: { start: number; end: number } | null;
    setZoomTimeRange: React.Dispatch<React.SetStateAction<{ start: number; end: number } | null>>;
    dragSelection: DragSelectionState | null;
    setDragSelection: React.Dispatch<React.SetStateAction<DragSelectionState | null>>;
    setScrubbedTelemetryIndex: (idx: number | null) => void;
    isHeavyReady: boolean;
    isLoadingFlightDetails: boolean;
    theme: string;
    windSpeedUnit: "kt" | "mps";
    temperatureUnit: "c" | "f";
    visibilityUnit: "sm" | "metric";
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
    chartData,
    zoomTimeRange,
    setZoomTimeRange,
    dragSelection,
    setDragSelection,
    setScrubbedTelemetryIndex,
    isHeavyReady,
    isLoadingFlightDetails,
    theme,
    windSpeedUnit,
    temperatureUnit,
    visibilityUnit,
}) => {
    return (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-neutral-500" />
                    <span className="font-medium text-neutral-900 dark:text-white tracking-tight">
                        Synchronized Telemetry Scrubbing
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {zoomTimeRange ? (
                        <button
                            type="button"
                            onClick={() => setZoomTimeRange(null)}
                            className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm"
                            title="Reset zoom to full flight (or double-click chart)"
                        >
                            <RotateCcw className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            <span>Reset Zoom</span>
                            <span className="text-[10px] font-mono opacity-80">
                                (
                                {new Date(
                                    zoomTimeRange.start,
                                ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                })}{" "}
                                –{" "}
                                {new Date(
                                    zoomTimeRange.end,
                                ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                })}
                                )
                            </span>
                        </button>
                    ) : (
                        <span className="text-neutral-500 dark:text-geist-muted text-[11px]">
                            Click and drag an area to zoom · Double-click to
                            reset
                        </span>
                    )}
                </div>
            </div>

            {!isHeavyReady ||
            isLoadingFlightDetails ||
            chartData.length === 0 ? (
                <div className="h-60 w-full flex flex-col items-center justify-center rounded-sm border border-neutral-200/60 dark:border-geist-hairline/60 bg-neutral-100/60 dark:bg-[#111111]/80 relative overflow-hidden">
                    <div className="absolute inset-x-0 top-1/4 border-b border-neutral-200/50 dark:border-neutral-800/50" />
                    <div className="absolute inset-x-0 top-2/4 border-b border-neutral-200/50 dark:border-neutral-800/50" />
                    <div className="absolute inset-x-0 top-3/4 border-b border-neutral-200/50 dark:border-neutral-800/50" />
                    <div className="relative flex flex-col items-center gap-2 px-4 py-3 rounded-md bg-white/90 dark:bg-black/70 border border-neutral-200/80 dark:border-neutral-800 backdrop-blur-sm shadow-sm">
                        {chartData.length === 0 &&
                        !isLoadingFlightDetails ? (
                            <div className="flex flex-col items-center gap-1.5 text-center">
                                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                                    No Altitude Profile Available
                                </span>
                                <span className="text-[11px] text-neutral-500 max-w-xs">
                                    Raw telemetry points were excluded from
                                    this flight record.
                                </span>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-neutral-500 dark:text-neutral-400" />
                                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                        {isLoadingFlightDetails
                                            ? "Loading flight telemetry points..."
                                            : "Loading altitude & speed profile..."}
                                    </span>
                                </div>
                                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                    Synchronizing flight telemetry graph
                                </span>
                            </>
                        )}
                    </div>
                </div>
            ) : chartData.length > 0 ? (
                <div
                    className={`h-60 w-full relative select-none ${dragSelection ? "cursor-col-resize" : "cursor-crosshair"}`}
                    onDoubleClick={() => setZoomTimeRange(null)}
                >
                    {/* Visual selection box overlay showing the selected area while dragging */}
                    {dragSelection &&
                        Math.abs(
                            dragSelection.currentX - dragSelection.startX,
                        ) > 4 && (
                            <div
                                className="absolute pointer-events-none z-30 border border-blue-500 bg-blue-500/20 backdrop-blur-[0.5px]"
                                style={{
                                    left: Math.min(
                                        dragSelection.startX,
                                        dragSelection.currentX,
                                    ),
                                    width: Math.abs(
                                        dragSelection.currentX -
                                            dragSelection.startX,
                                    ),
                                    top: 5,
                                    bottom: 25,
                                }}
                            >
                                <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-mono font-medium px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                                    {
                                        chartData[
                                            Math.min(
                                                dragSelection.startIndex,
                                                dragSelection.currentIndex,
                                            )
                                        ]?.time
                                    }{" "}
                                    –{" "}
                                    {
                                        chartData[
                                            Math.max(
                                                dragSelection.startIndex,
                                                dragSelection.currentIndex,
                                            )
                                        ]?.time
                                    }
                                </div>
                            </div>
                        )}

                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            onMouseDown={(e: any) => {
                                if (
                                    e &&
                                    e.chartX !== undefined &&
                                    e.activeTooltipIndex !== undefined
                                ) {
                                    setDragSelection({
                                        startX: e.chartX,
                                        currentX: e.chartX,
                                        startIndex: e.activeTooltipIndex,
                                        currentIndex: e.activeTooltipIndex,
                                    });
                                }
                            }}
                            onMouseMove={(e: any) => {
                                if (dragSelection) {
                                    if (e && e.chartX !== undefined) {
                                        setDragSelection((prev) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      currentX: e.chartX,
                                                      currentIndex:
                                                          e.activeTooltipIndex !==
                                                          undefined
                                                              ? e.activeTooltipIndex
                                                              : prev.currentIndex,
                                                  }
                                                : null,
                                        );
                                    }
                                } else if (
                                    e &&
                                    e.activeTooltipIndex !== undefined
                                ) {
                                    const ptIdx =
                                        chartData[e.activeTooltipIndex]
                                            ?.pointIndex ??
                                        e.activeTooltipIndex;
                                    setScrubbedTelemetryIndex(ptIdx);
                                }
                            }}
                            onMouseLeave={() => {
                                setScrubbedTelemetryIndex(null);
                            }}
                        >
                            <defs>
                                <linearGradient
                                    id="altGradient"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="5%"
                                        stopColor={
                                            theme === "dark"
                                                ? "#38bdf8"
                                                : "#0070f3"
                                        }
                                        stopOpacity={0.25}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor={
                                            theme === "dark"
                                                ? "#38bdf8"
                                                : "#0070f3"
                                        }
                                        stopOpacity={0.0}
                                    />
                                </linearGradient>
                                <linearGradient
                                    id="speedGradient"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="5%"
                                        stopColor="#10b981"
                                        stopOpacity={0.2}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="#10b981"
                                        stopOpacity={0.0}
                                    />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={
                                    theme === "dark" ? "#1f1f1f" : "#f0f0f0"
                                }
                                vertical={false}
                            />
                            <XAxis
                                dataKey="time"
                                stroke="#737373"
                                tick={{ fontSize: 11, fill: "#737373" }}
                            />
                            <YAxis
                                yAxisId="alt"
                                orientation="left"
                                stroke={
                                    theme === "dark" ? "#38bdf8" : "#0070f3"
                                }
                                tick={{
                                    fontSize: 11,
                                    fill:
                                        theme === "dark"
                                            ? "#38bdf8"
                                            : "#0070f3",
                                }}
                                unit=" ft"
                            />
                            <YAxis
                                yAxisId="speed"
                                orientation="right"
                                stroke="#10b981"
                                tick={{ fontSize: 11, fill: "#10b981" }}
                                unit=" kt"
                            />
                            <Tooltip
                                content={({
                                    active: tooltipActive,
                                    payload,
                                }) => {
                                    if (
                                        !tooltipActive ||
                                        !payload ||
                                        payload.length === 0
                                    )
                                        return null;
                                    const data = payload[0]?.payload;
                                    if (!data) return null;

                                    const windComp =
                                        data.windSpeed !== undefined &&
                                        data.windDirection !== undefined &&
                                        data.heading !== undefined
                                            ? Math.round(
                                                  data.windSpeed *
                                                      Math.cos(
                                                          ((data.windDirection -
                                                              data.heading) *
                                                              Math.PI) /
                                                              180,
                                                      ),
                                              )
                                            : null;

                                    return (
                                        <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-[#262626] rounded-md p-2.5 text-xs shadow-md space-y-1.5 min-w-[170px]">
                                            <div className="font-mono font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800 pb-1">
                                                {data.time}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-sky-500 flex items-center gap-1 font-medium">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 inline-block" />
                                                        Altitude:
                                                    </span>
                                                    <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                                        {Number(
                                                            data.altitude,
                                                        ).toLocaleString()}{" "}
                                                        ft
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-emerald-500 flex items-center gap-1 font-medium">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                                        Ground Speed:
                                                    </span>
                                                    <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                                        {data.groundSpeed}{" "}
                                                        kt
                                                    </span>
                                                </div>
                                                {data.windSpeed !==
                                                    undefined &&
                                                    data.windDirection !==
                                                        undefined && (
                                                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-100 dark:border-neutral-800/80">
                                                            <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1 font-medium">
                                                                <Wind className="w-3 h-3 text-sky-400 shrink-0" />
                                                                Wind:
                                                            </span>
                                                            <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                                                {formatWindVector(
                                                                    data.windDirection,
                                                                    data.windSpeed,
                                                                    windSpeedUnit,
                                                                )}
                                                                {windComp !==
                                                                    null && (
                                                                    <span className="text-[10px] text-neutral-400 font-normal ml-1">
                                                                        (
                                                                        {windComp >=
                                                                        0
                                                                            ? `+${windSpeedUnit === "mps" ? (windComp * 0.514444).toFixed(1) : windComp} ${windSpeedUnit === "mps" ? "m/s tail" : "tail"}`
                                                                            : `${windSpeedUnit === "mps" ? (windComp * 0.514444).toFixed(1) : windComp} ${windSpeedUnit === "mps" ? "m/s head" : "head"}`}
                                                                        )
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                {(data.oat !== undefined ||
                                                    data.tat !==
                                                        undefined) && (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1 font-medium">
                                                            <Thermometer className="w-3 h-3 text-amber-500 shrink-0" />
                                                            Temp (OAT/TAT):
                                                        </span>
                                                        <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                                            {data.oat !==
                                                            undefined
                                                                ? formatTemperature(
                                                                      data.oat,
                                                                      temperatureUnit,
                                                                  )
                                                                : "--"}
                                                            {data.tat !==
                                                            undefined
                                                                ? ` / ${formatTemperature(
                                                                      data.tat,
                                                                      temperatureUnit,
                                                                  )}`
                                                                : ""}
                                                        </span>
                                                    </div>
                                                )}
                                                {data.visibility !==
                                                    undefined && (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1 font-medium">
                                                            <Eye className="w-3 h-3 text-indigo-400 shrink-0" />
                                                            Visibility:
                                                        </span>
                                                        <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                                            {formatVisibility(
                                                                data.visibility,
                                                                visibilityUnit,
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Area
                                yAxisId="alt"
                                type="monotone"
                                dataKey="altitude"
                                stroke={
                                    theme === "dark" ? "#38bdf8" : "#0070f3"
                                }
                                strokeWidth={1.5}
                                fillOpacity={1}
                                fill="url(#altGradient)"
                                name="Altitude (MSL)"
                            />
                            <Area
                                yAxisId="speed"
                                type="monotone"
                                dataKey="groundSpeed"
                                stroke="#10b981"
                                strokeWidth={1.5}
                                fillOpacity={1}
                                fill="url(#speedGradient)"
                                name="Ground Speed"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-44 w-full flex flex-col items-center justify-center border border-dashed border-neutral-200 dark:border-geist-hairline rounded text-center text-neutral-400">
                    <Gauge className="w-6 h-6 mb-1.5 text-neutral-400" />
                    <span className="text-xs">
                        No telemetry profile data available
                    </span>
                </div>
            )}
        </div>
    );
};
