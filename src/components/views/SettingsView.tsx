import React, { useState } from "react";
import { useFlightStore } from "../../store/flightStore";
import {
    Settings,
    AppWindow,
    Sliders,
    Database,
    CheckCircle2,
    Info,
    Archive,
    Tablet,
    BookOpen,
} from "lucide-react";

import packageJson from "../../../package.json";
import { ImportModal } from "../modals/ImportModal";

import { GeneralUnitsTab } from "./settings/GeneralUnitsTab";
import { RecordingRulesTab } from "./settings/RecordingRulesTab";
import { DispatchNavdataTab } from "./settings/DispatchNavdataTab";
import { EfbCompanionTab } from "./settings/EfbCompanionTab";
import { DocumentationTab } from "./settings/DocumentationTab";
import { BackupExportTab } from "./settings/BackupExportTab";
import { AboutTab } from "./settings/AboutTab";

const SETTINGS_SECTIONS = [
    {
        id: "settings-window",
        label: "General & Measurement Units",
        shortLabel: "General & Units",
        description: "Window lifecycle, dark theme, and measurement units",
        icon: AppWindow,
    },
    {
        id: "settings-recording",
        label: "Flight Recording Lifecycle Rules",
        shortLabel: "Recording Rules",
        description: "Automated flight detection, engine start, and telemetry frequency",
        icon: Sliders,
    },
    {
        id: "settings-database",
        label: "Database & Aerodrome Datasets",
        shortLabel: "Datasets & Airports",
        description: "Global airport cache, runway databases, and OurAirports sync",
        icon: Database,
    },
    {
        id: "settings-efb",
        label: "EFB Companion & Remote Cockpit",
        shortLabel: "EFB Companion",
        description: "Local web server, port configuration, and mobile QR pairing",
        icon: Tablet,
    },
    {
        id: "settings-documentation",
        label: "Documentation Options",
        shortLabel: "Documentation",
        description: "Custom document directories and real-time filesystem sync",
        icon: BookOpen,
    },
    {
        id: "settings-data",
        label: "Data Management, Backup & Export",
        shortLabel: "Backup & Export",
        description: "Apollo JSON bundles, table pagination, and recycle bin",
        icon: Archive,
    },
    {
        id: "settings-about",
        label: "About Apollo Flight",
        shortLabel: "About & Runtime",
        description: "Version details, runtime environment, updates, and credits",
        icon: Info,
    },
];

export const SettingsView: React.FC = () => {
    const {
        settingsActiveTab,
        setSettingsActiveTab,
    } = useFlightStore();

    const [savedSuccess, setSavedSuccess] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    const notifySaved = () => {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
    };

    const activeSection = settingsActiveTab || "settings-window";
    const setActiveSection = (id: string) => setSettingsActiveTab(id);

    const activeSectionObj =
        SETTINGS_SECTIONS.find((s) => s.id === activeSection) ||
        SETTINGS_SECTIONS[0];
    const ActiveSectionIcon = activeSectionObj.icon;

    return (
        <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans overflow-hidden select-none">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                        <Settings className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                            Settings & Preferences
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Configure system tray behavior, themes, flight recording rules, and datasets
                        </p>
                    </div>
                </div>

                {savedSuccess && (
                    <div className="px-3 py-1.5 rounded-sm text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 animate-fade-in flex items-center gap-1.5 font-medium shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Preferences updated</span>
                    </div>
                )}
            </div>

            {/* Split Master-Detail Layout */}
            <div className="flex-1 flex min-h-0 border border-neutral-200 dark:border-geist-hairline rounded-sm overflow-hidden bg-white dark:bg-geist-surface shadow-xs">
                {/* Left Sub-Sidebar */}
                <div className="w-64 sm:w-72 md:w-80 border-r border-neutral-200 dark:border-geist-hairline flex flex-col bg-neutral-50/60 dark:bg-[#0c0c0c] shrink-0">
                    <div className="px-3 py-2 border-b border-neutral-200 dark:border-geist-hairline select-none">
                        <span className="text-xs font-medium uppercase text-neutral-400 dark:text-neutral-500 px-1">
                            Configuration Sections
                        </span>
                    </div>

                    <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                        {SETTINGS_SECTIONS.map((sec) => {
                            const Icon = sec.icon;
                            const isActive = activeSection === sec.id;
                            return (
                                <button
                                    key={sec.id}
                                    type="button"
                                    onClick={() => setActiveSection(sec.id)}
                                    className={`w-full flex items-start gap-3 p-2.5 rounded-sm text-left transition-colors cursor-pointer select-none ${
                                        isActive
                                            ? "bg-white dark:bg-geist-surface text-neutral-900 dark:text-white shadow-xs border border-neutral-200/80 dark:border-geist-hairline font-medium"
                                            : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100/70 dark:hover:bg-[#161616] border border-transparent"
                                    }`}
                                >
                                    <div
                                        className={`p-1.5 rounded-sm mt-0.5 shrink-0 ${
                                            isActive
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                : "bg-neutral-200/60 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium truncate">
                                            {sec.shortLabel}
                                        </div>
                                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 line-clamp-1 mt-0.5 leading-snug">
                                            {sec.description}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Right Section Content Pane */}
                <div className="flex-1 min-w-0 overflow-y-auto p-5 sm:p-6 md:p-8 bg-white dark:bg-geist-surface select-text">
                    <div className="max-w-4xl space-y-6">
                        {/* Active Section Tab Header */}
                        <div className="flex items-center gap-3 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                            <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-neutral-700 dark:text-neutral-300">
                                <ActiveSectionIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                                    {activeSectionObj.label}
                                </h2>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                                    {activeSectionObj.description}
                                </p>
                            </div>
                        </div>

                        {/* Section Tab Views */}
                        {activeSection === "settings-window" && (
                            <GeneralUnitsTab notifySaved={notifySaved} />
                        )}

                        {activeSection === "settings-recording" && (
                            <RecordingRulesTab notifySaved={notifySaved} />
                        )}

                        {activeSection === "settings-database" && (
                            <DispatchNavdataTab notifySaved={notifySaved} />
                        )}

                        {activeSection === "settings-efb" && (
                            <EfbCompanionTab notifySaved={notifySaved} />
                        )}

                        {activeSection === "settings-documentation" && (
                            <DocumentationTab notifySaved={notifySaved} />
                        )}

                        {activeSection === "settings-data" && (
                            <BackupExportTab onOpenImportModal={() => setIsImportModalOpen(true)} />
                        )}

                        {activeSection === "settings-about" && (
                            <AboutTab notifySaved={notifySaved} />
                        )}
                    </div>
                </div>
            </div>

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
            />
        </div>
    );
};
