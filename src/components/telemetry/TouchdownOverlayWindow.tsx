import React, { useEffect, useState } from "react";
import { Tooltip } from "../ui";
import {
    PlaneLanding,
    Gauge,
    Wind,
    X,
} from "lucide-react";
import { safeInvoke, useFlightStore } from "../../store/flightStore";

function readStoredTheme(): "light" | "dark" | null {
    try {
        if (typeof localStorage !== "undefined") {
            const raw = localStorage.getItem("apollo-flight-store");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (
                    parsed?.state?.theme === "dark" ||
                    parsed?.state?.theme === "light"
                ) {
                    return parsed.state.theme;
                }
            }
        }
    } catch {}
    return null;
}

function applyTheme(theme: "light" | "dark") {
    if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", theme === "dark");
    }
    if (useFlightStore.getState().theme !== theme) {
        useFlightStore.setState({ theme });
    }
}

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
    theme?: "light" | "dark";
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

    // Listen for incoming touchdown data and theme updates from the main app window
    useEffect(() => {
        let unlistenData: (() => void) | null = null;
        let unlistenTheme: (() => void) | null = null;
        let isMounted = true;

        const initialTheme = readStoredTheme();
        if (initialTheme) {
            applyTheme(initialTheme);
        }

        safeInvoke<string | null>("get_user_setting", { key: "theme" }).then(
            (dbTheme) => {
                if (
                    isMounted &&
                    (dbTheme === "dark" || dbTheme === "light")
                ) {
                    applyTheme(dbTheme);
                }
            },
        );

        const handleStorage = (e: StorageEvent) => {
            if (e.key === "apollo-flight-store") {
                const nextTheme = readStoredTheme();
                if (nextTheme) {
                    applyTheme(nextTheme);
                }
            }
        };
        window.addEventListener("storage", handleStorage);

        const setupListener = async () => {
            if (
                typeof window !== "undefined" &&
                ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
            ) {
                try {
                    const { listen } = await import("@tauri-apps/api/event");
                    const stopData = await listen<TouchdownOverlayData>(
                        "touchdown-overlay-data",
                        (event) => {
                            if (isMounted && event.payload) {
                                const payloadTheme = event.payload.theme;
                                const latestTheme =
                                    payloadTheme === "dark" ||
                                    payloadTheme === "light"
                                        ? payloadTheme
                                        : readStoredTheme();
                                if (latestTheme) {
                                    applyTheme(latestTheme);
                                }
                                setData(event.payload);
                                setProgress(100);
                            }
                        },
                    );
                    const stopTheme = await listen<"light" | "dark">(
                        "theme-changed",
                        (event) => {
                            if (
                                isMounted &&
                                (event.payload === "light" ||
                                    event.payload === "dark")
                            ) {
                                applyTheme(event.payload);
                            }
                        },
                    );
                    if (isMounted) {
                        unlistenData = stopData;
                        unlistenTheme = stopTheme;
                    } else {
                        stopData();
                        stopTheme();
                    }
                } catch (e) {
                    console.error("Failed to register overlay event listener:", e);
                }
            }
        };

        setupListener();

        return () => {
            isMounted = false;
            window.removeEventListener("storage", handleStorage);
            if (unlistenData) unlistenData();
            if (unlistenTheme) unlistenTheme();
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
        if (
            typeof window !== "undefined" &&
            ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
        ) {
            import("@tauri-apps/api/event")
                .then(({ emit }) => emit("touchdown-overlay-dismissed"))
                .catch(() => {});
        }
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
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (isButter || gradeText.toLowerCase() === "butter") {
        gradeText = "Butter";
        gradeBadgeStyle =
            "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    } else if (isSmooth || gradeText.toLowerCase() === "smooth") {
        gradeText = "Smooth";
        gradeBadgeStyle =
            "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    } else if (isFirm || gradeText.toLowerCase() === "firm") {
        gradeText = "Firm";
        gradeBadgeStyle =
            "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    } else if (isHard || gradeText.toLowerCase() === "hard") {
        gradeText = "Hard";
        gradeBadgeStyle =
            "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    }

    return (
        <div className="w-screen h-screen flex items-start justify-center p-2 bg-transparent select-none font-sans overflow-hidden">
            <div className="w-full max-w-[360px] bg-white/95 dark:bg-[#121212]/95 text-neutral-900 dark:text-white border border-neutral-200 dark:border-geist-hairline rounded-sm backdrop-blur-xs p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-neutral-100 dark:border-geist-hairline">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-neutral-700 dark:text-neutral-300">
                            <PlaneLanding className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold tracking-tight flex items-center gap-1.5">
                                <span>Touchdown Report</span>
                            </div>
                            <div className="text-[10px] text-neutral-500 dark:text-geist-muted">
                                Apollo Flight
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-xs border ${gradeBadgeStyle}`}
                        >
                            {gradeText}
                        </span>
                        <Tooltip content="Dismiss overlay">
                            <button
                                type="button"
                                onClick={handleDismiss}
                                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors p-1 rounded-xs hover:bg-neutral-100 dark:hover:bg-geist-cardHover"
                                aria-label="Dismiss overlay"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </Tooltip>
                    </div>
                </div>

                {/* Primary Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-sm bg-neutral-50 dark:bg-geist-surface border border-neutral-100 dark:border-geist-hairline">
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
                            Touchdown Rate
                        </div>
                        <div className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white mt-0.5 tabular-nums">
                            {data.verticalSpeedFpm}{" "}
                            <span className="text-xs font-normal text-neutral-500">
                                fpm
                            </span>
                        </div>
                    </div>

                    <div className="p-2.5 rounded-sm bg-neutral-50 dark:bg-geist-surface border border-neutral-100 dark:border-geist-hairline">
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium flex items-center justify-between">
                            <span>Peak Load</span>
                        </div>
                        <div className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white mt-0.5 tabular-nums">
                            {data.gForce.toFixed(2)}{" "}
                            <span className="text-xs font-normal text-neutral-500">
                                G
                            </span>
                        </div>
                    </div>
                </div>

                {/* Secondary Vectors */}
                <div className="pt-2 border-t border-neutral-100 dark:border-geist-hairline space-y-1.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                            <Gauge className="w-3 h-3" />
                            <span>Air & Ground Speed</span>
                        </span>
                        <span className="font-medium tabular-nums">
                            {data.indicatedAirspeedKt !== undefined ? (
                                <>
                                    {data.indicatedAirspeedKt}{" "}
                                    <span className="text-neutral-400">IAS</span> ·{" "}
                                </>
                            ) : (
                                ""
                            )}
                            {data.groundSpeedKt}{" "}
                            <span className="text-neutral-400">GS</span>
                        </span>
                    </div>

                    {(data.headwindKt !== undefined || data.crosswindKt !== undefined) && (
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                                <Wind className="w-3 h-3" />
                                <span>Wind Component</span>
                            </span>
                            <span className="font-medium tabular-nums">
                                {data.crosswindKt !== undefined ? `${Math.abs(data.crosswindKt)} kt X-wind` : ""}
                                {data.headwindKt !== undefined ? ` · ${data.headwindKt >= 0 ? `${data.headwindKt} kt Head` : `${Math.abs(data.headwindKt)} kt Tail`}` : ""}
                            </span>
                        </div>
                    )}
                </div>

                {/* Auto-Dismiss Progress Bar */}
                <div className="w-full bg-neutral-200 dark:bg-geist-hairline h-1 rounded-full overflow-hidden">
                    <div
                        className="bg-emerald-500 dark:bg-emerald-400 h-full transition-all duration-75"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
};
