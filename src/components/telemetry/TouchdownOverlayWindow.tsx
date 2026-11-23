import React, { useEffect, useState } from "react";
import {
    PlaneLanding,
    Gauge,
    Wind,
    X,
} from "lucide-react";
import { safeInvoke } from "../../store/flightStore";

export interface TouchdownOverlayData {
    verticalSpeedFpm: number;
    gForce: number;
    indicatedAirspeedKt?: number;
    groundSpeedKt: number;
    headwindKt?: number;
    crosswindKt?: number;
    pitchDeg?: number;
    bankDeg?: number;
    airportIcao?: string;
    runwayIdent?: string;
    grade: string;
    durationSeconds?: number;
    position?: string;
}

export const TouchdownOverlayWindow: React.FC = () => {
    const [data, setData] = useState<TouchdownOverlayData | null>(null);
    const [progress, setProgress] = useState(100);

    // Ensure transparent background on window/body
    useEffect(() => {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
        document.body.classList.remove("bg-[#0a0d14]");
        document.body.classList.add("bg-transparent");
    }, []);

    // Listen for incoming touchdown data from Tauri backend
    useEffect(() => {
        let unlisten: (() => void) | null = null;
        let isMounted = true;

        const setupListener = async () => {
            if (
                typeof window !== "undefined" &&
                ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
            ) {
                try {
                    const { listen } = await import("@tauri-apps/api/event");
                    const stop = await listen<TouchdownOverlayData>(
                        "touchdown-overlay-data",
                        (event) => {
                            if (isMounted && event.payload) {
                                setData(event.payload);
                                setProgress(100);
                            }
                        },
                    );
                    if (isMounted) {
                        unlisten = stop;
                    } else {
                        stop();
                    }
                } catch (e) {
                    console.error("Failed to register overlay event listener:", e);
                }
            }
        };

        setupListener();

        return () => {
            isMounted = false;
            if (unlisten) unlisten();
        };
    }, []);

    // Auto-dismiss timer and countdown animation
    useEffect(() => {
        if (!data) return;

        const duration = (data.durationSeconds || 10) * 1000;
        const intervalMs = 50;
        const totalSteps = duration / intervalMs;
        let currentStep = 0;

        const interval = setInterval(() => {
            currentStep++;
            const pct = Math.max(0, 100 - (currentStep / totalSteps) * 100);
            setProgress(pct);

            if (pct <= 0) {
                clearInterval(interval);
                handleDismiss();
            }
        }, intervalMs);

        return () => clearInterval(interval);
    }, [data]);

    const handleDismiss = async () => {
        setData(null);
        await safeInvoke("hide_touchdown_overlay");
    };

    if (!data) {
        return (
            <div className="w-full h-full bg-transparent select-none" />
        );
    }

    const absFpm = Math.abs(data.verticalSpeedFpm);
    const isButter = absFpm < 120;
    const isSmooth = absFpm >= 120 && absFpm < 180;
    const isFirm = absFpm >= 180 && absFpm < 300;
    const isHard = absFpm >= 300;

    let gradeText = data.grade || "Smooth";
    let gradeBadgeStyle =
        "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    if (isButter || gradeText.toLowerCase() === "butter") {
        gradeText = "Butter";
        gradeBadgeStyle =
            "bg-amber-500/20 text-amber-300 border-amber-500/40";
    } else if (isSmooth || gradeText.toLowerCase() === "smooth") {
        gradeText = "Smooth";
        gradeBadgeStyle =
            "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    } else if (isFirm || gradeText.toLowerCase() === "firm") {
        gradeText = "Firm";
        gradeBadgeStyle =
            "bg-blue-500/20 text-blue-300 border-blue-500/40";
    } else if (isHard || gradeText.toLowerCase() === "hard") {
        gradeText = "Hard";
        gradeBadgeStyle =
            "bg-rose-500/25 text-rose-300 border-rose-500/40";
    }

    return (
        <div className="w-screen h-screen flex items-start justify-center p-2 bg-transparent select-none font-sans overflow-hidden">
            <div className="w-full max-w-[360px] bg-neutral-950/95 text-white border border-white/10 rounded-xl backdrop-blur-xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-white/10 border border-white/10 text-white">
                            <PlaneLanding className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold tracking-tight flex items-center gap-1.5">
                                <span>Touchdown Report</span>
                                {data.airportIcao && (
                                    <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-white/10 text-neutral-300 border border-white/10">
                                        {data.airportIcao}
                                        {data.runwayIdent ? ` · RWY ${data.runwayIdent}` : ""}
                                    </span>
                                )}
                            </div>
                            <div className="text-[10px] text-neutral-400">
                                MSFS In-Sim HUD
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded border ${gradeBadgeStyle}`}
                        >
                            {gradeText}
                        </span>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="text-neutral-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
                            title="Dismiss overlay"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Primary Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="text-[10px] text-neutral-400 font-medium">
                            Touchdown Rate
                        </div>
                        <div className="text-xl font-bold font-mono tracking-tight text-white mt-0.5 tabular-nums">
                            {data.verticalSpeedFpm}{" "}
                            <span className="text-xs font-normal text-neutral-400">
                                fpm
                            </span>
                        </div>
                    </div>

                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="text-[10px] text-neutral-400 font-medium flex items-center justify-between">
                            <span>Peak Load</span>
                            <span className="text-[9px] text-neutral-500 font-mono">
                                IMPACT
                            </span>
                        </div>
                        <div className="text-xl font-bold font-mono tracking-tight text-white mt-0.5 tabular-nums">
                            {data.gForce.toFixed(2)}{" "}
                            <span className="text-xs font-normal text-neutral-400">
                                G
                            </span>
                        </div>
                    </div>
                </div>

                {/* Secondary Vectors */}
                <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-neutral-300">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-neutral-400">
                            <Gauge className="w-3 h-3 text-neutral-400" />
                            <span>Air & Ground Speed</span>
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                            {data.indicatedAirspeedKt !== undefined ? `${data.indicatedAirspeedKt} IAS · ` : ""}
                            {data.groundSpeedKt} GS
                        </span>
                    </div>

                    {(data.headwindKt !== undefined || data.crosswindKt !== undefined) && (
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-neutral-400">
                                <Wind className="w-3 h-3 text-neutral-400" />
                                <span>Wind Component</span>
                            </span>
                            <span className="font-mono font-medium tabular-nums">
                                {data.crosswindKt !== undefined ? `${Math.abs(data.crosswindKt)} kt X-wind` : ""}
                                {data.headwindKt !== undefined ? ` · ${data.headwindKt >= 0 ? `${data.headwindKt} kt Head` : `${Math.abs(data.headwindKt)} kt Tail`}` : ""}
                            </span>
                        </div>
                    )}
                </div>

                {/* Auto-Dismiss Progress Bar */}
                <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                    <div
                        className="bg-emerald-400 h-full transition-all duration-75"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
};
