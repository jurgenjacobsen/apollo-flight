import React from "react";
import { useFlightStore } from "../../../store/flightStore";
import { LIVE_TRAFFIC_NETWORK_OPTIONS } from "../../../types/traffic";
import { Sun, Moon } from "lucide-react";

interface GeneralUnitsTabProps {
    notifySaved: () => void;
}

export const GeneralUnitsTab: React.FC<GeneralUnitsTabProps> = ({ notifySaved }) => {
    const {
        closeToTray,
        setCloseToTray,
        pageSize,
        setPageSize,
        theme,
        setTheme,
        liveTrafficNetwork,
        setLiveTrafficNetwork,
    } = useFlightStore();

    const handleToggleCloseToTray = async () => {
        const newVal = !closeToTray;
        await setCloseToTray(newVal);
        notifySaved();
    };

    return (
        <div className="space-y-4">
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

                {/* Preference: Live Air Traffic Feed */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Live Air Traffic Network
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Select an online ATC network public JSON feed
                            (VATSIM, IVAO, or PilotEdge) for live traffic
                            ingestion, or disable network traffic.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                            {LIVE_TRAFFIC_NETWORK_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={async () => {
                                        await setLiveTrafficNetwork(opt.value);
                                        notifySaved();
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
                                        liveTrafficNetwork === opt.value
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
