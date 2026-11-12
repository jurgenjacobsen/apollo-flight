import React, { useEffect, useRef, useState } from "react";
import { useEfbStore } from "../../store/efbStore";
import { useFlightStore } from "../../store/flightStore";
import { EfbHudView } from "./EfbHudView";
import { EfbRouteView } from "./EfbRouteView";
import { EfbIfrView } from "./EfbIfrView";
import { EfbScratchpadView } from "./EfbScratchpadView";
import { EfbChecklistsView } from "./EfbChecklistsView";
import { EfbWebSocketClient, isRunningInBrowser } from "../../services/efbService";
import { StatusPill } from "../ui";
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

    const { currentTelemetry, updateTelemetry, theme, toggleTheme } = useFlightStore();
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
            label: "Procedural Trainer",
            items: [
                { id: "ifr", label: "VOR / NDB Intercept", icon: Compass },
                { id: "hold", label: "Holding Pattern", icon: RotateCw },
            ],
        },
        {
            label: "Companion Tools",
            items: [
                { id: "scratchpad", label: "ATC Scratchpad", icon: ClipboardEdit },
                { id: "checklists", label: "Checklists", icon: ListChecks },
            ],
        },
    ];

    return (
        <div className="flex h-screen w-screen bg-neutral-50 dark:bg-black text-neutral-900 dark:text-[#ededed] overflow-hidden font-sans selection:bg-neutral-200 dark:selection:bg-[#333333] transition-colors duration-150">
            {/* Desktop / Tablet Sidebar (Collapsible, identical to Apollo desktop) */}
            <aside
                className={`hidden md:flex ${
                    isSidebarCollapsed ? "w-16" : "w-60"
                } bg-white dark:bg-geist-surface border-r border-neutral-200 dark:border-geist-hairline flex-col justify-between select-none z-20 flex-shrink-0 transition-all duration-200`}
            >
                {/* Brand Header */}
                <div
                    className={`p-3.5 border-b border-neutral-200 dark:border-geist-hairline ${
                        isSidebarCollapsed ? "px-2" : ""
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <img
                                src="/Icon.svg"
                                alt="Apollo Flight"
                                className="w-7 h-7 object-contain shrink-0"
                            />
                            {!isSidebarCollapsed && (
                                <div className="flex flex-col gap-0 min-w-0">
                                    <span className="font-semibold text-xs tracking-tight text-neutral-900 dark:text-white truncate">
                                        Apollo Flight
                                    </span>
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono tracking-tight truncate">
                                        EFB Companion
                                    </span>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                            {isSidebarCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronLeft className="w-3.5 h-3.5" />
                            )}
                        </button>
                    </div>

                    {/* Sim Status Pill */}
                    <div className="mt-2.5 pt-2.5 border-t border-neutral-200 dark:border-geist-hairline">
                        <StatusPill compact={isSidebarCollapsed} className="w-full justify-between" />
                    </div>
                </div>

                {/* Nav Items */}
                <div
                    className={`flex-1 py-3 ${
                        isSidebarCollapsed ? "px-1.5" : "px-2.5"
                    } overflow-y-auto space-y-4`}
                >
                    {navSections.map((section) => (
                        <div key={section.label} className="space-y-1">
                            {!isSidebarCollapsed && (
                                <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 dark:text-geist-muted">
                                    {section.label}
                                </div>
                            )}
                            {section.items.map((item) => {
                                const Icon = item.icon;
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id as any)}
                                        title={item.label}
                                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs transition-colors duration-150 ${
                                            isActive
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold shadow-sm"
                                                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1a1a1a]"
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        {!isSidebarCollapsed && (
                                            <span className="truncate">{item.label}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Bottom EFB Info Ribbon */}
                {!isSidebarCollapsed && (
                    <div className="p-3 border-t border-neutral-200 dark:border-geist-hairline text-[11px] font-mono text-neutral-400 space-y-1">
                        <div className="flex items-center justify-between">
                            <span>WIFI STREAM</span>
                            <span className="flex items-center gap-1 text-emerald-500 font-bold">
                                {isWsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
                                {isWsConnected ? "ONLINE" : "WAITING"}
                            </span>
                        </div>
                    </div>
                )}
            </aside>

            {/* Mobile Slide-Over Drawer */}
            {isMobileSidebarOpen && (
                <div
                    className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-xs flex"
                    onClick={() => setIsMobileSidebarOpen(false)}
                >
                    <div
                        className="w-64 bg-white dark:bg-geist-surface border-r border-neutral-200 dark:border-geist-hairline h-full flex flex-col justify-between p-4 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-geist-hairline">
                                <div className="flex items-center gap-2">
                                    <img src="/Icon.svg" alt="Apollo Flight" className="w-7 h-7" />
                                    <div>
                                        <span className="font-semibold text-xs text-neutral-900 dark:text-white block">
                                            Apollo Flight
                                        </span>
                                        <span className="text-[10px] text-blue-500 font-mono">
                                            EFB Companion
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsMobileSidebarOpen(false)}
                                    className="p-1 rounded text-neutral-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <StatusPill className="w-full justify-between" />

                            <div className="space-y-4 pt-2">
                                {navSections.map((section) => (
                                    <div key={section.label} className="space-y-1">
                                        <div className="px-2 text-[10px] font-semibold uppercase text-neutral-400">
                                            {section.label}
                                        </div>
                                        {section.items.map((item) => {
                                            const Icon = item.icon;
                                            const isActive = activeTab === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => {
                                                        setActiveTab(item.id as any);
                                                        setIsMobileSidebarOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs ${
                                                        isActive
                                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold"
                                                            : "text-neutral-600 dark:text-neutral-400"
                                                    }`}
                                                >
                                                    <Icon className="w-4 h-4" />
                                                    <span>{item.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Area: TopHeader + Dynamic Viewport */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-50 dark:bg-black">
                {/* Real-time Telemetry Top Header (Matching desktop TopHeader) */}
                <header className="h-11 bg-white dark:bg-geist-surface border-b border-neutral-200 dark:border-geist-hairline px-3 sm:px-4 flex items-center justify-between text-xs font-sans text-neutral-600 dark:text-neutral-300 z-10 flex-shrink-0 select-none transition-colors duration-150 gap-2">
                    {/* Left: Mobile hamburger & Real-time Telemetry */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <button
                            type="button"
                            onClick={() => setIsMobileSidebarOpen(true)}
                            className="p-1.5 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white md:hidden hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline shrink-0"
                        >
                            <Menu className="w-3.5 h-3.5" />
                        </button>

                        {/* Telemetry items matching desktop TopHeader */}
                        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto text-xs no-scrollbar font-mono">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-400 dark:text-geist-muted font-medium">ALT</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {Math.round(currentTelemetry.altitudeMsl).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-neutral-400">FT</span>
                            </div>

                            <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-400 dark:text-geist-muted font-medium">GS</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {Math.round(currentTelemetry.groundSpeed)}
                                </span>
                                <span className="text-[10px] text-neutral-400">KT</span>
                                <span className="hidden sm:inline text-[10px] text-neutral-400 tabular-nums">
                                    ({Math.round(currentTelemetry.indicatedAirspeed)} IAS)
                                </span>
                            </div>

                            <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-400 dark:text-geist-muted font-medium">HDG</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {String(Math.round(currentTelemetry.heading)).padStart(3, "0")}°
                                </span>
                            </div>

                            <div className="hidden sm:block h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-400 dark:text-geist-muted font-medium">VS</span>
                                <span
                                    className={`font-semibold tabular-nums ${
                                        currentTelemetry.verticalSpeed > 50
                                            ? "text-emerald-600 dark:text-geist-success"
                                            : currentTelemetry.verticalSpeed < -50
                                              ? "text-red-600 dark:text-geist-error"
                                              : "text-neutral-700 dark:text-neutral-300"
                                    }`}
                                >
                                    {currentTelemetry.verticalSpeed > 0
                                        ? `+${Math.round(currentTelemetry.verticalSpeed)}`
                                        : Math.round(currentTelemetry.verticalSpeed)}
                                </span>
                                <span className="text-[10px] text-neutral-400">FPM</span>
                            </div>

                            <div className="hidden lg:block h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                            <div className="hidden lg:flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-neutral-400 dark:text-geist-muted font-medium">WIND</span>
                                <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                                    {String(Math.round(currentTelemetry.windDirection ?? 0)).padStart(3, "0")}° /{" "}
                                    {Math.round(currentTelemetry.windSpeed ?? 0)} KT
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Controls: Wake Lock & Theme Toggle */}
                    <div className="flex items-center gap-2 pl-2 shrink-0">
                        {/* Wake Lock Screen On/Off */}
                        <button
                            type="button"
                            onClick={() => {
                                if (isWakeLockActive) {
                                    releaseWakeLock();
                                } else {
                                    requestWakeLock();
                                }
                            }}
                            title={isWakeLockActive ? "Screen Wake Lock Active" : "Enable Screen Wake Lock"}
                            className={`p-1.5 rounded-sm border transition-colors ${
                                isWakeLockActive
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                    : "text-neutral-400 hover:text-neutral-900 dark:hover:text-white border-neutral-200 dark:border-geist-hairline"
                            }`}
                        >
                            {isWakeLockActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>

                        <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline" />

                        {/* Theme Toggle (Sun/Moon matching desktop) */}
                        <button
                            type="button"
                            onClick={toggleTheme}
                            title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
                            className="p-1.5 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors"
                        >
                            {theme === "light" ? (
                                <Moon className="w-3.5 h-3.5" />
                            ) : (
                                <Sun className="w-3.5 h-3.5 text-amber-400" />
                            )}
                        </button>
                    </div>
                </header>

                {/* Viewport content */}
                <main className="flex-1 flex flex-col overflow-hidden">
                    {activeTab === "hud" && <EfbHudView />}
                    {activeTab === "route" && <EfbRouteView />}
                    {activeTab === "ifr" && <EfbIfrView />}
                    {activeTab === "scratchpad" && <EfbScratchpadView />}
                    {activeTab === "checklists" && <EfbChecklistsView />}
                </main>
            </div>
        </div>
    );
};

export default EfbCompanionApp;
