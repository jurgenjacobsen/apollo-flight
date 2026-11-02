import React, { useEffect } from 'react';
import { useFlightStore } from '../store/flightStore';

export const SimBridge: React.FC = () => {
  const { 
    updateTelemetry, 
    initFromDatabase, 
    startManualFlight, 
    endActiveFlight,
    currentTelemetry,
    activeFlight,
    closeToTray,
    setCloseToTray
  } = useFlightStore();

  // Load flights and visited stats from embedded SQLite database on launch
  useEffect(() => {
    initFromDatabase();
  }, [initFromDatabase]);

  // Sync close-to-tray setting with Tauri backend on launch
  useEffect(() => {
    async function syncTraySetting() {
      if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('set_close_to_tray', { enabled: closeToTray });
        } catch (err) {
          console.warn('[SimBridge] Failed to set initial close-to-tray:', err);
        }
      }
    }
    syncTraySetting();
  }, [closeToTray]);

  // Listen to live FSUIPC7 telemetry and system tray events from Tauri Rust backend
  useEffect(() => {
    let unlistenTelemetry: (() => void) | undefined;
    let unlistenStartRec: (() => void) | undefined;
    let unlistenStopRec: (() => void) | undefined;

    async function setupTauriListeners() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        
        // 1. Live FSUIPC telemetry stream
        unlistenTelemetry = await listen('fsuipc-telemetry', (event: any) => {
          if (event?.payload) {
            updateTelemetry(event.payload);
          }
        });

        // 2. System tray: Start flight recording
        unlistenStartRec = await listen('tray-start-recording', () => {
          const state = useFlightStore.getState();
          if (!state.activeFlight) {
            const depIcao = state.nearestAirport?.icao || 'LOWI';
            const aircraft = state.currentTelemetry.aircraftTitle !== 'Standby (Waiting for MSFS)' 
              ? state.currentTelemetry.aircraftTitle 
              : 'MSFS Aircraft';
            state.startManualFlight(depIcao, 'TBD', aircraft);
          }
        });

        // 3. System tray: Stop flight recording
        unlistenStopRec = await listen('tray-stop-recording', () => {
          const state = useFlightStore.getState();
          if (state.activeFlight) {
            state.endActiveFlight();
          }
        });

        console.log('[SimBridge] Tauri IPC listeners registered.');
      } catch (err) {
        console.warn('[SimBridge] Failed to register Tauri IPC listeners:', err);
      }
    }

    setupTauriListeners();

    return () => {
      if (unlistenTelemetry) unlistenTelemetry();
      if (unlistenStartRec) unlistenStartRec();
      if (unlistenStopRec) unlistenStopRec();
    };
  }, [updateTelemetry, startManualFlight, endActiveFlight]);

  return null;
};
