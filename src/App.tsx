import React, { useEffect } from "react";
import { useFlightStore } from "./store/flightStore";
import { Sidebar } from "./components/layout/Sidebar";
import { TopHeader } from "./components/layout/TopHeader";
import { DashboardView } from "./components/views/DashboardView";
import { NewRouteView } from "./components/views/NewRouteView";
import { SavedRoutesView } from "./components/views/SavedRoutesView";
import { LogbookView } from "./components/views/LogbookView";
import { FlightDetailView } from "./components/views/FlightDetailView";
import {
    VisitedWorldView,
    preloadCountriesGeoJson,
} from "./components/views/VisitedWorldView";
import { IfrTrainer } from "./components/views/IfrTrainer";
import { HoldTrainer } from "./components/views/HoldTrainer";
import { SettingsView } from "./components/views/SettingsView";
import { FeedbackView } from "./components/views/FeedbackView";
import { RecycleBinView } from "./components/views/RecycleBinView";
import { EfbCompanionApp } from "./components/efb/EfbCompanionApp";
import { isEfbMode } from "./services/efbService";
import { useEfbStore } from "./store/efbStore";
import { ImportModal } from "./components/modals/ImportModal";
import { SimBridge } from "./components/bridge/SimBridge";
import { safeInvoke } from "./store/flightStore";
import { ApolloExportBundle } from "./types/flight";

export const App: React.FC = () => {
    const theme = useFlightStore((s) => s.theme);
    const {
        activeView,
        currentTelemetry,
        activeFlight,
        airportsCount,
        isSyncingAirports,
        syncOurAirports,
        lastSyncMessage,
    } = useFlightStore();

    const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
    const [droppedBundle, setDroppedBundle] =
        React.useState<ApolloExportBundle | null>(null);

    useEffect(() => {
        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
        };
        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                if (
                    file.name.endsWith(".json") ||
                    file.name.endsWith(".apollo")
                ) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const text = ev.target?.result as string;
                            const parsed = JSON.parse(text);
                            if (
                                parsed &&
                                parsed.format === "apollo-flight-bundle"
                            ) {
                                setDroppedBundle(parsed);
                                setIsImportModalOpen(true);
                            }
                        } catch {}
                    };
                    reader.readAsText(file);
                }
            }
        };

        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("drop", handleDrop);
        return () => {
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("drop", handleDrop);
        };
    }, []);

    // Keep <html> dark class strictly in sync with theme state across all sessions and restarts
    useEffect(() => {
        if (typeof document !== "undefined") {
            if (theme === "dark") {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    }, [theme]);

    useEffect(() => {
        // Silently preheat the GeoJSON country borders in the background during idle time
        // so switching to 'Visited Destinations' has zero network latency
        const timer = setTimeout(() => {
            preloadCountriesGeoJson();
        }, 1200);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        // Global client runtime error forwarding to persistent log files in /log directory
        const handleWindowError = (event: ErrorEvent) => {
            safeInvoke("log_client_message", {
                level: "error",
                message: event.message || "Window Error",
                context: `${event.filename || "unknown"}:${event.lineno || 0}:${event.colno || 0}`,
            });
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            safeInvoke("log_client_message", {
                level: "error",
                message: String(event.reason || "Unhandled Promise Rejection"),
                context: "UnhandledPromiseRejection",
            });
        };

        window.addEventListener("error", handleWindowError);
        window.addEventListener("unhandledrejection", handleUnhandledRejection);

        return () => {
            window.removeEventListener("error", handleWindowError);
            window.removeEventListener(
                "unhandledrejection",
                handleUnhandledRejection,
            );
        };
    }, []);

    const currentGeneratedRoute = useFlightStore((s) => s.currentGeneratedRoute);
    const { autoStartEfb, serverMode, startServer, syncRoute } = useEfbStore();

    useEffect(() => {
        if (!isEfbMode() && (autoStartEfb || serverMode === "auto")) {
            startServer();
        }
    }, [autoStartEfb, serverMode, startServer]);

    useEffect(() => {
        if (!isEfbMode()) {
            syncRoute(currentGeneratedRoute);
        }
    }, [currentGeneratedRoute, syncRoute]);

    if (isEfbMode()) {
        return <EfbCompanionApp />;
    }

    return (
        <div className="flex h-screen w-screen bg-neutral-50 dark:bg-black text-neutral-900 dark:text-[#ededed] overflow-hidden font-sans selection:bg-neutral-200 dark:selection:bg-[#333333] transition-colors duration-150">
            {/* Background Sim Telemetry loop / FSUIPC bridge & Tray Event Bus */}
            <SimBridge />

            {/* Persistent Sidebar Navigation */}
            <Sidebar />

            {/* Main View Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-50 dark:bg-black">
                {/* Real-time Telemetry Ribbon with Theme Toggle */}
                <TopHeader />

                {/* Dynamic Viewports */}
                <main className="flex-1 flex flex-col overflow-hidden">
                    {activeView === "dashboard" && <DashboardView />}
                    {activeView === "new-route" && <NewRouteView />}
                    {activeView === "saved-routes" && <SavedRoutesView />}
                    {activeView === "logbook" && <LogbookView />}
                    {activeView === "flight-detail" && <FlightDetailView />}
                    {activeView === "visited" && <VisitedWorldView />}
                    {activeView === "ifr-trainer" && <IfrTrainer />}
                    {activeView === "hold-trainer" && <HoldTrainer />}
                    {activeView === "settings" && <SettingsView />}
                    {activeView === "feedback" && <FeedbackView />}
                    {activeView === "recycle-bin" && <RecycleBinView />}
                </main>
            </div>

            {/* Global Import Modal (opened via drag & drop or user actions) */}
            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => {
                    setIsImportModalOpen(false);
                    setDroppedBundle(null);
                }}
                initialBundle={droppedBundle}
            />
        </div>
    );
};

export default App;
