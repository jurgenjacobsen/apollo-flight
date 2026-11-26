import React, { useState, useRef, useEffect } from "react";
import { useFlightStore } from "../../store/flightStore";
import { Radio, Navigation, RotateCw, RotateCcw } from "lucide-react";

type NavSource = "NAV1" | "NAV2" | "ADF";

export const EfbIfrView: React.FC = () => {
    const { currentTelemetry, theme } = useFlightStore();
    const [navSource, setNavSource] = useState<NavSource>("NAV1");
    const [inboundCourse, setInboundCourse] = useState(360);
    const [isStandardTurn, setIsStandardTurn] = useState(true);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const obs =
        navSource === "NAV1"
            ? currentTelemetry?.nav1Obs ?? 360
            : navSource === "NAV2"
              ? currentTelemetry?.nav2Obs ?? 360
              : 0;

    const radial =
        navSource === "NAV1"
            ? currentTelemetry?.nav1Radial ?? 0
            : navSource === "NAV2"
              ? currentTelemetry?.nav2Radial ?? 0
              : 0;

    const relBearing =
        navSource === "NAV1"
            ? currentTelemetry?.nav1RelativeBearing ?? 0
            : navSource === "NAV2"
              ? currentTelemetry?.nav2RelativeBearing ?? 0
              : currentTelemetry?.adf1RelativeBearing ?? 0;

    const dmeDist =
        navSource === "NAV1"
            ? currentTelemetry?.nav1DmeDistance ?? 0
            : navSource === "NAV2"
              ? currentTelemetry?.nav2DmeDistance ?? 0
              : 0;

    const dmeSpeed =
        navSource === "NAV1"
            ? currentTelemetry?.nav1DmeSpeed ?? 0
            : navSource === "NAV2"
              ? currentTelemetry?.nav2DmeSpeed ?? 0
              : 0;

    const heading = Math.round(currentTelemetry?.heading ?? 0);

    const angleDiff = ((heading - inboundCourse + 360) % 360);
    let entryType: "DIRECT" | "TEARDROP" | "PARALLEL" = "DIRECT";

    if (isStandardTurn) {
        if (angleDiff >= 290 || angleDiff <= 0) {
            entryType = "TEARDROP";
        } else if (angleDiff > 0 && angleDiff <= 110) {
            entryType = "PARALLEL";
        } else {
            entryType = "DIRECT";
        }
    } else {
        if (angleDiff >= 0 && angleDiff <= 70) {
            entryType = "TEARDROP";
        } else if (angleDiff >= 250 && angleDiff < 360) {
            entryType = "PARALLEL";
        } else {
            entryType = "DIRECT";
        }
    }

    // Canvas drawing for Holding Pattern Racetrack
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const scale = 0.8;
        const isDark = theme === "dark";

        // Colors matching desktop IFR trainer
        const strokeColor = isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)";
        const courseColor = "#3b82f6";
        const planeColor = isDark ? "#ffffff" : "#171717";

        // Draw compass circle
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 90 * scale, 0, Math.PI * 2);
        ctx.stroke();

        // Draw Inbound track line
        const courseRad = ((inboundCourse - 90) * Math.PI) / 180;
        ctx.strokeStyle = courseColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(courseRad) * 70 * scale, cy - Math.sin(courseRad) * 70 * scale);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        // Draw Fix Marker (Triangle)
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx + 7, cy + 6);
        ctx.lineTo(cx - 7, cy + 6);
        ctx.closePath();
        ctx.fill();

        // Draw Racetrack Pattern
        ctx.strokeStyle = planeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const turnSign = isStandardTurn ? 1 : -1;
        const r = 35 * scale;
        ctx.arc(cx + Math.sin(courseRad) * r * turnSign, cy - Math.cos(courseRad) * r * turnSign, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Aircraft heading orientation vector
        const hdgRad = ((heading - 90) * Math.PI) / 180;
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(hdgRad) * 60 * scale, cy + Math.sin(hdgRad) * 60 * scale);
        ctx.stroke();
    }, [theme, inboundCourse, isStandardTurn, heading]);

    return (
        <div className="flex flex-col h-full w-full p-4 md:p-6 overflow-y-auto select-none space-y-4 bg-neutral-50 dark:bg-black font-sans">
            {/* Navaid Source Selector */}
            <div className="flex items-center justify-between">
                <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                    {(["NAV1", "NAV2", "ADF"] as NavSource[]).map((src) => (
                        <button
                            key={src}
                            type="button"
                            onClick={() => setNavSource(src)}
                            className={`px-3 py-1 rounded-xs text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                                navSource === src
                                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                            }`}
                        >
                            {src}
                        </button>
                    ))}
                </div>

                <div className="text-xs text-neutral-500 dark:text-geist-muted tabular-nums">
                    HDG:{" "}
                    <span className="font-semibold text-neutral-900 dark:text-white">
                        {String(heading).padStart(3, "0")}°
                    </span>
                </div>
            </div>

            {/* Instrument Gauge Cards (Geist styled) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* VOR / ADF Readout Card */}
                <div className="p-4 sm:p-5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-200 dark:border-geist-hairline pb-3">
                        <div className="flex items-center gap-2">
                            <Radio className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                            <span className="font-semibold text-sm text-neutral-900 dark:text-white">
                                {navSource} Receiver
                            </span>
                        </div>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-geist-hairline text-neutral-600 dark:text-neutral-300 font-medium">
                            {navSource === "ADF" ? "NDB Mode" : "VOR / LOC"}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-center">
                        <div className="p-3 rounded-sm bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-geist-hairline">
                            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                                Selected OBS
                            </div>
                            <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5">
                                {navSource === "ADF" ? "—" : `${String(obs).padStart(3, "0")}°`}
                            </div>
                        </div>

                        <div className="p-3 rounded-sm bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-geist-hairline">
                            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                                Radial / BRG
                            </div>
                            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                                {String(Math.round(radial)).padStart(3, "0")}°
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                        <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-geist-hairline">
                            <div className="text-[10px] text-neutral-500 dark:text-geist-muted font-medium">Rel BRG</div>
                            <div className="font-semibold text-neutral-900 dark:text-white tabular-nums mt-0.5">{Math.round(relBearing)}°</div>
                        </div>
                        <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-geist-hairline">
                            <div className="text-[10px] text-neutral-500 dark:text-geist-muted font-medium">DME Dist</div>
                            <div className="font-semibold text-neutral-900 dark:text-white tabular-nums mt-0.5">
                                {navSource === "ADF" ? "—" : `${dmeDist.toFixed(1)} NM`}
                            </div>
                        </div>
                        <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-geist-hairline">
                            <div className="text-[10px] text-neutral-500 dark:text-geist-muted font-medium">DME Speed</div>
                            <div className="font-semibold text-neutral-900 dark:text-white tabular-nums mt-0.5">
                                {navSource === "ADF" ? "—" : `${dmeSpeed} kt`}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Holding Pattern Procedural Guide Card */}
                <div className="p-4 sm:p-5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-200 dark:border-geist-hairline pb-3">
                        <div className="flex items-center gap-2">
                            <Navigation className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                            <span className="font-semibold text-sm text-neutral-900 dark:text-white">
                                Holding Pattern
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsStandardTurn(!isStandardTurn)}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-[#202020] dark:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer"
                        >
                            {isStandardTurn ? (
                                <>
                                    <RotateCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    <span>Standard Right</span>
                                </>
                            ) : (
                                <>
                                    <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                    <span>Non-Standard Left</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-sm bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-geist-hairline">
                        <div>
                            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                                Recommended Entry
                            </div>
                            <div className="text-base font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                                {entryType} ENTRY
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium">
                                Inbound Course
                            </div>
                            <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums mt-0.5">
                                {String(inboundCourse).padStart(3, "0")}°
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-center pt-1">
                        <canvas
                            ref={canvasRef}
                            width={220}
                            height={150}
                            className="rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-[#0a0a0a]"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
