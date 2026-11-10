import React from "react";
import { useFlightStore } from "../../store/flightStore";

export type SystemOperationalStatus =
    "disconnected" | "in_menu" | "recording" | "connected";

export interface StatusInfo {
    status: SystemOperationalStatus;
    label: string;
    dotColor: string;
    badgeClasses: string;
    tooltip: string;
}

export function getSystemStatus(
    simConnected: boolean,
    isInMenu?: boolean,
    isRecording?: boolean,
): StatusInfo {
    if (!simConnected) {
        return {
            status: "disconnected",
            label: "Disconnected",
            dotColor: "bg-neutral-400 dark:bg-neutral-500",
            badgeClasses:
                "bg-neutral-100 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400",
            tooltip: "Simulator Disconnected (Waiting for MSFS)",
        };
    }

    if (isRecording) {
        return {
            status: "recording",
            label: "Recording",
            dotColor: "bg-red-500",
            badgeClasses:
                "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 shadow-xs",
            tooltip: "Flight Recording Active",
        };
    }

    if (isInMenu) {
        return {
            status: "in_menu",
            label: "In Menu",
            dotColor: "bg-amber-500",
            badgeClasses:
                "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 shadow-xs",
            tooltip: "Simulator Connected (Main Menu)",
        };
    }

    return {
        status: "connected",
        label: "Connected",
        dotColor: "bg-emerald-500",
        badgeClasses:
            "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 shadow-xs",
        tooltip: "Simulator Connected & Ready",
    };
}

export interface StatusPillProps {
    /** Optional class name overrides */
    className?: string;
    /** Compact icon-only dot version (e.g. collapsed sidebar) */
    compact?: boolean;
    /** Whether to append route details if actively recording */
    showRoute?: boolean;
}

/**
 * Universal one/two-word status pill used across the header and sidebar.
 * Clearly displays the connection and operation state:
 * - "Disconnected" (neutral gray)
 * - "Connected" (emerald green)
 * - "In Menu" (amber yellow)
 * - "Recording" (animated red pulse)
 */
export const StatusPill: React.FC<StatusPillProps> = ({
    className = "",
    compact = false,
    showRoute = false,
}) => {
    const { currentTelemetry, activeFlight } = useFlightStore();
    const info = getSystemStatus(
        Boolean(currentTelemetry.simConnected),
        Boolean(currentTelemetry.isInMenu),
        Boolean(activeFlight),
    );

    const tooltip = activeFlight
        ? `Flight Recording: ${activeFlight.departureIcao} ➔ ${activeFlight.arrivalIcao} (${currentTelemetry.aircraftTitle || "Active"})`
        : currentTelemetry.aircraftTitle &&
            currentTelemetry.aircraftTitle !== "Standby (Waiting for MSFS)"
          ? `${info.tooltip} • ${currentTelemetry.aircraftTitle}`
          : info.tooltip;

    if (compact) {
        return (
            <div
                className={`flex items-center justify-center p-1.5 rounded-sm border ${info.badgeClasses} ${className}`}
                title={tooltip}
            >
                <span className={`w-2 h-2 rounded-full ${info.dotColor}`} />
            </div>
        );
    }

    return (
        <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-xs font-medium whitespace-nowrap select-none transition-colors duration-150 ${info.badgeClasses} ${className}`}
            title={tooltip}
        >
            <div className="flex items-center gap-1.5">
                <span
                    className={`w-1.5 h-1.5 rounded-full ${info.dotColor} shrink-0`}
                />
                <span>{info.label}</span>
            </div>
            {showRoute && activeFlight && (
                <span className="font-mono text-[11px] font-semibold text-red-600 dark:text-red-400 ml-1">
                    {activeFlight.departureIcao} ➔ {activeFlight.arrivalIcao}
                </span>
            )}
        </div>
    );
};
