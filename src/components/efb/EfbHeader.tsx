import React from "react";
import { useEfbStore } from "../../store/efbStore";
import { useFlightStore } from "../../store/flightStore";
import { EfbTab, EfbTheme } from "../../types/efb";
import {
    Compass,
    Plane,
    Radio,
    ClipboardEdit,
    ListChecks,
    SunMoon,
    Eye,
    EyeOff,
    Wifi,
    WifiOff,
} from "lucide-react";

interface EfbHeaderProps {
    onOpenSettings?: () => void;
    previewMode?: boolean;
}

export const EfbHeader: React.FC<EfbHeaderProps> = ({ previewMode = false }) => {
    const {
        activeTab,
        setActiveTab,
        theme,
        toggleTheme,
        isWakeLockActive,
        requestWakeLock,
        releaseWakeLock,
        isWsConnected,
    } = useEfbStore();

    const telemetry = useFlightStore((s) => s.currentTelemetry);
    const isSimConnected = telemetry?.simConnected ?? false;

    const tabs: { id: EfbTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { id: "hud", label: "HUD & Map", icon: Compass },
        { id: "route", label: "OFP / Route", icon: Plane },
        { id: "ifr", label: "IFR Repeater", icon: Radio },
        { id: "scratchpad", label: "Scratchpad", icon: ClipboardEdit },
        { id: "checklists", label: "Checklists", icon: ListChecks },
    ];

    const getThemeColors = () => {
        if (theme === "night-red") {
            return "bg-black border-red-950 text-red-500";
        }
        if (theme === "night-amber") {
            return "bg-black border-amber-950 text-amber-500";
        }
        return "bg-neutral-900 border-neutral-800 text-neutral-100";
    };

    const getActiveTabStyle = (tabId: EfbTab) => {
        const isActive = activeTab === tabId;
        if (theme === "night-red") {
            return isActive
                ? "bg-red-950/60 text-red-400 border-red-800/80 shadow-sm"
                : "text-red-700 hover:text-red-400 hover:bg-red-950/30";
        }
        if (theme === "night-amber") {
            return isActive
                ? "bg-amber-950/60 text-amber-400 border-amber-800/80 shadow-sm"
                : "text-amber-700 hover:text-amber-400 hover:bg-amber-950/30";
        }
        return isActive
            ? "bg-white text-black dark:bg-white dark:text-black font-semibold shadow-sm"
            : "text-neutral-400 hover:text-white hover:bg-neutral-800/70";
    };

    return (
        <header
            className={`flex flex-col md:flex-row items-center justify-between px-3 py-2 border-b select-none transition-colors duration-200 ${getThemeColors()}`}
        >
            {/* Top row: Brand & Status indicators */}
            <div className="flex items-center justify-between w-full md:w-auto gap-3">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold tracking-tight text-sm uppercase">
                        Apollo <span className="font-light opacity-80">EFB</span>
                    </span>
                    {previewMode && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            PREVIEW
                        </span>
                    )}
                </div>

                {/* Status Chips */}
                <div className="flex items-center gap-1.5 text-xs font-mono">
                    {/* Sim connection chip */}
                    <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                            isSimConnected
                                ? "bg-emerald-950/50 text-emerald-400 border-emerald-800/60"
                                : "bg-neutral-800/60 text-neutral-400 border-neutral-700/60"
                        }`}
                    >
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${
                                isSimConnected ? "bg-emerald-400" : "bg-neutral-500"
                            }`}
                        />
                        {isSimConnected ? "MSFS LIVE" : "DISCONNECTED"}
                    </span>

                    {/* WebSocket Sync chip (for mobile browsers) */}
                    <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                            isWsConnected
                                ? "bg-blue-950/50 text-blue-400 border-blue-800/60"
                                : "bg-amber-950/40 text-amber-400 border-amber-800/50"
                        }`}
                    >
                        {isWsConnected ? (
                            <Wifi className="w-3 h-3" />
                        ) : (
                            <WifiOff className="w-3 h-3" />
                        )}
                        <span className="hidden sm:inline">
                            {isWsConnected ? "SYNCED" : "RECONNECTING"}
                        </span>
                    </span>
                </div>
            </div>

            {/* Middle row / center: Navigation tabs */}
            <nav className="flex items-center gap-1 overflow-x-auto w-full md:w-auto py-1 md:py-0 scrollbar-none">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border border-transparent ${getActiveTabStyle(
                                tab.id,
                            )}`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* Right row: Theme & Wake Lock Controls */}
            <div className="flex items-center gap-1.5 w-full md:w-auto justify-end pt-1 md:pt-0">
                {/* Screen Wake Lock Toggle */}
                <button
                    onClick={() => {
                        if (isWakeLockActive) {
                            releaseWakeLock();
                        } else {
                            requestWakeLock();
                        }
                    }}
                    title={
                        isWakeLockActive
                            ? "Screen Wake Lock Active (Screen will not sleep)"
                            : "Enable Screen Wake Lock"
                    }
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono border transition-all ${
                        isWakeLockActive
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:text-white"
                    }`}
                >
                    {isWakeLockActive ? (
                        <>
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-[10px] hidden sm:inline">AWAKE</span>
                        </>
                    ) : (
                        <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span className="text-[10px] hidden sm:inline">SLEEP OK</span>
                        </>
                    )}
                </button>

                {/* Theme Cycle Toggle */}
                <button
                    onClick={toggleTheme}
                    title={`Theme: ${theme.toUpperCase()} (Tap to toggle Night Red/Amber)`}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono border bg-neutral-800/50 text-neutral-300 border-neutral-700 hover:text-white transition-all"
                >
                    <SunMoon className="w-3.5 h-3.5" />
                    <span className="text-[10px] uppercase font-bold">
                        {theme === "night-red"
                            ? "RED"
                            : theme === "night-amber"
                              ? "AMB"
                              : "DARK"}
                    </span>
                </button>
            </div>
        </header>
    );
};
