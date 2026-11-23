import React from "react";
import { useFlightStore } from "../../../store/flightStore";
import packageJson from "../../../../package.json";
import { RefreshCw, Download } from "lucide-react";

interface AboutTabProps {
    notifySaved: () => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({ notifySaved }) => {
    const {
        autoCheckUpdates,
        setAutoCheckUpdates,
        availableUpdate,
        isCheckingUpdate,
        isInstallingUpdate,
        downloadProgress,
        updateMessage,
        checkForUpdates,
        installUpdate,
    } = useFlightStore();

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
        <div className="space-y-4">
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                {/* Preference: Application Version */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
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
                            {packageJson.version}
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
        </div>
    );
};
