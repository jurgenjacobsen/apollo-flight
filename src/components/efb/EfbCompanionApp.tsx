import React, { useEffect, useRef, useState } from "react";
import { useEfbStore } from "../../store/efbStore";
import { useFlightStore } from "../../store/flightStore";
import { useSmoothedTelemetry } from "../../hooks/useSmoothedTelemetry";
import { EfbHudView } from "./EfbHudView";
import { EfbRouteView } from "./EfbRouteView";
import { EfbIfrView } from "./EfbIfrView";
import { EfbScratchpadView } from "./EfbScratchpadView";
import { EfbChecklistsView } from "./EfbChecklistsView";
import { EfbWebSocketClient, isRunningInBrowser } from "../../services/efbService";
import { StatusPill, Tooltip } from "../ui";
import {
    Activity,
    Plane,
    Compass,
    RotateCw,
    ClipboardEdit,
    ListChecks,
    Menu,
    X,
    Sun,
    Moon,
    Eye,
    EyeOff,
    Wifi,
    WifiOff,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";

interface EfbCompanionAppProps {
    previewMode?: boolean;
}

export const EfbCompanionApp: React.FC<EfbCompanionAppProps> = ({
    previewMode = false,
}) => {
    const {
        activeTab,
        setActiveTab,
        isWsConnected,
        setIsWsConnected,
        isWakeLockActive,
        requestWakeLock,
        releaseWakeLock,
    } = useEfbStore();

    const { currentTelemetry: rawTelemetry, updateTelemetry, theme, toggleTheme } = useFlightStore();
    const currentTelemetry = useSmoothedTelemetry(rawTelemetry);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const wsClientRef = useRef<EfbWebSocketClient | null>(null);

    // Initialize WebSocket connection when running in browser or preview
    useEffect(() => {
        if (isRunningInBrowser() || previewMode) {
            const client = new EfbWebSocketClient(
                (data) => {
                    updateTelemetry(data);
                },
                (connected) => {
                    setIsWsConnected(connected);
                },
            );

            client.connect();
            wsClientRef.current = client;

            requestWakeLock();

            return () => {
                client.disconnect();
            };
        }
    }, [previewMode, updateTelemetry, setIsWsConnected, requestWakeLock]);

    // Keep html class in sync with theme
    useEffect(() => {
        if (typeof document !== "undefined") {
            if (theme === "dark") {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    }, [theme]);

    const navSections = [
        {
            label: "Operations",
            items: [
                { id: "hud", label: "Flight Overview", icon: Activity },
                { id: "route", label: "OFP / Route", icon: Plane },
            ],
        },
        {
            label: "Procedures",
            items: [
                { id: "ifr", label: "VOR / NDB", icon: Compass },
                { id: "hold", label: "Holding Trainer", icon: RotateCw },
            ],
        },
        {
            label: "Companion",
            items: [
                { id: "scratchpad", label: "ATC Scratchpad", icon: ClipboardEdit },
                { id: "checklists", label: "Checklists", icon: ListChecks },
            ],
        },
    ];

    return (
        <div className="flex h-screen w-screen bg-neutral-50 dark:bg-black text-neutral-900 dark:text-[#ededed] overflow-hidden font-sans selection:bg-neutral-200 dark:selection:bg-[#333333] transition-colors duration-150">
            {/* Desktop / Tablet Sidebar (Matching desktop Sidebar) */}
            <aside
                className={`hidden md:flex ${
                    isSidebarCollapsed ? "w-16" : "w-64"
                } bg-white dark:bg-geist-surface border-r border-neutral-200 dark:border-geist-hairline flex-col justify-between select-none z-20 flex-shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden`}
            >
                {/* Brand Header */}
                <div className="py-3.5 px-3 border-b border-neutral-200 dark:border-geist-hairline overflow-hidden">
                    <div className="flex items-center gap-2.5 w-full">
                        <Tooltip content="Apollo Flight — Flight Overview" placement="right">
                            <button
                                type="button"
                                onClick={() => setActiveTab("hud")}
                                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-sm hover:bg-neutral-100 dark:hover:bg-[#181818] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer"
                            >
                                <img
                                    src="/Icon.svg"
                                    alt="Apollo Flight"
                                    className="w-7 h-7 object-contain shrink-0"
                                />
                            </button>
                        </Tooltip>
                        <div
                            className={`flex flex-col min-w-0 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                                isSidebarCollapsed
                                    ? "max-w-0 opacity-0 -translate-x-3 pointer-events-none"
                                    : "max-w-[150px] opacity-100 translate-x-0"
                            }`}
                        >
                            <span className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-white truncate">
                                Apollo Flight
                            </span>
                            <span className="text-[10px] text-neutral-500 dark:text-geist-muted tracking-tight truncate">
                                EFB Companion
                            </span>
                        </div>
                    </div>
                </div>

                {/* Nav Items */}
                <div className="flex-1 py-3 px-2.5 overflow-y-auto overflow-x-hidden space-y-3">
                    {navSections.map((section, idx) => (
                        <div key={section.label} className="space-y-1">
                            <div>
                                <div
                                    className={`px-2 pb-0.5 text-[11px] font-medium text-neutral-400 dark:text-geist-muted whitespace-nowrap transition-all duration-200 ease-in-out overflow-hidden ${
                                        isSidebarCollapsed
                                            ? "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
                                            : "max-h-6 opacity-100 translate-y-0"
                                    }`}
                                >
                                    {section.label}
                                </div>
                                {idx > 0 && (
                                    <div
                                        className={`transition-all duration-200 ease-in-out ${
                                            isSidebarCollapsed
                                                ? "my-3 mx-auto w-5 h-[1px] bg-neutral-200 dark:bg-[#262626] opacity-100"
                                                : "max-h-0 opacity-0 pointer-events-none"
                                        }`}
                                    />
                                )}
                            </div>
                            <div className="space-y-0.5">
                                {section.items.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = activeTab === item.id;
                                    return (
                                        <Tooltip
                                            key={item.id}
                                            content={item.label}
                                            placement="right"
                                            disabled={!isSidebarCollapsed}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab(item.id as any)}
                                                className={`w-full h-9 flex items-center rounded-sm transition-colors duration-150 relative group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                                                isSidebarCollapsed
                                                    ? "px-0 justify-center"
                                                    : "px-2.5 justify-start gap-2.5"
                                            } ${
                                                isActive
                                                    ? "bg-neutral-900 text-white font-medium dark:bg-[#1f1f1f] dark:text-white dark:border dark:border-[#383838] shadow-xs"
                                                    : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-[#151515]"
                                            }`}
                                        >
                                            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                                <Icon
                                                    className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                                                        isActive
                                                            ? "text-white"
                                                            : "text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white"
                                                    }`}
                                                />
                                            </div>
                                            <span
                                                className={`text-xs truncate transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] whitespace-nowrap overflow-hidden ${
                                                    isSidebarCollapsed
                                                        ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                                                        : "max-w-[150px] opacity-100 translate-x-0"
                                                }`}
                                            >
                                                {item.label}
                                            </span>
                                        </button>
                                        </Tooltip>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom EFB Stream Status & Sidebar Collapse Action */}
                <div className="p-2.5 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-surface space-y-2 overflow-hidden">
                    {!isSidebarCollapsed && (
                        <div className="px-2.5 py-1.5 rounded-sm bg-neutral-100/80 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline flex items-center justify-between text-[11px]">
                            <span className="text-neutral-500 dark:text-geist-muted font-medium">
                                Wi-Fi Stream
                            </span>
                            <span
                                className={`flex items-center gap-1 font-medium tabular-nums ${
                                    isWsConnected
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-amber-600 dark:text-amber-400"
                                }`}
                            >
                                {isWsConnected ? (
                                    <Wifi className="w-3 h-3" />
                                ) : (
                                    <WifiOff className="w-3 h-3" />
                                )}
                                {isWsConnected ? "Online" : "Waiting"}
                            </span>
                        </div>
                    )}

                    <Tooltip
                        content={
                            isSidebarCollapsed
                                ? "Expand sidebar"
                                : "Collapse sidebar"
                        }
                        placement="right"
                    >
                        <button
                            type="button"
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className={`w-full h-9 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 dark:bg-[#171717] dark:hover:bg-[#222222] text-neutral-800 dark:text-[#ededed] text-xs rounded-sm border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                            isSidebarCollapsed ? "gap-0" : "gap-2"
                        }`}
                    >
                        <div
                            className={`w-5 h-5 shrink-0 flex items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                                isSidebarCollapsed ? "rotate-180" : "rotate-0"
                            }`}
                        >
                            <ChevronLeft className="w-4 h-4 shrink-0" />
                        </div>
                        <span
                            className={`whitespace-nowrap overflow-hidden transition-all duration-200 ease-in-out ${
                                isSidebarCollapsed
                                    ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                                    : "max-w-[140px] opacity-100 translate-x-0"
                            }`}
                        >
                            Collapse Sidebar
                        </span>
                    </button>
                    </Tooltip>
                </div>
            </aside>

            {/* Mobile Slide-Over Drawer */}
            {isMobileSidebarOpen && (
                <div
                    className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-xs flex"
                    onClick={() => setIsMobileSidebarOpen(false)}
                >
                    <div
                        className="w-64 bg-white dark:bg-geist-surface border-r border-neutral-200 dark:border-geist-hairline h-full flex flex-col justify-between p-3 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-geist-hairline">
                                <div className="flex items-center gap-2.5">
                                    <img src="/Icon.svg" alt="Apollo Flight" className="w-7 h-7" />
                                    <div>
                                        <span className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-white block">
                                            Apollo Flight
                                        </span>
                                        <span className="text-[10px] text-neutral-500 dark:text-geist-muted block">
                                            EFB Companion
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsMobileSidebarOpen(false)}
                                    aria-label="Close navigation menu"
                                    className="p-1.5 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <StatusPill className="w-full justify-between" />

                            <div className="space-y-3 pt-1">
                                {navSections.map((section) => (
                                    <div key={section.label} className="space-y-1">
                                        <div className="px-2 pb-0.5 text-[11px] font-medium text-neutral-400 dark:text-geist-muted">
                                            {section.label}
                                        </div>
                                        <div className="space-y-0.5">
                                            {section.items.map((item) => {
                                                const Icon = item.icon;
                                                const isActive = activeTab === item.id;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveTab(item.id as any);
                                                            setIsMobileSidebarOpen(false);
                                                        }}
                                                        className={`w-full h-9 flex items-center gap-2.5 px-2.5 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                                                            isActive
                                                                ? "bg-neutral-900 text-white font-medium dark:bg-[#1f1f1f] dark:text-white dark:border dark:border-[#383838] shadow-xs"
                                                                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#151515]"
                                                        }`}
                                                    >
                                                        <Icon className="w-[18px] h-[18px] shrink-0" />
                                                        <span>{item.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-2.5 py-1.5 rounded-sm bg-neutral-100/80 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline flex items-center justify-between text-[11px]">
                            <span className="text-neutral-500 dark:text-geist-muted font-medium">
                                Wi-Fi Stream
                            </span>
                            <span
                                className={`flex items-center gap-1 font-medium tabular-nums ${
                                    isWsConnected
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-amber-600 dark:text-amber-400"
                                }`}
                            >
                                {isWsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                {isWsConnected ? "Online" : "Waiting"}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Area: TopHeader + Dynamic Viewport */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-50 dark:bg-black">
                {/* Real-time Telemetry Top Header (Matching desktop TopHeader) */}
                <header className="relative h-11 bg-white/90 dark:bg-black/90 border-b border-neutral-200 dark:border-geist-hairline px-3 sm:px-4 flex items-center justify-between text-xs font-sans text-neutral-700 dark:text-neutral-200 z-30 flex-shrink-0 select-none transition-colors duration-150 gap-2 backdrop-blur-xs">
                    {/* Left: Mobile hamburger & Real-time Telemetry */}
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            type="button"
                            onClick={() => setIsMobileSidebarOpen(true)}
                            aria-label="Open navigation menu"
                            className="p-1 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white md:hidden hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                        >
                            <Menu className="w-3.5 h-3.5" />
                        </button>

                        {/* Telemetry items matching desktop TopHeader */}
                        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto text-xs no-scrollbar">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-500 dark:text-neutral-400 font-medium">ALT</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {Math.round(currentTelemetry.altitudeMsl).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">FT</span>
                            </div>

                            <div className="h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-500 dark:text-neutral-400 font-medium">GS</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {Math.round(currentTelemetry.groundSpeed)}
                                </span>
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">KT</span>
                                <span className="hidden md:inline text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                                    ({Math.round(currentTelemetry.indicatedAirspeed)} IAS)
                                </span>
                            </div>

                            <div className="h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-500 dark:text-neutral-400 font-medium">HDG</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {String(Math.round(currentTelemetry.heading)).padStart(3, "0")}°
                                </span>
                            </div>

                            <div className="hidden sm:block h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-500 dark:text-neutral-400 font-medium">VS</span>
                                <span
                                    className={`font-semibold tabular-nums ${
                                        currentTelemetry.verticalSpeed > 50
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : currentTelemetry.verticalSpeed < -50
                                              ? "text-red-600 dark:text-rose-400"
                                              : "text-neutral-700 dark:text-neutral-300"
                                    }`}
                                >
                                    {currentTelemetry.verticalSpeed > 0
                                        ? `+${Math.round(currentTelemetry.verticalSpeed)}`
                                        : Math.round(currentTelemetry.verticalSpeed)}
                                </span>
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">FPM</span>
                            </div>

                            <div className="hidden lg:block h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                            <div className="hidden lg:flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-500 dark:text-neutral-400 font-medium">WIND</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {String(Math.round(currentTelemetry.windDirection ?? 0)).padStart(3, "0")}° /{" "}
                                    {Math.round(currentTelemetry.windSpeed ?? 0)} KT
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Controls: StatusPill, Wake Lock & Theme Toggle */}
                    <div className="flex items-center gap-2 sm:gap-3 pl-2 shrink-0">
                        <div className="hidden sm:block">
                            <StatusPill />
                        </div>

                        <div className="hidden sm:block h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800" />

                        {/* Wake Lock Screen On/Off */}
                        <Tooltip
                            content={
                                isWakeLockActive
                                    ? "Screen Wake Lock Active"
                                    : "Enable Screen Wake Lock"
                            }
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    if (isWakeLockActive) {
                                        releaseWakeLock();
                                    } else {
                                        requestWakeLock();
                                    }
                                }}
                                aria-label={isWakeLockActive ? "Disable screen wake lock" : "Enable screen wake lock"}
                                className={`p-1 rounded-sm border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                                    isWakeLockActive
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border-neutral-200 dark:border-geist-hairline"
                                }`}
                            >
                                {isWakeLockActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                        </Tooltip>

                        {/* Theme Toggle (Sun/Moon matching desktop TopHeader) */}
                        <Tooltip
                            content={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
                        >
                            <button
                                type="button"
                                onClick={toggleTheme}
                                aria-label={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
                                className="p-1 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                            >
                                {theme === "light" ? (
                                    <Moon className="w-3.5 h-3.5" />
                                ) : (
                                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                                )}
                            </button>
                        </Tooltip>
                    </div>
                </header>

                {/* Viewport content */}
                <main className="flex-1 flex flex-col overflow-hidden">
                    {activeTab === "hud" && <EfbHudView />}
                    {activeTab === "route" && <EfbRouteView />}
                    {(activeTab === "ifr" || (activeTab as string) === "hold") && <EfbIfrView />}
                    {activeTab === "scratchpad" && <EfbScratchpadView />}
                    {activeTab === "checklists" && <EfbChecklistsView />}
                </main>
            </div>
        </div>
    );
};

export default EfbCompanionApp;
