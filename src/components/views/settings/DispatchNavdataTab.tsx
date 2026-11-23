import React from "react";
import { useFlightStore } from "../../../store/flightStore";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface DispatchNavdataTabProps {
    notifySaved: () => void;
}

export const DispatchNavdataTab: React.FC<DispatchNavdataTabProps> = ({ notifySaved }) => {
    const {
        airportsCount,
        isSyncingAirports,
        syncProgress,
        activeFlight,
        syncOurAirports,
        lastSyncMessage,
    } = useFlightStore();

    const handleSyncAirports = async () => {
        await syncOurAirports();
        notifySaved();
    };

    return (
        <div className="space-y-4">
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
        </div>
    );
};
