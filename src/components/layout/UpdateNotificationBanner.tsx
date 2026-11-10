import React, { useState } from "react";
import { useFlightStore } from "../../store/flightStore";
import {
    Sparkles,
    Download,
    RefreshCw,
    X,
    ChevronDown,
    ChevronUp,
    ExternalLink,
} from "lucide-react";

export const UpdateNotificationBanner: React.FC = () => {
    const {
        availableUpdate,
        updateDismissed,
        dismissUpdate,
        isInstallingUpdate,
        downloadProgress,
        installUpdate,
        setActiveView,
    } = useFlightStore();

    const [isExpanded, setIsExpanded] = useState(false);

    if (!availableUpdate || updateDismissed) {
        return null;
    }

    return (
        <div className="bg-neutral-900 text-white dark:bg-[#141414] dark:text-neutral-100 border-b border-neutral-800 dark:border-geist-hairline px-4 py-2.5 shadow-md z-30 transition-all select-none animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Left side: Icon, message & version tags */}
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                    </div>

                    <div className="flex items-center flex-wrap gap-2 text-xs truncate">
                        <span className="font-semibold text-white">
                            Apollo Flight v{availableUpdate.version}
                        </span>
                        <span className="text-neutral-400">
                            is now available.
                        </span>

                        {availableUpdate.body && (
                            <button
                                type="button"
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white underline underline-offset-2 transition-colors ml-1"
                            >
                                <span>
                                    {isExpanded
                                        ? "Hide release notes"
                                        : "What's new"}
                                </span>
                                {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                ) : (
                                    <ChevronDown className="w-3 h-3" />
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Right side: Action buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {isInstallingUpdate ? (
                        <div className="flex items-center gap-2 bg-neutral-800 dark:bg-[#202020] px-3 py-1 rounded-sm text-xs font-medium text-emerald-400">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>
                                {downloadProgress !== null
                                    ? `Downloading ${downloadProgress}%...`
                                    : "Installing update..."}
                            </span>
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={installUpdate}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>Update & Restart</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveView("settings")}
                                title="View update options in Settings"
                                className="px-2.5 py-1 rounded-sm text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 dark:hover:bg-[#222222] transition-colors"
                            >
                                Settings
                            </button>

                            <button
                                type="button"
                                onClick={dismissUpdate}
                                title="Dismiss update notice for this session"
                                aria-label="Dismiss update notification"
                                className="p-1 rounded-sm text-neutral-400 hover:text-white hover:bg-neutral-800 dark:hover:bg-[#222222] transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Download progress bar */}
            {isInstallingUpdate && downloadProgress !== null && (
                <div className="w-full bg-neutral-800 dark:bg-[#222222] rounded-full h-1 overflow-hidden mt-2">
                    <div
                        className="bg-emerald-500 h-1 transition-all duration-150 ease-out"
                        style={{ width: `${downloadProgress}%` }}
                    />
                </div>
            )}

            {/* Expandable Release Notes */}
            {isExpanded && availableUpdate.body && (
                <div className="mt-2.5 pt-2.5 border-t border-neutral-800 dark:border-geist-hairline text-xs text-neutral-300 dark:text-neutral-400 max-h-48 overflow-y-auto leading-relaxed whitespace-pre-line bg-black/30 p-2.5 rounded-sm font-mono text-[11px]">
                    {availableUpdate.body}
                </div>
            )}
        </div>
    );
};
