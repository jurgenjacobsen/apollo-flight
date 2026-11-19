import React from "react";
import { useFlightStore } from "../../store/flightStore";
import { StatusPill, Tooltip } from "../ui";
import {
    House,
    BookOpen,
    Layers,
    Globe2,
    Compass,
    RotateCw,
    Play,
    Square,
    Radio,
    HardDrive,
    Settings,
    Route,
    LifeBuoy,
    Bookmark,
    ListChecks,
    FileText,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";

interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
}

interface NavSection {
    label: string;
    items: NavItem[];
}

export const Sidebar: React.FC = () => {
    const {
        currentTelemetry,
        activeView,
        setActiveView,
        activeFlight,
        endActiveFlight,
        isSidebarCollapsed,
        toggleSidebar,
    } = useFlightStore();

    const navSections: NavSection[] = [
        {
            label: "Operations",
            items: [
                { id: "dashboard", label: "Overview", icon: House },
                { id: "new-route", label: "New Route", icon: Route },
                { id: "saved-routes", label: "Saved Routes", icon: Bookmark },
                { id: "checklists", label: "Checklists", icon: ListChecks },
                { id: "documentation", label: "Documentation", icon: FileText },
                { id: "logbook", label: "Flight Logbook", icon: BookOpen },
                {
                    id: "flight-detail",
                    label: "Telemetry Analysis",
                    icon: Layers,
                },
                { id: "visited", label: "Visited Destinations", icon: Globe2 },
            ],
        },
        {
            label: "Procedures",
            items: [
                {
                    id: "ifr-trainer",
                    label: "VOR / NDB",
                    icon: Compass,
                },
                {
                    id: "hold-trainer",
                    label: "Holding Trainer",
                    icon: RotateCw,
                },
            ],
        },
        {
            label: "Control",
            items: [
                { id: "settings", label: "Settings", icon: Settings },
                { id: "feedback", label: "Help & Feedback", icon: LifeBuoy },
            ],
        },
    ];

    return (
        <aside
            className={`${
                isSidebarCollapsed ? "w-16" : "w-64"
            } bg-white dark:bg-geist-surface border-r border-neutral-200 dark:border-geist-hairline flex flex-col justify-between select-none z-20 flex-shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden`}
        >
            {/* Brand Header */}
            <div className="py-3.5 px-3 border-b border-neutral-200 dark:border-geist-hairline overflow-hidden transition-all duration-300">
                <div className="flex items-center gap-2.5 w-full">
                    <Tooltip
                        content="Apollo Flight — Overview"
                        placement="right"
                        disabled={!isSidebarCollapsed}
                    >
                        <button
                            type="button"
                            onClick={() => setActiveView("dashboard")}
                            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-[#181818] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer"
                        >
                            <img
                                src="/Icon.svg"
                                alt="Apollo Flight"
                                className="w-7 h-7 object-contain shrink-0"
                            />
                        </button>
                    </Tooltip>
                    <div
                        className={`flex flex-col min-w-0 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                            isSidebarCollapsed
                                ? "max-w-0 opacity-0 -translate-x-3 pointer-events-none"
                                : "max-w-[150px] opacity-100 translate-x-0"
                        }`}
                    >
                        <span className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-white truncate">
                            Apollo Flight
                        </span>
                        <span className="text-[10px] text-neutral-500 dark:text-geist-muted tracking-tight truncate">
                            Flight Sim. Tool
                        </span>
                    </div>
                </div>

                {/* System & Connection Status */}
                <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-geist-hairline overflow-hidden">
                    <div className="relative min-h-[26px] flex items-center justify-center">
                        {/* Expanded Status Pill & Telemetry Text */}
                        <div
                            className={`w-full transition-all duration-200 ease-in-out ${
                                isSidebarCollapsed
                                    ? "opacity-0 pointer-events-none absolute -translate-x-2"
                                    : "opacity-100 translate-x-0"
                            }`}
                        >
                            <StatusPill className="w-full justify-between" />
                            {currentTelemetry.simConnected &&
                                !currentTelemetry.isInMenu &&
                                currentTelemetry.aircraftTitle &&
                                currentTelemetry.aircraftTitle !==
                                    "Standby (Waiting for MSFS)" &&
                                currentTelemetry.aircraftTitle !==
                                    "MSFS Main Menu / Loading" && (
                                    <p
                                        className="text-[11px] text-neutral-500 dark:text-geist-muted truncate px-0.5 mt-1"
                                        title={currentTelemetry.aircraftTitle}
                                    >
                                        {currentTelemetry.aircraftTitle}
                                    </p>
                                )}
                        </div>

                        {/* Collapsed Compact Pill */}
                        <div
                            className={`transition-all duration-200 ease-in-out ${
                                isSidebarCollapsed
                                    ? "opacity-100 scale-100"
                                    : "opacity-0 pointer-events-none absolute scale-90"
                            }`}
                        >
                            <StatusPill compact />
                        </div>
                    </div>
                </div>
            </div>

            {/* Nav List */}
            <div className="flex-1 py-3 px-2.5 overflow-y-auto overflow-x-hidden space-y-3">
                {navSections.map((section, idx) => (
                    <div key={section.label} className="space-y-1">
                        {/* Section Label & Collapsed Hairline Divider */}
                        <div>
                            <div
                                className={`px-2 pb-0.5 text-[11px] font-medium text-neutral-400 dark:text-geist-muted whitespace-nowrap transition-all duration-200 ease-in-out overflow-hidden ${
                                    isSidebarCollapsed
                                        ? "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
                                        : "max-h-6 opacity-100 translate-y-0"
                                }`}
                            >
                                {section.label}
                            </div>
                            {idx > 0 && (
                                <div
                                    className={`transition-all duration-200 ease-in-out ${
                                        isSidebarCollapsed
                                            ? "my-1.5 mx-auto w-5 h-[1px] bg-neutral-200 dark:bg-[#262626] opacity-100"
                                            : "max-h-0 opacity-0 pointer-events-none"
                                    }`}
                                />
                            )}
                        </div>

                        <div className="space-y-0.5">
                            {section.items.map((item) => {
                                const Icon = item.icon;
                                const isActive =
                                    activeView === item.id ||
                                    (activeView === "recycle-bin" &&
                                        item.id === "logbook");

                                return (
                                    <Tooltip
                                        key={item.id}
                                        content={item.label}
                                        placement="right"
                                        disabled={!isSidebarCollapsed}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setActiveView(item.id as any)
                                            }
                                            className={`w-full h-9 flex items-center rounded-md transition-all duration-200 ease-in-out relative group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                                                isSidebarCollapsed
                                                    ? "px-0 justify-center"
                                                    : "px-2.5 justify-start gap-2.5"
                                            } ${
                                                isActive
                                                    ? "bg-neutral-900 text-white font-medium dark:bg-[#1f1f1f] dark:text-white dark:border dark:border-[#383838] shadow-xs"
                                                    : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-[#151515]"
                                            }`}
                                        >
                                            {/* Icon Container */}
                                            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                                <Icon
                                                    className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                                                        isActive
                                                            ? "text-white"
                                                            : "text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white"
                                                    }`}
                                                />
                                            </div>

                                            {/* Label (Smooth width & opacity collapse) */}
                                            <span
                                                className={`text-xs truncate transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] whitespace-nowrap overflow-hidden ${
                                                    isSidebarCollapsed
                                                        ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                                                        : "max-w-[150px] opacity-100 translate-x-0"
                                                }`}
                                            >
                                                {item.label}
                                            </span>

                                            {/* Badge */}
                                            {item.badge !== undefined &&
                                                item.badge > 0 && (
                                                    <span
                                                        className={`transition-all duration-200 ease-in-out ${
                                                            isSidebarCollapsed
                                                                ? "absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-geist-surface"
                                                                : "ml-auto text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                                                        }`}
                                                    >
                                                        {!isSidebarCollapsed &&
                                                            item.badge}
                                                    </span>
                                                )}
                                        </button>
                                    </Tooltip>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Sidebar Collapse Action & Flight Recorder */}
            <div className="p-2.5 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-surface space-y-2 overflow-hidden transition-all duration-300">
                {activeFlight && (
                    <div className="bg-red-50 dark:bg-[#140a0a] border border-red-200 dark:border-red-900/60 rounded-md p-2 overflow-hidden transition-all duration-200">
                        <div
                            className={`flex items-center justify-between mb-1.5 overflow-hidden transition-all duration-200 ${
                                isSidebarCollapsed
                                    ? "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
                                    : "max-h-6 opacity-100 translate-y-0"
                            }`}
                        >
                            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                Recording
                            </span>
                            <span className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300 truncate">
                                {activeFlight.departureIcao} ➔{" "}
                                {activeFlight.arrivalIcao}
                            </span>
                        </div>

                        <Tooltip
                            content="Finalize & Log Flight"
                            placement="right"
                            disabled={!isSidebarCollapsed}
                        >
                            <button
                                type="button"
                                onClick={() => endActiveFlight()}
                            title={
                                isSidebarCollapsed
                                    ? `Recording: ${activeFlight.departureIcao} ➔ ${activeFlight.arrivalIcao} (Click to Finalize)`
                                    : undefined
                            }
                            className={`w-full h-8 flex items-center justify-center bg-red-600 hover:bg-red-500 text-white text-xs rounded-md transition-colors duration-150 font-medium cursor-pointer shadow-xs ${
                                isSidebarCollapsed ? "gap-0" : "gap-1.5"
                            }`}
                        >
                            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                <Square className="w-3.5 h-3.5 fill-white shrink-0" />
                            </div>
                            <span
                                className={`whitespace-nowrap overflow-hidden transition-all duration-200 ${
                                    isSidebarCollapsed
                                        ? "max-w-0 opacity-0 pointer-events-none"
                                        : "max-w-[120px] opacity-100"
                                }`}
                            >
                                Finalize & Log
                            </span>
                        </button>
                    </Tooltip>
                    </div>
                )}

                <Tooltip
                    content={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    placement={isSidebarCollapsed ? "right" : "top"}
                >
                    <button
                        type="button"
                        onClick={toggleSidebar}
                        className={`w-full h-9 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 dark:bg-[#171717] dark:hover:bg-[#222222] text-neutral-800 dark:text-[#ededed] text-xs rounded-md border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 font-medium cursor-pointer ${
                            isSidebarCollapsed ? "gap-0" : "gap-2"
                        }`}
                    >
                        <div
                            className={`w-5 h-5 shrink-0 flex items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                                isSidebarCollapsed ? "rotate-180" : "rotate-0"
                            }`}
                        >
                            <ChevronLeft className="w-4 h-4 shrink-0" />
                        </div>
                        <span
                            className={`whitespace-nowrap overflow-hidden transition-all duration-200 ease-in-out ${
                                isSidebarCollapsed
                                    ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                                    : "max-w-[140px] opacity-100 translate-x-0"
                            }`}
                        >
                            Collapse Sidebar
                        </span>
                    </button>
                </Tooltip>
            </div>
        </aside>
    );
};
