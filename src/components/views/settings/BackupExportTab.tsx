import React, { useState, useEffect, useRef } from "react";
import { useFlightStore } from "../../../store/flightStore";
import { Checkbox, Tooltip } from "../../ui";
import {
    Download,
    ChevronDown,
    BookOpen,
    Route,
    Sliders,
    Upload,
    Trash2,
} from "lucide-react";

interface BackupExportTabProps {
    onOpenImportModal: () => void;
}

export const BackupExportTab: React.FC<BackupExportTabProps> = ({ onOpenImportModal }) => {
    const { exportDataBundle, setActiveView } = useFlightStore();

    const [includeTelemetryExport, setIncludeTelemetryExport] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
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

    return (
        <div className="space-y-4">
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
                                        setIsExportMenuOpen(!isExportMenuOpen)
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
                            onClick={onOpenImportModal}
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
        </div>
    );
};
