import React, { useEffect, useRef, useState } from "react";
import { safeInvoke, useFlightStore } from "../../../store/flightStore";
import { Pause, PlaneLanding, Play } from "lucide-react";
import { Tooltip } from "../../ui";

interface RecordingRulesTabProps {
    notifySaved: () => void;
}

export const RecordingRulesTab: React.FC<RecordingRulesTabProps> = ({ notifySaved }) => {
    const {
        recordDetailedTelemetry,
        setRecordDetailedTelemetry,
        autoStartRecording,
        setAutoStartRecording,
        touchdownNotificationMode,
        setTouchdownNotificationMode,
        touchdownOverlayPosition,
        setTouchdownOverlayPosition,
        touchdownOverlayDuration,
        setTouchdownOverlayDuration,
        triggerTouchdownNotification,
        showTouchdownBanner,
        dismissTouchdownBanner,
    } = useFlightStore();

    const [isTestRunning, setIsTestRunning] = useState(false);
    const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopTestPreview = async () => {
        if (testTimerRef.current) {
            clearTimeout(testTimerRef.current);
            testTimerRef.current = null;
        }
        setIsTestRunning(false);
        dismissTouchdownBanner();
        await safeInvoke("hide_touchdown_overlay");
    };

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        let isMounted = true;

        if (
            typeof window !== "undefined" &&
            ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
        ) {
            import("@tauri-apps/api/event")
                .then(({ listen }) =>
                    listen("touchdown-overlay-dismissed", () => {
                        if (isMounted) {
                            if (testTimerRef.current) {
                                clearTimeout(testTimerRef.current);
                                testTimerRef.current = null;
                            }
                            setIsTestRunning(false);
                        }
                    }),
                )
                .then((stop) => {
                    if (isMounted) {
                        unlisten = stop;
                    } else {
                        stop();
                    }
                })
                .catch(() => {});
        }

        return () => {
            isMounted = false;
            if (unlisten) unlisten();
            if (testTimerRef.current) clearTimeout(testTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (
            isTestRunning &&
            touchdownNotificationMode === "in-app" &&
            !showTouchdownBanner
        ) {
            if (testTimerRef.current) {
                clearTimeout(testTimerRef.current);
                testTimerRef.current = null;
            }
            setIsTestRunning(false);
        }
    }, [isTestRunning, touchdownNotificationMode, showTouchdownBanner]);

    const handleToggleDetailedTelemetry = () => {
        setRecordDetailedTelemetry(!recordDetailedTelemetry);
        notifySaved();
    };

    const handleToggleAutoStart = () => {
        setAutoStartRecording(!autoStartRecording);
        notifySaved();
    };

    const handleTestLandingPopup = async () => {
        if (isTestRunning) {
            await stopTestPreview();
            return;
        }

        const sampleTouchdown = {
            timestamp: new Date().toISOString(),
            verticalSpeedFpm: -112,
            indicatedAirspeedKt: 136,
            groundSpeedKt: 132,
            pitchDeg: 4.2,
            bankDeg: 0.8,
            headwindKt: 8,
            crosswindKt: 5,
            latitude: 50.0379,
            longitude: 8.5622,
            altitudeMsl: 364,
            gForce: 1.08,
            gForceSim: 1.08,
            bouncesCount: 0,
            airportIcao: "EDDF",
            airportName: "Frankfurt am Main Airport",
            runwayIdent: "25C",
        };
        setIsTestRunning(true);
        await triggerTouchdownNotification(sampleTouchdown, true);

        const durationMs =
            touchdownNotificationMode === "in-app"
                ? 12000
                : (touchdownOverlayDuration || 10) * 1000;
        if (testTimerRef.current) {
            clearTimeout(testTimerRef.current);
        }
        testTimerRef.current = setTimeout(() => {
            testTimerRef.current = null;
            setIsTestRunning(false);
        }, durationMs);
    };

    const overlayPositionRows: Array<
        Array<{
            id:
                | "top-left"
                | "top-center"
                | "top-right"
                | "middle-left"
                | "middle-right"
                | "bottom-left"
                | "bottom-center"
                | "bottom-right";
            label: string;
        } | null>
    > = [
        [
            { id: "top-left", label: "Top Left" },
            { id: "top-center", label: "Top Center" },
            { id: "top-right", label: "Top Right" },
        ],
        [
            { id: "middle-left", label: "Middle Left" },
            null,
            { id: "middle-right", label: "Middle Right" },
        ],
        [
            { id: "bottom-left", label: "Bottom Left" },
            { id: "bottom-center", label: "Bottom Center" },
            { id: "bottom-right", label: "Bottom Right" },
        ],
    ];

    return (
        <div className="space-y-4">
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                {/* Preference: Detailed Telemetry Option (Phase 12) */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Detailed Atmospheric Telemetry
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Records full environmental
                            information (ambient wind conditions, temperatures, and visibility). Disabled by default to
                            save storage space. Summary weather totals
                            are always calculated.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleToggleDetailedTelemetry}
                            role="switch"
                            aria-checked={recordDetailedTelemetry}
                            aria-label="Toggle detailed telemetry recording"
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                                recordDetailedTelemetry
                                    ? "bg-neutral-900 dark:bg-white"
                                    : "bg-neutral-300 dark:bg-[#333333]"
                            }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                                    recordDetailedTelemetry
                                        ? "translate-x-4"
                                        : "translate-x-0"
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Preference: Auto-Start on Telemetry Triggers */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Auto-Start on Telemetry Triggers
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Automatically initializes and records a new
                            flight session when aircraft ground speed
                            exceeds 20 kt or engine combustion is
                            detected in MSFS. If disabled, flights are
                            only logged when started manually.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <button
                            type="button"
                            onClick={handleToggleAutoStart}
                            role="switch"
                            aria-checked={autoStartRecording}
                            aria-label="Toggle auto-start recording"
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                                autoStartRecording
                                    ? "bg-neutral-900 dark:bg-white"
                                    : "bg-neutral-300 dark:bg-[#333333]"
                            }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                                    autoStartRecording
                                        ? "translate-x-4"
                                        : "translate-x-0"
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Preference: Flight Start Conditions */}
                <div
                    className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${autoStartRecording ? "" : "opacity-50"}`}
                >
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Flight Start Conditions
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Monitors aircraft ground speed exceeding 20 knots
                            or engine running polled via FSUIPC7. Manual initiation via
                            &ldquo;Start Recording Flight&rdquo; is always
                            available.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                            &gt; 20 kt Groundspeed
                        </span>
                    </div>
                </div>

                {/* Preference: Flight Stop Conditions */}
                <div
                    className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${autoStartRecording ? "" : "opacity-50"}`}
                >
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Flight Stop & Safeguard Conditions
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Auto-started flights finalize when the
                            aircraft remains stationary on the ground
                            for 30 seconds with one or more
                            engines shut down. Flights started manually
                            are protected and present a confirmation
                            prompt upon landing rather than
                            auto-terminating.
                        </p>
                    </div>
                </div>

                {/* Preference: Landing Report Notification & In-Sim Overlay */}
                <div className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1 max-w-xl">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                                    <span>Landing Popup Notification & In-Sim Overlay</span>
                                </h3>
                            </div>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                Choose whether your touchdown report appears in-app, as a transparent always-on-top HUD over Microsoft Flight Simulator, or both. The overlay never steals keyboard or flight yoke focus away from the simulator.
                            </p>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                            <Tooltip content="Trigger preview touchdown report">
                                <button
                                    type="button"
                                    onClick={handleTestLandingPopup}
                                    className="px-3.5 py-1.5 text-xs rounded-xs bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-all flex items-center gap-1.5 shadow-xs"
                                >
                                    {isTestRunning ? (
                                        <Pause className="w-3.5 h-3.5 fill-current" />
                                    ) : (
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                    )}
                                    <span>Test Landing Popup</span>
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Controls: Mode, Position, Duration */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-neutral-100 dark:border-geist-hairline">
                        {/* Mode Selector */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                                Display Mode
                            </label>
                            <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-[#181818] p-1 rounded-sm border border-neutral-200 dark:border-geist-hairline">
                                {[
                                    { id: "in-app", label: "In-App" },
                                    { id: "overlay", label: "MSFS Overlay" },
                                    { id: "both", label: "Both" },
                                ].map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={async () => {
                                            await setTouchdownNotificationMode(m.id as any);
                                            notifySaved();
                                        }}
                                        className={`py-1 text-[11px] font-medium rounded-xs transition-colors ${
                                            touchdownNotificationMode === m.id
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs font-semibold"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Overlay Position */}
                        <div className={`space-y-1.5 ${touchdownNotificationMode === "in-app" ? "opacity-50 pointer-events-none" : ""}`}>
                            <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                                Overlay Position
                            </label>
                            <div className="relative grid grid-cols-1 gap-4 bg-neutral-100 dark:bg-[#181818] p-1 rounded-sm border border-neutral-200 dark:border-geist-hairline">
                                {overlayPositionRows.map((row, rowIdx) => (
                                    <div
                                        key={`overlay-pos-row-${rowIdx}`}
                                        className="flex justify-between items-center"
                                    >
                                        {row.map((pos, colIdx) => {
                                            if (!pos) {
                                                return (
                                                    <div
                                                        key={`overlay-pos-empty-${rowIdx}-${colIdx}`}
                                                        className="w-12 h-6"
                                                        aria-hidden="true"
                                                    />
                                                );
                                            }
                                            const isActive =
                                                touchdownOverlayPosition === pos.id;
                                            return (
                                                <Tooltip
                                                    key={pos.id}
                                                    content={pos.label}
                                                >
                                                    <button
                                                        type="button"
                                                        aria-label={pos.label}
                                                        aria-pressed={isActive}
                                                        onClick={async () => {
                                                            await setTouchdownOverlayPosition(
                                                                pos.id,
                                                            );
                                                            notifySaved();
                                                        }}
                                                        className={`w-12 h-6 rounded-xs transition-colors ${
                                                            isActive
                                                                ? "bg-neutral-900 dark:bg-white shadow-xs"
                                                                : "bg-neutral-900/25 hover:bg-neutral-900/50 dark:bg-white/25 dark:hover:bg-white/50"
                                                        }`}
                                                    />
                                                </Tooltip>
                                            );
                                        })}
                                    </div>
                                ))}
                                <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                                    Monitor
                                </span>
                            </div>
                        </div>

                        {/* Duration */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                                Display Duration
                            </label>
                            <div className="grid grid-cols-4 gap-1 bg-neutral-100 dark:bg-[#181818] p-1 rounded-sm border border-neutral-200 dark:border-geist-hairline">
                                {[6, 9, 12, 18].map((sec) => (
                                    <button
                                        key={sec}
                                        type="button"
                                        onClick={async () => {
                                            await setTouchdownOverlayDuration(sec);
                                            notifySaved();
                                        }}
                                        className={`py-1 text-[11px] font-medium rounded-xs transition-colors ${
                                            touchdownOverlayDuration === sec
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs font-semibold"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        {sec}s
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
