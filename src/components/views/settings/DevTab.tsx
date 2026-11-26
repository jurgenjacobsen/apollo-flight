import React from "react";
import {
    AlertCircle,
    AlertTriangle,
    FileUp,
    Info,
    PlaneLanding,
    Sparkles,
} from "lucide-react";
import { useFlightStore } from "../../../store/flightStore";
import { Checkbox } from "../../ui";

interface DevTabProps {
    onOpenImportModal: () => void;
}

export const DevTab: React.FC<DevTabProps> = ({ onOpenImportModal }) => {
    const {
        setShowOnboarding,
        triggerTouchdownNotification,
        showSystemError,
        devShowTestAircraftOnMap,
        setDevShowTestAircraftOnMap,
    } = useFlightStore();

    const handleTestLandingPopup = async () => {
        await triggerTouchdownNotification(
            {
                timestamp: new Date().toISOString(),
                verticalSpeedFpm: -112,
                indicatedAirspeedKt: 136,
                groundSpeedKt: 132,
                pitchDeg: 4.2,
                bankDeg: 0.8,
                headwindKt: 8,
                crosswindKt: 5,
                latitude: 50.0379,
                longitude: 8.5622,
                altitudeMsl: 364,
                gForce: 1.08,
                gForceSim: 1.08,
                bouncesCount: 0,
                airportIcao: "EDDF",
                airportName: "Frankfurt am Main Airport",
                runwayIdent: "25C",
            },
            true,
        );
    };

    const handleTestSystemModal = (type: "error" | "warning" | "info") => {
        const config = {
            error: {
                title: "Test System Error",
                message:
                    "Simulated critical error modal for verifying layout, contrast, and expandable stack details.",
                details:
                    "Error: SIM_BRIDGE_DISCONNECTED\n  at SimBridge.poll (src/components/bridge/SimBridge.tsx:42:11)\n  at fsuipc_poll_telemetry (src-tauri/src/fsuipc.rs:312:5)",
                actionLabel: "Acknowledge",
            },
            warning: {
                title: "Test System Warning",
                message:
                    "Simulated warning alert for verifying non-blocking caution states and action buttons.",
                details:
                    "Warning: AIRAC cycle mismatch detected (local: 2501, remote: 2502).",
                actionLabel: "Dismiss Warning",
            },
            info: {
                title: "Test System Information",
                message:
                    "Simulated informational modal for verifying notice styling in light and dark themes.",
                details: "Info: Dev mode modal trigger invoked.",
                actionLabel: "Got It",
            },
        }[type];

        showSystemError({
            type,
            title: config.title,
            message: config.message,
            details: config.details,
            actionLabel: config.actionLabel,
            onAction: () => {},
        });
    };

    const buttonClass =
        "px-3.5 py-1.5 text-xs rounded-xs bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-all flex items-center gap-1.5 shadow-xs font-medium";
    const secondaryButtonClass =
        "px-3 py-1.5 text-xs rounded-xs bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-200/70 dark:hover:bg-[#222222] transition-colors flex items-center gap-1.5 font-medium";

    return (
        <div className="space-y-6">
            <div className="border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline bg-white dark:bg-geist-card/30">
                {/* Onboarding Modal */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            First-Run Onboarding Modal
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Opens the welcome onboarding wizard that normally
                            appears only on a fresh installation.
                        </p>
                    </div>
                    <div className="shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowOnboarding(true)}
                            className={buttonClass}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Test Onboarding</span>
                        </button>
                    </div>
                </div>

                {/* Landing Popup / Overlay */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            Landing Popup &amp; In-Sim Overlay
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Triggers a sample touchdown report using your
                            configured display mode, overlay position, and
                            duration.
                        </p>
                    </div>
                    <div className="shrink-0">
                        <button
                            type="button"
                            onClick={handleTestLandingPopup}
                            className={buttonClass}
                        >
                            <PlaneLanding className="w-3.5 h-3.5" />
                            <span>Test Landing Popup</span>
                        </button>
                    </div>
                </div>

                {/* System Error / Alert Modal */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            System Alert &amp; Error Modal
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Triggers the global alert dialog in error, warning,
                            or info mode with expandable diagnostic details.
                        </p>
                    </div>
                    <div className="shrink-0 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleTestSystemModal("error")}
                            className={secondaryButtonClass}
                        >
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Error</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleTestSystemModal("warning")}
                            className={secondaryButtonClass}
                        >
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                            <span>Warning</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleTestSystemModal("info")}
                            className={secondaryButtonClass}
                        >
                            <Info className="w-3.5 h-3.5 text-blue-500" />
                            <span>Info</span>
                        </button>
                    </div>
                </div>

                {/* Overview Map Test Aircraft */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            Overview Map Test Aircraft
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Displays a simulated user aircraft marker at LOWI
                            (47.2602° N, 11.3440° E) on the Overview map when
                            the simulator is disconnected.
                        </p>
                    </div>
                    <div className="shrink-0">
                        <Checkbox
                            checked={devShowTestAircraftOnMap}
                            onChange={setDevShowTestAircraftOnMap}
                            label={devShowTestAircraftOnMap ? "Visible" : "Hidden"}
                        />
                    </div>
                </div>

                {/* Import Bundle Modal */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                            Apollo Bundle Import Modal
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Opens the global bundle import dialog normally
                            triggered by dragging and dropping a `.apollo` or
                            `.json` export file.
                        </p>
                    </div>
                    <div className="shrink-0">
                        <button
                            type="button"
                            onClick={onOpenImportModal}
                            className={secondaryButtonClass}
                        >
                            <FileUp className="w-3.5 h-3.5" />
                            <span>Test Import Modal</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
