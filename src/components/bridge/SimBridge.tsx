import React, { useEffect } from "react";
import { useFlightStore } from "../../store/flightStore";

export const SimBridge: React.FC = () => {
    const {
        updateTelemetry,
        initFromDatabase,
        startManualFlight,
        endActiveFlight,
        currentTelemetry,
        activeFlight,
        closeToTray,
        setCloseToTray,
    } = useFlightStore();

    // Load flights and visited stats from embedded SQLite database on launch
    useEffect(() => {
        initFromDatabase();
    }, [initFromDatabase]);

    // Check for software updates automatically on app startup if enabled
    useEffect(() => {
        const timer = setTimeout(async () => {
            const state = useFlightStore.getState();
            if (state.autoCheckUpdates) {
                try {
                    await state.checkForUpdates(true); // silent check
                } catch (err) {
                    console.warn(
                        "[SimBridge] Startup update check failed:",
                        err,
                    );
                }
            }
        }, 2500);

        return () => clearTimeout(timer);
    }, []);

    // Sync close-to-tray setting with Tauri backend on launch
    useEffect(() => {
        async function syncTraySetting() {
            if (
                typeof window !== "undefined" &&
                ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
            ) {
                try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("set_close_to_tray", { enabled: closeToTray });
                } catch (err) {
                    console.warn(
                        "[SimBridge] Failed to set initial close-to-tray:",
                        err,
                    );
                }
            }
        }
        syncTraySetting();
    }, [closeToTray]);

    // Track previous sim connected state to alert user when active flight telemetry drops
    const wasConnectedRef = React.useRef(false);

    // Listen to live FSUIPC7 telemetry and system tray events from Tauri Rust backend
    useEffect(() => {
        let cancelled = false;
        let unlistenTelemetry: (() => void) | undefined;
        let unlistenStartRec: (() => void) | undefined;
        let unlistenStopRec: (() => void) | undefined;

        async function setupTauriListeners() {
            try {
                const { listen } = await import("@tauri-apps/api/event");
                if (cancelled) return;

                // 1. Live FSUIPC telemetry stream
                const u1 = await listen(
                    "fsuipc-telemetry",
                    (event: any) => {
                        if (event?.payload) {
                            const pkt = event.payload;
                            const state = useFlightStore.getState();

                            // Trigger dedicated modal alert if connection drops while recording a flight
                            if (wasConnectedRef.current && !pkt.simConnected && state.activeFlight) {
                                state.showSystemError({
                                    title: "Simulator Connection Lost",
                                    message: "The live telemetry link to Microsoft Flight Simulator was interrupted while a flight was recording. Logbook recording has paused.",
                                    details: "FSUIPC7 bridge returned disconnected status (0x3364). Please check that MSFS and FSUIPC7 are still active.",
                                    type: "warning",
                                });
                            }
                            wasConnectedRef.current = Boolean(pkt.simConnected);
                            updateTelemetry(pkt);
                        }
                    },
                );
                if (cancelled) {
                    u1();
                    return;
                }
                unlistenTelemetry = u1;

                // 2. System tray: Start flight recording
                const u2 = await listen("tray-start-recording", () => {
                    const state = useFlightStore.getState();
                    if (!state.activeFlight) {
                        const depIcao = state.nearestAirport?.icao || "LOWI";
                        const aircraft =
                            state.currentTelemetry.aircraftTitle !==
                            "Standby (Waiting for MSFS)"
                                ? state.currentTelemetry.aircraftTitle
                                : "MSFS Aircraft";
                        state.startManualFlight(depIcao, "TBD", aircraft);
                    }
                });
                if (cancelled) {
                    u2();
                    return;
                }
                unlistenStartRec = u2;

                // 3. System tray: Stop flight recording
                const u3 = await listen("tray-stop-recording", () => {
                    const state = useFlightStore.getState();
                    if (state.activeFlight) {
                        state.endActiveFlight();
                    }
                });
                if (cancelled) {
                    u3();
                    return;
                }
                unlistenStopRec = u3;

                console.log("[SimBridge] Tauri IPC listeners registered.");
            } catch (err) {
                console.warn(
                    "[SimBridge] Failed to register Tauri IPC listeners:",
                    err,
                );
            }
        }

        setupTauriListeners();

        return () => {
            cancelled = true;
            if (unlistenTelemetry) unlistenTelemetry();
            if (unlistenStartRec) unlistenStartRec();
            if (unlistenStopRec) unlistenStopRec();
        };
    }, [updateTelemetry, startManualFlight, endActiveFlight]);

    return null;
};
