import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFlightStore } from "../../store/flightStore";
import {
    Gauge,
    Wind,
    Compass,
    ArrowUpRight,
    Navigation,
    Radio,
    Sun,
    Moon,
    Menu,
    Newspaper,
} from "lucide-react";
import { StatusPill } from "../ui";
import { NewsDropdown, getItemKey, ChangelogItem } from "./NewsDropdown";
import rawChangelog from "../../data/changelog.json";

export const TopHeader: React.FC = () => {
    const {
        currentTelemetry,
        activeFlight,
        theme,
        toggleTheme,
        isSidebarCollapsed,
        toggleSidebar,
        availableUpdate,
    } = useFlightStore();

    const [isNewsOpen, setIsNewsOpen] = useState(false);
    const newsButtonRef = useRef<HTMLButtonElement>(null);
    const [hasUnreadNews, setHasUnreadNews] = useState(false);

    const checkUnread = useCallback(() => {
        if (availableUpdate) {
            setHasUnreadNews(true);
            return;
        }
        try {
            const raw = localStorage.getItem("apollo_changelog_read_ids");
            const readSet = raw ? new Set(JSON.parse(raw)) : new Set();
            const changelog = (rawChangelog as ChangelogItem[]) || [];
            const hasUnread = changelog.some(
                (item, idx) => !readSet.has(getItemKey(item, idx)),
            );
            setHasUnreadNews(hasUnread);
        } catch {
            setHasUnreadNews(false);
        }
    }, [availableUpdate]);

    useEffect(() => {
        checkUnread();
    }, [checkUnread, isNewsOpen]);

    return (
        <header className="h-11 bg-white dark:bg-geist-surface border-b border-neutral-200 dark:border-geist-hairline px-3 sm:px-4 flex items-center justify-between text-xs font-sans text-neutral-600 dark:text-neutral-300 z-10 flex-shrink-0 select-none transition-colors duration-150 gap-2">
            {/* Sidebar Toggle for Small Screens or Collapsed Mode */}
            <div className="flex items-center gap-2">
                {isSidebarCollapsed && (
                    <button
                        type="button"
                        onClick={toggleSidebar}
                        className="p-1.5 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors shrink-0"
                        title="Expand sidebar"
                        aria-label="Expand sidebar"
                    >
                        <Menu className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Real-time telemetry items */}
                <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto text-xs no-scrollbar">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-400 dark:text-geist-muted font-medium">
                            ALT
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {currentTelemetry.altitudeMsl.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted">
                            FT
                        </span>
                    </div>

                    <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-400 dark:text-geist-muted font-medium">
                            GS
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {currentTelemetry.groundSpeed}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted">
                            KT
                        </span>
                        <span className="hidden md:inline text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                            ({currentTelemetry.indicatedAirspeed} IAS)
                        </span>
                    </div>

                    <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-400 dark:text-geist-muted font-medium">
                            HDG
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {String(currentTelemetry.heading).padStart(3, "0")}°
                        </span>
                    </div>

                    <div className="hidden sm:block h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                    <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-400 dark:text-geist-muted font-medium">
                            VS
                        </span>
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
                                ? `+${currentTelemetry.verticalSpeed}`
                                : currentTelemetry.verticalSpeed}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-geist-muted">
                            FPM
                        </span>
                    </div>

                    <div className="hidden lg:block h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

                    <div className="hidden lg:flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-400 dark:text-geist-muted font-medium">
                            ATT
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {currentTelemetry.pitch}° / {currentTelemetry.bank}°
                        </span>
                    </div>
                </div>
            </div>

            {/* System Status Pill & Theme toggle */}
            <div className="flex items-center gap-2 sm:gap-3 pl-2 shrink-0">
                <StatusPill showRoute />

                <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline" />
                {/* News & Updates Dropdown */}
                <div className="relative">
                    <button
                        ref={newsButtonRef}
                        type="button"
                        onClick={() => setIsNewsOpen((prev) => !prev)}
                        className={`p-1 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer relative ${
                            isNewsOpen
                                ? "bg-neutral-100 dark:bg-[#1f1f1f] text-neutral-900 dark:text-white"
                                : ""
                        }`}
                        title="News & Updates"
                        aria-label="News and updates"
                        aria-expanded={isNewsOpen}
                    >
                        <Newspaper className="w-3.5 h-3.5" />
                        {hasUnreadNews && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500" />
                            </span>
                        )}
                    </button>

                    <NewsDropdown
                        isOpen={isNewsOpen}
                        onClose={() => setIsNewsOpen(false)}
                        triggerRef={newsButtonRef}
                    />
                </div>

                
                {/* Theme Toggle Button */}
                <button
                    onClick={toggleTheme}
                    title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
                    className="p-1 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                >
                    {theme === "light" ? (
                        <Moon className="w-3.5 h-3.5" />
                    ) : (
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                    )}
                </button>
            </div>
        </header>
    );
};
