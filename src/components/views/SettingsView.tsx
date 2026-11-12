import React, { useState, useEffect } from "react";
import { useFlightStore } from "../../store/flightStore";
import { useEfbStore } from "../../store/efbStore";
import {
    Settings,
    AppWindow,
    Sliders,
    Database,
    RefreshCw,
    CheckCircle2,
    Moon,
    Sun,
    PlaneTakeoff,
    PlaneLanding,
    Info,
    HardDrive,
    Cpu,
    ArrowUpCircle,
    Download,
    AlertTriangle,
    Upload,
    Trash2,
    Archive,
    FolderDown,
    Wind,
    Scale,
    Tablet,
    QrCode,
    ChevronDown,
    Copy,
    ExternalLink,
} from "lucide-react";

import packageJson from "../../../package.json";
import type { Update } from "@tauri-apps/plugin-updater";
import { Select } from "../ui";
import { QrCodeView } from "../ui/QrCodeView";
import { ImportModal } from "../modals/ImportModal";

export const SettingsView: React.FC = () => {
    const {
        closeToTray,
        setCloseToTray,
        autoStartRecording,
        setAutoStartRecording,
        recordDetailedTelemetry,
        setRecordDetailedTelemetry,
        autoCheckUpdates,
        setAutoCheckUpdates,
        theme,
        setTheme,
        toggleTheme,
        weightUnit,
        setWeightUnit,
        airportsCount,
        isSyncingAirports,
        syncProgress,
        activeFlight,
        syncOurAirports,
        lastSyncMessage,
        pageSize,
        setPageSize,
        exportDataBundle,
        recycleBin,
        setActiveView,
        availableUpdate,
        isCheckingUpdate,
        isInstallingUpdate,
        downloadProgress,
        updateMessage,
        checkForUpdates,
        installUpdate,
    } = useFlightStore();

    const [savedSuccess, setSavedSuccess] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [includeTelemetryExport, setIncludeTelemetryExport] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(
        null,
    );

    const handleExport = async (
        scope: "full" | "settings" | "logbook" | "routes",
    ) => {
        setIsExporting(true);
        setExportSuccessMsg(null);
        try {
            await exportDataBundle(scope, includeTelemetryExport);
            setExportSuccessMsg(`Successfully exported ${scope} data.`);
            setTimeout(() => setExportSuccessMsg(null), 3500);
        } catch (err: any) {
            console.error("[SettingsView] Export error:", err);
        } finally {
            setIsExporting(false);
        }
    };

    const notifySaved = () => {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
    };

    const {
        status: efbStatus,
        fetchStatus: fetchEfbStatus,
        serverMode: efbServerMode,
        setServerMode: setEfbServerMode,
        customPort: efbCustomPort,
        setCustomPort: setEfbCustomPort,
        autoStartEfb,
    } = useEfbStore();

    const [isQrDrawerOpen, setIsQrDrawerOpen] = useState(false);
    const [efbPortInput, setEfbPortInput] = useState(
        efbCustomPort || (efbStatus.port ? String(efbStatus.port) : "24820"),
    );
    const [isCopiedEfbUrl, setIsCopiedEfbUrl] = useState(false);
    const [isTogglingEfb, setIsTogglingEfb] = useState(false);
    const [isSpinningPort, setIsSpinningPort] = useState(false);

    useEffect(() => {
        fetchEfbStatus();
        const interval = setInterval(fetchEfbStatus, 3000);
        return () => clearInterval(interval);
    }, [fetchEfbStatus]);

    useEffect(() => {
        if (efbStatus.port && !efbCustomPort) {
            setEfbPortInput(String(efbStatus.port));
        }
    }, [efbStatus.port, efbCustomPort]);

    const efbCurrentMode =
        efbServerMode ||
        (autoStartEfb ? "auto" : efbStatus.isRunning ? "on" : "off");

    const handleSetEfbMode = async (mode: "off" | "on" | "auto") => {
        setIsTogglingEfb(true);
        try {
            const targetPort = efbPortInput
                ? parseInt(efbPortInput, 10)
                : undefined;
            await setEfbServerMode(mode, targetPort);
            notifySaved();
        } catch (err) {
            console.error("[SettingsView] EFB toggle error:", err);
        } finally {
            setIsTogglingEfb(false);
        }
    };

    const handleEfbPortChange = (val: string) => {
        setEfbPortInput(val);
        setEfbCustomPort(val);
        notifySaved();
    };

    const handleGenerateRandomEfbPort = () => {
        setIsSpinningPort(true);
        const rand = String(
            Math.floor(Math.random() * (29999 - 24000 + 1)) + 24000,
        );
        setEfbPortInput(rand);
        setEfbCustomPort(rand);
        notifySaved();
        setTimeout(() => setIsSpinningPort(false), 500);
    };

    const handleCopyEfbUrl = () => {
        if (!efbStatus.url) return;
        navigator.clipboard.writeText(efbStatus.url);
        setIsCopiedEfbUrl(true);
        setTimeout(() => setIsCopiedEfbUrl(false), 2000);
    };

    const handleToggleCloseToTray = async () => {
        const newVal = !closeToTray;
        await setCloseToTray(newVal);
        notifySaved();
    };

    const handleToggleAutoStart = () => {
        setAutoStartRecording(!autoStartRecording);
        notifySaved();
    };

    const handleToggleDetailedTelemetry = () => {
        setRecordDetailedTelemetry(!recordDetailedTelemetry);
        notifySaved();
    };

    const handleSyncAirports = async () => {
        await syncOurAirports();
        notifySaved();
    };

    const handleToggleAutoCheckUpdates = () => {
        setAutoCheckUpdates(!autoCheckUpdates);
        notifySaved();
    };

    const handleCheckForUpdates = async () => {
        await checkForUpdates(false);
    };

    const handleInstallUpdate = async () => {
        await installUpdate();
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Page Header */}
                <div className="flex items-center justify-between pb-5 border-b border-neutral-200 dark:border-geist-hairline">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                            <Settings className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                        </div>
                        <div>
                            <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                                Settings & Preferences
                            </h1>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted">
                                Configure system tray behavior, themes, flight
                                recording rules, and datasets.
                            </p>
                        </div>
                    </div>

                    {savedSuccess && (
                        <div className="px-4 py-1 rounded-sm text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 animate-fade-in">
                            <span>Preferences updated</span>
                        </div>
                    )}
                </div>

                {/* Section 1: System Tray & Window Lifecycle */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <AppWindow className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                            System Tray & Window Lifecycle
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                        {/* Preference: Close to System Tray */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Close to System Tray
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    When enabled, closing the app window
                                    minimizes Apollo Flight to the system
                                    notification tray area instead of
                                    terminating the application. Active flight
                                    sessions continue in the background.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <button
                                    type="button"
                                    onClick={handleToggleCloseToTray}
                                    role="switch"
                                    aria-checked={closeToTray}
                                    aria-label="Toggle close to system tray"
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                                        closeToTray
                                            ? "bg-neutral-900 dark:bg-white"
                                            : "bg-neutral-300 dark:bg-[#333333]"
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                                            closeToTray
                                                ? "translate-x-4"
                                                : "translate-x-0"
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Preference: Table Pagination Limit */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Table Pagination Limit
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Controls the default number of items displayed per page in page tables.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                                    {[25, 50, 100].map((size) => (
                                        <button
                                            key={size}
                                            type="button"
                                            onClick={async () => {
                                                await setPageSize(size);
                                                notifySaved();
                                            }}
                                            className={`px-4 py-1 text-xs font-semibold rounded-xs transition-colors ${
                                                pageSize === size
                                                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                            }`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Preference: Interface Theme */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Interface Theme
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Toggle between color themes for the user interface.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <div className="inline-flex items-center rounded-full overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTheme("light");
                                            notifySaved();
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors ${
                                            theme === "light"
                                                ? "bg-white text-neutral-900"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                                        <span>Light</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTheme("dark");
                                            notifySaved();
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors ${
                                            theme === "dark"
                                                ? "bg-neutral-900 text-white dark:bg-[#333333] shadow-xs"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        <Moon className="w-3.5 h-3.5 text-blue-400" />
                                        <span>Dark</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Preference: Aircraft Weight Units */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Aircraft Weight Units
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Choose whether weight
                                    units across pages are displayed in
                                    kilograms or pounds.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await setWeightUnit("kg");
                                            notifySaved();
                                        }}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                            weightUnit === "kg"
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        <span>Kilograms (kg)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await setWeightUnit("lbs");
                                            notifySaved();
                                        }}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                            weightUnit === "lbs"
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        <span>Pounds (lbs)</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section Divider */}
                <hr className="border-neutral-200 dark:border-geist-hairline" />

                {/* Section 2: Flight Recording Lifecycle Rules */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                            Flight Recording Lifecycle Rules
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                                                {/* Preference: Detailed Telemetry Option (Phase 12) */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <Wind className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Detailed Atmospheric Telemetry
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Records full environmental
                                    information (ambient wind conditions, temperatues, and visibility). Disabled by default to
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
                                    <PlaneTakeoff className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Flight Start Conditions
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Monitors aircraft ground speed exceeding{" "}
                                    <span className="font-mono text-neutral-800 dark:text-neutral-200 font-medium">
                                        20 kt
                                    </span>{" "}
                                    or engine combustion offsets (
                                    <code className="font-mono text-[11px]">
                                        0x0894
                                    </code>{" "}
                                    /{" "}
                                    <code className="font-mono text-[11px]">
                                        0x092C
                                    </code>
                                    ) polled via FSUIPC7. Manual initiation via
                                    &ldquo;Start Flight Session&rdquo; is always
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
                                    <PlaneLanding className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Flight Stop & Safeguard Conditions
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Auto-started flights finalize when the
                                    aircraft remains stationary on the ground
                                    for 30 consecutive seconds with one or more
                                    engines shut down. Flights started manually
                                    are protected and present a confirmation
                                    prompt upon landing rather than
                                    auto-terminating.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5">
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                                    Stationary 30s + Cut
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section Divider */}
                <hr className="border-neutral-200 dark:border-geist-hairline" />

                {/* Section 3: Database & Aerodrome Datasets */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                            Database & Aerodrome Datasets
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                        {/* Preference: OurAirports Global Sync */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        OurAirports Global Sync
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Synchronize global airport, runway, and
                                    territory datasets from OurAirports for
                                    offline flights resolution.
                                </p>
                                {activeFlight && (
                                    <div className="flex items-center gap-2 p-2.5 rounded-sm text-xs bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 mt-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                        <span>
                                            Dataset update is locked while
                                            flight recording is active (
                                            {activeFlight.departureIcao} ➔{" "}
                                            {activeFlight.arrivalIcao}).
                                            Finalize flight before updating
                                            dataset.
                                        </span>
                                    </div>
                                )}

                                {isSyncingAirports && syncProgress && (
                                    <div className="space-y-1.5 p-3 rounded-sm bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-geist-hairline mt-2">
                                        <div className="flex items-center justify-between text-xs font-mono text-neutral-600 dark:text-neutral-300">
                                            <span className="truncate pr-2">
                                                {syncProgress.message}
                                            </span>
                                            <span className="shrink-0 font-semibold">
                                                {syncProgress.percent}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                                            <div
                                                className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                                                style={{
                                                    width: `${Math.max(5, syncProgress.percent)}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {lastSyncMessage && !isSyncingAirports && (
                                    <p className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-black/50 p-2 rounded-sm border border-neutral-200 dark:border-geist-hairline mt-2">
                                        {lastSyncMessage}
                                    </p>
                                )}
                            </div>

                            <div className="shrink-0 flex items-center">
                                <button
                                    type="button"
                                    onClick={handleSyncAirports}
                                    disabled={
                                        isSyncingAirports || !!activeFlight
                                    }
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 shadow-xs"
                                >
                                    <RefreshCw
                                        className={`w-3.5 h-3.5 ${isSyncingAirports ? "animate-spin" : ""}`}
                                    />
                                    <span>
                                        {isSyncingAirports
                                            ? "Syncing Dataset..."
                                            : "Sync Dataset"}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Preference: Database Engine & WAL Mode */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Database Engine
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Persistent local database storage file
                                    storing flight records, saved routes and
                                    visited country history.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                                    Local Storage
                                </span>
                            </div>
                        </div>

                        {/* Preference: Indexed Aerodromes */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Indexed Aerodromes
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Total count of worldwide airports, landing
                                    strips, and helipads currently indexed in
                                    local storage.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                                    {airportsCount.toLocaleString()} Aerodromes
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section Divider */}
                <hr className="border-neutral-200 dark:border-geist-hairline" />

                {/* Section: EFB Companion */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Tablet className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                            EFB Companion
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                        {/* Preference: EFB Server State & Mode */}
                        <div className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        EFB Server Mode
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Broadcast live telemetry and interactive charts to tablets or smartphones over your local Wi-Fi.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handleSetEfbMode("off")}
                                        className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
                                            efbCurrentMode === "off"
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        Off
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSetEfbMode("on")}
                                        className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
                                            efbCurrentMode === "on"
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        On
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSetEfbMode("auto")}
                                        className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
                                            efbCurrentMode === "auto"
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                        }`}
                                    >
                                        Auto-start
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Preference: Server Port */}
                        <div className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Server Port
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    TCP port used for local HTTP service and device connection.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                                <input
                                    type="number"
                                    min="1024"
                                    max="65535"
                                    placeholder="24820"
                                    value={efbPortInput}
                                    onChange={(e) => handleEfbPortChange(e.target.value)}
                                    disabled={efbStatus.isRunning}
                                    className="w-28 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <button
                                    type="button"
                                    onClick={handleGenerateRandomEfbPort}
                                    disabled={efbStatus.isRunning}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
                                    title="Generate safe random port"
                                >
                                    <RefreshCw
                                        className={`w-3 h-3 text-neutral-500 ${
                                            isSpinningPort ? "animate-spin" : ""
                                        }`}
                                    />
                                    <span>Random</span>
                                </button>
                            </div>
                        </div>

                        {/* Preference: QR Code View (Dropdown Drawer) */}
                        <div className={`p-4 sm:p-5 flex flex-col justify-between gap-4 ${efbCurrentMode === "off" ? "opacity-50" : ""}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1 max-w-xl">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                            Device Pairing QR Code
                                        </h3>
                                    </div>
                                    <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                        Open companion pairing QR Code and local Wi-Fi connection URL.
                                    </p>
                                </div>

                                <div className="shrink-0 flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setIsQrDrawerOpen(!isQrDrawerOpen)}
                                        disabled={efbCurrentMode === "off"}
                                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-all duration-200 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <QrCode className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                                        <span className="whitespace-nowrap">
                                            QR Code
                                        </span>
                                        <ChevronDown
                                            className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ease-out ${
                                                isQrDrawerOpen ? "rotate-180" : ""
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Dropdown Drawer */}
                            {isQrDrawerOpen && (
                                <div className="pt-4 border-t border-neutral-200 dark:border-geist-hairline flex flex-col sm:flex-row items-center gap-5">
                                    {efbStatus.isRunning && efbStatus.url ? (
                                        <>
                                            <div className="shrink-0">
                                                <QrCodeView value={efbStatus.url} size={150} className="rounded-sm"/>
                                            </div>
                                            <div className="space-y-2 text-left">
                                                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                                                    Point your iPad, tablet, or smartphone camera at this QR code while connected to your local Wi-Fi network.
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-neutral-100 dark:bg-black/50 border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white select-all">
                                                        {efbStatus.url}
                                                    </code>
                                                    <button
                                                        type="button"
                                                        onClick={handleCopyEfbUrl}
                                                        className="p-1.5 rounded-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                                        title="Copy URL"
                                                    >
                                                        {isCopiedEfbUrl ? (
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                        ) : (
                                                            <Copy className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full py-4 text-center rounded-sm bg-neutral-50 dark:bg-black/30 border border-dashed border-neutral-200 dark:border-geist-hairline text-xs text-neutral-500 dark:text-geist-muted">
                                            EFB server is currently stopped. Turn server <strong className="text-neutral-700 dark:text-neutral-300">On</strong> or <strong className="text-neutral-700 dark:text-neutral-300">Auto-start</strong> to generate your Wi-Fi pairing QR code.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Preference: Open EFB in Browser */}
                        <div className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${efbCurrentMode === "off" ? "opacity-50" : ""}`}>
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Browser Preview
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Test or view the Electronic Flight Bag interface directly in your desktop browser.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <a
                                    href={efbStatus.isRunning && efbStatus.url ? efbStatus.url : undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    role="button"
                                    aria-disabled={!efbStatus.isRunning || !efbStatus.url}
                                    onClick={(e) => {
                                        if (!efbStatus.isRunning || !efbStatus.url) {
                                            e.preventDefault();
                                        }
                                    }}
                                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm border border-neutral-300 dark:border-geist-hairline transition-all duration-200 select-none ${
                                        efbStatus.isRunning && efbStatus.url
                                            ? "bg-neutral-100 hover:bg-neutral-200 dark:bg-[#202020] dark:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 cursor-pointer"
                                            : "bg-neutral-100 dark:bg-[#202020] text-neutral-400 dark:text-neutral-500 opacity-50 cursor-not-allowed pointer-events-none"
                                    }`}
                                >
                                    <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
                                    <span>Open in Browser</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section Divider */}
                <hr className="border-neutral-200 dark:border-geist-hairline" />

                {/* Section: Data Backup, Export & Import */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Archive className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                            Data Management, Backup & Export
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                        {/* Preference: Export Data */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Export User Data
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Export your entire database or individual
                                    segments in JSON backup format.
                                </p>

                                {exportSuccessMsg && (
                                    <div className="pt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                        {exportSuccessMsg}
                                    </div>
                                )}

                                {/* Optional Telemetry Checkbox */}
                                <div className="pt-2 flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="telemetryExportToggle"
                                        checked={includeTelemetryExport}
                                        disabled={isExporting}
                                        onChange={(e) =>
                                            setIncludeTelemetryExport(
                                                e.target.checked,
                                            )
                                        }
                                        className="rounded border-neutral-300 dark:border-neutral-700 text-neutral-900 focus:ring-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <label
                                        htmlFor="telemetryExportToggle"
                                        className="text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer select-none"
                                    >
                                        Include high-resolution GPS telemetry
                                        points in logbook export
                                    </label>
                                </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={isExporting}
                                    onClick={() => handleExport("full")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Full Backup</span>
                                </button>

                                <button
                                    type="button"
                                    disabled={isExporting}
                                    onClick={() => handleExport("logbook")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer"
                                >
                                    <FolderDown className="w-3.5 h-3.5 text-neutral-500" />
                                    <span>Logbook</span>
                                </button>

                                <button
                                    type="button"
                                    disabled={isExporting}
                                    onClick={() => handleExport("routes")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer"
                                >
                                    <FolderDown className="w-3.5 h-3.5 text-neutral-500" />
                                    <span>Routes</span>
                                </button>

                                <button
                                    type="button"
                                    disabled={isExporting}
                                    onClick={() => handleExport("settings")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer"
                                >
                                    <Sliders className="w-3.5 h-3.5 text-neutral-500" />
                                    <span>Settings</span>
                                </button>
                            </div>
                        </div>

                        {/* Preference: Import Data */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Import Backup
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Restore from an exported Apollo Flight file.
                                    Includes conflict detection and
                                    property-level settings merging.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Import Data File</span>
                                </button>
                            </div>
                        </div>

                        {/* Preference: Recycle Bin Retention */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Recycle Bin & Flight Retention
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Deleted flights are kept safely in the
                                    Recycle Bin for 30 days before permanent
                                    purging.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <button
                                    type="button"
                                    onClick={() => setActiveView("recycle-bin")}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer"
                                >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Open Recycle Bin</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section Divider */}
                <hr className="border-neutral-200 dark:border-geist-hairline" />

                {/* Section 4: About Apollo Flight */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                            About Apollo Flight
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                        {/* Preference: Application Version */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <img
                                        src="/Icon.svg"
                                        alt="Apollo Flight"
                                        className="w-6 h-6 object-contain shrink-0"
                                    />
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Application Version
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Flight tracking, telemetry analysis, and IFR
                                    companion for Microsoft Flight Simulator
                                    2020 & 2024.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                                    v{packageJson.version}
                                </span>
                            </div>
                        </div>

                        {/* Preference: Auto Check for Updates on Startup */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Check for Updates on Startup
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Automatically check for newer Apollo Flight
                                    releases from GitHub when the application
                                    starts, and notify you when an update is
                                    available.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <button
                                    type="button"
                                    onClick={handleToggleAutoCheckUpdates}
                                    role="switch"
                                    aria-checked={autoCheckUpdates}
                                    aria-label="Toggle auto check for updates on startup"
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                                        autoCheckUpdates
                                            ? "bg-neutral-900 dark:bg-white"
                                            : "bg-neutral-300 dark:bg-[#333333]"
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                                            autoCheckUpdates
                                                ? "translate-x-4"
                                                : "translate-x-0"
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Preference: Software Updates */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <ArrowUpCircle className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Software Updates
                                    </h3>
                                    {updateMessage && (
                                        <span className="text-[11px] text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-black/50 py-0.5 px-2 rounded-sm border border-neutral-200 dark:border-geist-hairline animate-fade-in">
                                            {updateMessage}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Check for newer releases from our GitHub
                                    repository and install updates
                                    automatically.
                                </p>
                                {isInstallingUpdate &&
                                    downloadProgress !== null && (
                                        <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden mt-2">
                                            <div
                                                className="bg-emerald-500 h-1.5 transition-all duration-150 ease-out"
                                                style={{
                                                    width: `${downloadProgress}%`,
                                                }}
                                            />
                                        </div>
                                    )}
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={
                                        availableUpdate
                                            ? handleInstallUpdate
                                            : handleCheckForUpdates
                                    }
                                    disabled={
                                        isCheckingUpdate || isInstallingUpdate
                                    }
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 ${
                                        availableUpdate
                                            ? "bg-emerald-600 enabled:hover:bg-emerald-500 text-white focus-visible:ring-emerald-400 shadow-sm"
                                            : "bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black shadow-xs focus-visible:ring-neutral-400"
                                    }`}
                                >
                                    {isInstallingUpdate ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>
                                                {downloadProgress !== null
                                                    ? `Downloading ${downloadProgress}%`
                                                    : "Installing..."}
                                            </span>
                                        </>
                                    ) : availableUpdate ? (
                                        <>
                                            <Download className="w-3.5 h-3.5" />
                                            <span>
                                                Install v
                                                {availableUpdate.version} &
                                                Restart
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw
                                                className={`w-3.5 h-3.5 ${isCheckingUpdate ? "animate-spin" : ""}`}
                                            />
                                            <span>
                                                {isCheckingUpdate
                                                    ? "Checking..."
                                                    : "Check for Updates"}
                                            </span>
                                        </>
                                    )}
                                </button>
                                {availableUpdate && !isInstallingUpdate && (
                                    <button
                                        type="button"
                                        onClick={handleCheckForUpdates}
                                        disabled={isCheckingUpdate}
                                        title="Check again"
                                        className="p-1.5 rounded-sm text-neutral-500 enabled:hover:text-neutral-900 dark:enabled:hover:text-white enabled:hover:bg-neutral-100 dark:enabled:hover:bg-neutral-800 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <RefreshCw
                                            className={`w-3.5 h-3.5 ${isCheckingUpdate ? "animate-spin" : ""}`}
                                        />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Preference: Author & License */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Author & Maintainer
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Designed, developed, and maintained by
                                    Jürgen Jacobsen. Licensed under the MIT
                                    open-source license.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                                    MIT License
                                </span>
                            </div>
                        </div>

                        {/* Preference: Platform & Interface Architecture */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <Cpu className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Runtime Architecture
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    Low-latency desktop integration with
                                    Microsoft Flight Simulator communicating via
                                    FSUIPC7.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                                    Tauri v2
                                </span>
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                                    FSUIPC7
                                </span>
                                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                                    React 19
                                </span>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
            />
        </div>
    );
};
