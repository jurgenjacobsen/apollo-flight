import React, { useState, useEffect, useRef } from "react";
import { useFlightStore, safeInvoke } from "../../store/flightStore";
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
    Wind,
    Scale,
    Tablet,
    QrCode,
    ChevronDown,
    Copy,
    ExternalLink,
    BookOpen,
    Route,
    FolderOpen,
    Plus,
} from "lucide-react";

import packageJson from "../../../package.json";
import type { Update } from "@tauri-apps/plugin-updater";
import { Checkbox, Tooltip } from "../ui";
import { QrCodeView } from "../ui/QrCodeView";
import { ImportModal } from "../modals/ImportModal";

const SETTINGS_SECTIONS = [
    {
        id: "settings-window",
        label: "System Tray & Window Lifecycle",
        shortLabel: "Window & Tray",
        icon: AppWindow,
    },
    {
        id: "settings-recording",
        label: "Flight Recording Lifecycle Rules",
        shortLabel: "Recording Rules",
        icon: Sliders,
    },
    {
        id: "settings-database",
        label: "Database & Aerodrome Datasets",
        shortLabel: "Datasets & Airports",
        icon: Database,
    },
    {
        id: "settings-efb",
        label: "EFB Companion",
        shortLabel: "EFB Companion",
        icon: Tablet,
    },
    {
        id: "settings-documentation",
        label: "Documentation Options",
        shortLabel: "Documentation",
        icon: BookOpen,
    },
    {
        id: "settings-data",
        label: "Data Management, Backup & Export",
        shortLabel: "Backup & Export",
        icon: Archive,
    },
    {
        id: "settings-about",
        label: "About Apollo Flight",
        shortLabel: "About & Runtime",
        icon: Info,
    },
];

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
        docCustomDirs,
        docLiveUpdate,
        setDocCustomDirs,
        setDocLiveUpdate,
    } = useFlightStore();

    const [savedSuccess, setSavedSuccess] = useState(false);
    const [manualDocDir, setManualDocDir] = useState("");
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [includeTelemetryExport, setIncludeTelemetryExport] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(
        null,
    );
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isExportMenuOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                exportMenuRef.current &&
                !exportMenuRef.current.contains(e.target as Node)
            ) {
                setIsExportMenuOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsExportMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isExportMenuOpen]);

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

    const containerRef = useRef<HTMLDivElement>(null);
    const [activeSection, setActiveSection] = useState<string>("settings-window");

    useEffect(() => {
        const rootEl = containerRef.current;
        if (!rootEl) return;

        const checkBottom = () => {
            const isAtBottom =
                rootEl.scrollHeight - rootEl.scrollTop - rootEl.clientHeight < 40;
            if (isAtBottom) {
                const lastSection = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1];
                if (lastSection) {
                    setActiveSection(lastSection.id);
                    return true;
                }
            }
            return false;
        };

        const handleScroll = () => {
            checkBottom();
        };

        const observer = new IntersectionObserver(
            (entries) => {
                if (checkBottom()) return;

                const visible = entries.filter((e) => e.isIntersecting);
                if (visible.length > 0) {
                    visible.sort(
                        (a, b) =>
                            a.boundingClientRect.top -
                            b.boundingClientRect.top,
                    );
                    setActiveSection(visible[0].target.id);
                }
            },
            {
                root: rootEl,
                rootMargin: "-10% 0px -65% 0px",
                threshold: [0, 0.2, 0.5],
            },
        );

        rootEl.addEventListener("scroll", handleScroll, { passive: true });

        SETTINGS_SECTIONS.forEach((sec) => {
            const el = document.getElementById(sec.id);
            if (el) observer.observe(el);
        });

        return () => {
            rootEl.removeEventListener("scroll", handleScroll);
            observer.disconnect();
        };
    }, []);

    const handleScrollTo = (id: string) => {
        setActiveSection(id);
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    return (
        <div
            ref={containerRef}
            className="flex-1 overflow-y-auto p-6 md:p-8 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150"
        >
            <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-6">
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


                {/* 2-Column Content + Sticky Sidebar */}
                <div className="flex items-stretch gap-8 xl:gap-12">
                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0 space-y-8 pb-32">
                        {/* Section 1: System Tray & Window Lifecycle */}
                        <section id="settings-window" className="space-y-4 scroll-mt-6">
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
                                <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTheme("light");
                                            notifySaved();
                                        }}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                            theme === "light"
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
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
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                            theme === "dark"
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
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
                <section id="settings-recording" className="space-y-4 scroll-mt-6">
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
                    </div>
                </section>

                {/* Section Divider */}
                <hr className="border-neutral-200 dark:border-geist-hairline" />

                {/* Section 3: Database & Aerodrome Datasets */}
                <section id="settings-database" className="space-y-4 scroll-mt-6">
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
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 shadow-xs"
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
                <section id="settings-efb" className="space-y-4 scroll-mt-6">
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
                                    className="w-28 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:opacity-50 disabled:cursor-default"
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
                                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-all duration-200 select-none cursor-pointer disabled:cursor-default disabled:opacity-50"
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
                                            : "bg-neutral-100 dark:bg-[#202020] text-neutral-400 dark:text-neutral-500 opacity-50 cursor-default pointer-events-none"
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

                {/* Section: Documentation Options */}
                <section id="settings-documentation" className="space-y-4 scroll-mt-6">
                    <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                            Documentation Options
                        </h2>
                    </div>

                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                        {/* Live Update Toggle */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Live Update Documentation Indexing
                                    </h3>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                    When enabled, the app continuously syncs files added to your documentation folders. Disabling pauses background checks and only indexes documents when opening the view.
                                </p>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={docLiveUpdate}
                                    onClick={async () => {
                                        await setDocLiveUpdate(!docLiveUpdate);
                                        notifySaved();
                                    }}
                                    aria-label="Toggle live update documentation indexing"
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                                        docLiveUpdate
                                            ? "bg-neutral-900 dark:bg-white"
                                            : "bg-neutral-300 dark:bg-[#333333]"
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                                            docLiveUpdate
                                                ? "translate-x-4"
                                                : "translate-x-0"
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Custom Folders Directory Selector */}
                        <div className="p-4 sm:p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1 max-w-xl">
                                    <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                        Custom Documentation Directories
                                    </h3>
                                    <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                        Give the app access to fetch and render .md and .pdf files from your own aircraft manuals, charts, or briefing folders.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await safeInvoke("open_user_docs_folder");
                                            } catch {}
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200 transition-colors shadow-xs"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                                        <span>Open User Docs Folder</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                const sel = await safeInvoke<string | null>("open_directory_dialog");
                                                if (sel && !docCustomDirs.includes(sel)) {
                                                    await setDocCustomDirs([...docCustomDirs, sel]);
                                                    notifySaved();
                                                }
                                            } catch {}
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-neutral-100 transition-colors shadow-xs"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Browse Folder</span>
                                    </button>
                                </div>
                            </div>

                            {/* Manual Path Entry Input */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={manualDocDir}
                                    onChange={(e) => setManualDocDir(e.target.value)}
                                    placeholder="Or paste directory path (e.g. C:\FlightSim\Checklists or D:\Charts)..."
                                    className="flex-1 px-3 py-1.5 text-xs rounded-sm bg-neutral-50 dark:bg-[#111111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                                    onKeyDown={async (e) => {
                                        if (e.key === "Enter") {
                                            const trimmed = manualDocDir.trim();
                                            if (trimmed && !docCustomDirs.includes(trimmed)) {
                                                await setDocCustomDirs([...docCustomDirs, trimmed]);
                                                setManualDocDir("");
                                                notifySaved();
                                            }
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const trimmed = manualDocDir.trim();
                                        if (trimmed && !docCustomDirs.includes(trimmed)) {
                                            await setDocCustomDirs([...docCustomDirs, trimmed]);
                                            setManualDocDir("");
                                            notifySaved();
                                        }
                                    }}
                                    disabled={!manualDocDir.trim()}
                                    className="px-3 py-1.5 text-xs font-medium rounded-sm border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200 disabled:opacity-40 transition-colors"
                                >
                                    Add Directory
                                </button>
                            </div>

                            {/* Active Directory List */}
                            {docCustomDirs.length > 0 ? (
                                <div className="space-y-1.5 pt-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                                        Indexed Custom Folders ({docCustomDirs.length})
                                    </span>
                                    <div className="space-y-1">
                                        {docCustomDirs.map((dir) => (
                                            <div
                                                key={dir}
                                                className="flex items-center justify-between p-2 rounded bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline text-xs"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <FolderOpen className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                                    <span className="text-[11px] text-neutral-800 dark:text-neutral-200 truncate">
                                                        {dir}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        await setDocCustomDirs(docCustomDirs.filter((d) => d !== dir));
                                                        notifySaved();
                                                    }}
                                                    className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-2 shrink-0"
                                                    title="Remove folder from index"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 rounded bg-neutral-50 dark:bg-[#141414] border border-dashed border-neutral-200 dark:border-geist-hairline text-center text-xs text-neutral-400">
                                    No custom directories added yet. Files in the default /user-docs and /docs folders are indexed automatically.
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Section Divider */}
                <hr className="border-neutral-200 dark:border-geist-hairline" />

                {/* Section: Data Backup, Export & Import */}
                <section id="settings-data" className="space-y-4 scroll-mt-6">
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
                                        User Data
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
                                <div className="pt-2">
                                    <Checkbox
                                        id="telemetryExportToggle"
                                        checked={includeTelemetryExport}
                                        disabled={isExporting}
                                        onChange={setIncludeTelemetryExport}
                                        label="Include high-resolution GPS telemetry points in logbook export"
                                    />
                                </div>
                            </div>

                            <div className="shrink-0 flex items-center">
                                <div
                                    ref={exportMenuRef}
                                    className="relative inline-flex items-center rounded-sm shadow-xs bg-neutral-900 dark:bg-white text-white dark:text-black"
                                >
                                    {/* Primary Action Button: "Export" */}
                                    <Tooltip
                                        content="Export full backup bundle"
                                        disabled={isExportMenuOpen}
                                    >
                                        <button
                                            type="button"
                                            disabled={isExporting}
                                            onClick={() => handleExport("full")}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-l-sm enabled:hover:bg-neutral-800 dark:enabled:hover:bg-neutral-200 transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            <span>
                                                {isExporting
                                                    ? "Exporting..."
                                                    : "Export"}
                                            </span>
                                        </button>
                                    </Tooltip>

                                    {/* Vertical divider */}
                                    <div className="h-4 w-px bg-neutral-700 dark:bg-neutral-300" />

                                    {/* Chevron trigger button */}
                                    <Tooltip
                                        content="Choose specific data to export"
                                        disabled={isExportMenuOpen}
                                    >
                                        <button
                                            type="button"
                                            disabled={isExporting}
                                            onClick={() =>
                                                setIsExportMenuOpen(
                                                    !isExportMenuOpen,
                                                )
                                            }
                                            aria-expanded={isExportMenuOpen}
                                            className="px-2 py-1.5 text-xs font-medium rounded-r-sm enabled:hover:bg-neutral-800 dark:enabled:hover:bg-neutral-200 transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 flex items-center justify-center"
                                        >
                                            <ChevronDown
                                                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                                                    isExportMenuOpen
                                                        ? "rotate-180"
                                                        : ""
                                                }`}
                                            />
                                        </button>
                                    </Tooltip>

                                    {/* Dropdown Menu */}
                                    {isExportMenuOpen && (
                                        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white dark:bg-[#161616] border border-neutral-200 dark:border-[#2a2a2a] rounded-sm shadow-xl p-1 text-left text-neutral-900 dark:text-neutral-100 select-none animate-in fade-in zoom-in-95 duration-100">
                                            <div className="px-2.5 pb-1.5 border-b border-neutral-100 dark:border-[#222222] mb-1">
                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                                    Export Scope
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExport("full");
                                                }}
                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xs text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors"
                                            >
                                                <Download className="w-3.5 h-3.5 text-neutral-500" />
                                                <div className="flex-1 text-left">
                                                    <div>Full Backup</div>
                                                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                                                        Entire dataset & history
                                                    </div>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExport("logbook");
                                                }}
                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xs text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors"
                                            >
                                                <BookOpen className="w-3.5 h-3.5 text-neutral-500" />
                                                <div className="flex-1 text-left">
                                                    <div>Logbook Only</div>
                                                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                                                        Flight logs & stats
                                                    </div>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExport("routes");
                                                }}
                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xs text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors"
                                            >
                                                <Route className="w-3.5 h-3.5 text-neutral-500" />
                                                <div className="flex-1 text-left">
                                                    <div>Routes Only</div>
                                                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                                                        Saved flight plans
                                                    </div>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExport("settings");
                                                }}
                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xs text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors"
                                            >
                                                <Sliders className="w-3.5 h-3.5 text-neutral-500" />
                                                <div className="flex-1 text-left">
                                                    <div>Settings Only</div>
                                                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                                                        Preferences & config
                                                    </div>
                                                </div>
                                            </button>
                                        </div>
                                    )}
                                </div>
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

                {/* Section 6: About Apollo Flight */}
                <section id="settings-about" className="space-y-4 scroll-mt-6">
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
                                    Automatically check for newer versions when the application
                                    starts.
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
                                    and install updates automatically.
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
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 ${
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
                                        className="p-1.5 rounded-sm text-neutral-500 enabled:hover:text-neutral-900 dark:enabled:hover:text-white enabled:hover:bg-neutral-100 dark:enabled:hover:bg-neutral-800 transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
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
                    </div>
                </section>
            </div>

            {/* Right Rail: Sticky Glossary Navigation */}
            <aside className="hidden lg:block w-48 xl:w-56 shrink-0 self-stretch">
                <div className="sticky top-6 space-y-3">
                    <div className="flex items-center gap-2 px-2 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 dark:text-neutral-500 select-none">
                        <span>On This Page</span>
                    </div>

                    <nav className="space-y-0.5 border-l border-neutral-200 dark:border-geist-hairline">
                        {SETTINGS_SECTIONS.map((sec) => {
                            const Icon = sec.icon;
                            const isActive = activeSection === sec.id;
                            return (
                                <button
                                    key={sec.id}
                                    type="button"
                                    onClick={() => handleScrollTo(sec.id)}
                                    className={`group -ml-[1px] w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer border-l-2 select-none ${
                                        isActive
                                            ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white bg-neutral-100/60 dark:bg-neutral-900/60 rounded-r-xs"
                                            : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:border-neutral-300 dark:hover:border-neutral-700"
                                    }`}
                                >
                                    <Icon
                                        className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                            isActive
                                                ? "text-neutral-900 dark:text-white"
                                                : "text-neutral-400 group-hover:text-neutral-700 dark:text-neutral-500 dark:group-hover:text-neutral-300"
                                        }`}
                                    />
                                    <span className="truncate">{sec.shortLabel}</span>
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </aside>
        </div>
    </div>

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
            />
        </div>
    );
};
