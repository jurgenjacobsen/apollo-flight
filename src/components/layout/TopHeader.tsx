import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFlightStore } from "../../store/flightStore";
import { Tooltip } from "../ui";
import { useSmoothedTelemetry } from "../../hooks/useSmoothedTelemetry";
import { formatAttitude } from "../../utils/flightFormatters";
import {
    Sun,
    Moon,
    Newspaper,
} from "lucide-react";
import { StatusPill } from "../ui";
import { NewsDropdown, getItemKey, ChangelogItem } from "./NewsDropdown";
import rawChangelog from "../../data/changelog.json";

export const TopHeader: React.FC = () => {
    const {
        currentTelemetry: rawTelemetry,
        activeFlight,
        theme,
        toggleTheme,
        availableUpdate,
    } = useFlightStore();
    const currentTelemetry = useSmoothedTelemetry(rawTelemetry);

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
        <header className="relative h-11 bg-white/90 dark:bg-black/90 border-b border-neutral-200 dark:border-geist-hairline px-3 sm:px-4 flex items-center justify-between text-xs font-sans text-neutral-700 dark:text-neutral-200 z-30 flex-shrink-0 select-none transition-colors duration-150 gap-2 backdrop-blur-xs">
            <div className="flex items-center gap-2 min-w-0">
                {/* Real-time telemetry items */}
                <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto text-xs no-scrollbar">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                            ALT
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {currentTelemetry.altitudeMsl.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            FT
                        </span>
                    </div>

                    <div className="h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                            IAS
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {currentTelemetry.indicatedAirspeed}
                        </span>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            KT
                        </span>
                        <span className="hidden md:inline text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                            ({currentTelemetry.trueAirspeed} TAS)
                        </span>
                    </div>

                    <div className="h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                            HDG
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {String(currentTelemetry.heading).padStart(3, "0")}°
                        </span>
                    </div>

                    <div className="hidden sm:block h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                    <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                            VS
                        </span>
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
                                ? `+${currentTelemetry.verticalSpeed}`
                                : currentTelemetry.verticalSpeed}
                        </span>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            FPM
                        </span>
                    </div>

                    <div className="hidden lg:block h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800 shrink-0" />

                    <div className="hidden lg:flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                            ATT
                        </span>
                        <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">
                            {formatAttitude(currentTelemetry.pitch, currentTelemetry.bank, true)}
                        </span>
                    </div>
                </div>
            </div>

            {/* System Status Pill & Theme toggle */}
            <div className="flex items-center gap-2 sm:gap-3 pl-2 shrink-0">
                <StatusPill showRoute />

                <div className="h-3 w-[1px] bg-neutral-200 dark:bg-neutral-800" />
                {/* News & Updates Dropdown */}
                <div className="relative">
                    <Tooltip content="News & Updates">
                        <button
                            ref={newsButtonRef}
                            type="button"
                            onClick={() => setIsNewsOpen((prev) => !prev)}
                            className={`p-1 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer relative ${
                                isNewsOpen
                                    ? "bg-neutral-100 dark:bg-[#1f1f1f] text-neutral-900 dark:text-white"
                                    : ""
                            }`}
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
                    </Tooltip>

                    <NewsDropdown
                        isOpen={isNewsOpen}
                        onClose={() => setIsNewsOpen(false)}
                        triggerRef={newsButtonRef}
                    />
                </div>

                
                {/* Theme Toggle Button */}
                <Tooltip content={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}>
                    <button
                        onClick={toggleTheme}
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
    );
};
