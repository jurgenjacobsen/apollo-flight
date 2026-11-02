import React, { useState } from 'react';
import { useFlightStore } from '../store/flightStore';
import { 
  Settings, 
  AppWindow, 
  Sliders, 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  Moon, 
  Sun, 
  PlaneTakeoff, 
  PlaneLanding, 
  Info,
  HardDrive,
  Cpu,
  ArrowUpCircle
} from 'lucide-react';

import packageJson from '../../package.json'; 

export const SettingsView: React.FC = () => {
  const { 
    closeToTray, 
    setCloseToTray, 
    autoStartRecording,
    setAutoStartRecording,
    theme, 
    toggleTheme,
    airportsCount,
    isSyncingAirports,
    syncOurAirports,
    lastSyncMessage
  } = useFlightStore();

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const notifySaved = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleToggleCloseToTray = async () => {
    const newVal = !closeToTray;
    await setCloseToTray(newVal);
    notifySaved();
  };

  const handleToggleAutoStart = () => {
    setAutoStartRecording(!autoStartRecording);
    notifySaved();
  };

  const handleSyncAirports = async () => {
    await syncOurAirports();
    notifySaved();
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateMessage(null);
    try {
      if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update?.available) {
          setUpdateMessage(`Update v${update.version} is available!`);
        } else {
          setUpdateMessage(`Apollo Flight is up to date (v${packageJson.version}).`);
        }
      } else {
        setUpdateMessage('Updater configured for signed release builds.');
      }
    } catch {
      setUpdateMessage(`You are running the latest version (v${packageJson.version}).`);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex items-center justify-between pb-5 border-b border-neutral-200 dark:border-geist-hairline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
              <Settings className="w-5 h-5 text-neutral-700 dark:text-neutral-300" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                Settings & Preferences
              </h1>
              <p className="text-xs text-neutral-500 dark:text-geist-muted">
                Configure system tray behavior, themes, flight recording rules, and datasets.
              </p>
            </div>
          </div>

          {savedSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Preferences updated</span>
            </div>
          )}
        </div>

        {/* Section 1: System Tray & Window Lifecycle */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <AppWindow className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
              System Tray & Window Lifecycle
            </h2>
          </div>

          <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
            {/* Preference: Close to System Tray */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Close to System Tray
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  When enabled, closing the app window minimizes Apollo Flight to the system notification tray area instead of terminating the application. Real-time telemetry monitoring and active flight sessions continue uninterrupted in the background.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={handleToggleCloseToTray}
                  role="switch"
                  aria-checked={closeToTray}
                  aria-label="Toggle close to system tray"
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                    closeToTray ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-300 dark:bg-[#333333]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                      closeToTray ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Preference: Interface Theme */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Interface Theme
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Toggle between high-contrast dark cockpit styling and clean daylight canvas theme for optimal legibility across varying ambient lighting environments.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <div className="inline-flex items-center p-0.5 rounded-sm bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline">
                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== 'light') {
                        toggleTheme();
                        notifySaved();
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-medium transition-colors ${
                      theme === 'light'
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (theme !== 'dark') {
                        toggleTheme();
                        notifySaved();
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs text-xs font-medium transition-colors ${
                      theme === 'dark'
                        ? 'bg-neutral-900 text-white dark:bg-[#333333] shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-blue-400" />
                    <span>Dark</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <hr className="border-neutral-200 dark:border-geist-hairline" />

        {/* Section 2: Flight Recording Lifecycle Rules */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
              Flight Recording Lifecycle Rules
            </h2>
          </div>

          <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
            {/* Preference: Auto-Start on Telemetry Triggers */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Auto-Start on Telemetry Triggers
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Automatically initializes and records a new flight session when aircraft ground speed exceeds 20 kt or engine combustion is detected in MSFS. If disabled, flights are only logged when started manually.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={handleToggleAutoStart}
                  role="switch"
                  aria-checked={autoStartRecording}
                  aria-label="Toggle auto-start recording"
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                    autoStartRecording ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-300 dark:bg-[#333333]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                      autoStartRecording ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Preference: Flight Start Conditions */}
            <div className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${autoStartRecording ? "" : "opacity-50"}`}>
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <PlaneTakeoff className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Flight Start Conditions
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Monitors aircraft ground speed exceeding <span className="font-mono text-neutral-800 dark:text-neutral-200 font-medium">20 kt</span> or engine combustion offsets (<code className="font-mono text-[11px]">0x0894</code> / <code className="font-mono text-[11px]">0x092C</code>) polled via FSUIPC7. Manual initiation via &ldquo;Start Flight Session&rdquo; is always available.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                  &gt; 20 kt Groundspeed
                </span>
              </div>
            </div>

            {/* Preference: Flight Stop Conditions */}
            <div className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${autoStartRecording ? "" : "opacity-50"}`}>
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <PlaneLanding className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Flight Stop & Safeguard Conditions
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Auto-started flights finalize when the aircraft remains stationary on the ground for 30 consecutive seconds with one or more engines shut down. Flights started manually are protected and present a confirmation prompt upon landing rather than auto-terminating.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                  Stationary 30s + Cut
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <hr className="border-neutral-200 dark:border-geist-hairline" />

        {/* Section 3: Database & Aerodrome Datasets */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
              Database & Aerodrome Datasets
            </h2>
          </div>

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
                  Synchronize official global airport, runway, and sovereign territory datasets from OurAirports for zero-latency offline flight resolution and visited countries calculations.
                </p>
                {lastSyncMessage && (
                  <p className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-black/50 p-2 rounded-sm border border-neutral-200 dark:border-geist-hairline mt-2">
                    {lastSyncMessage}
                  </p>
                )}
              </div>

              <div className="shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={handleSyncAirports}
                  disabled={isSyncingAirports}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAirports ? 'animate-spin' : ''}`} />
                  <span>{isSyncingAirports ? 'Syncing Dataset...' : 'Sync Dataset'}</span>
                </button>
              </div>
            </div>

            {/* Preference: Database Engine & WAL Mode */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    SQLite Database Engine
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Persistent local embedded database storage file storing flight records, high-frequency GPS coordinate breadcrumbs, and visited country history with ACID safety.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                  aerotrack.db
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
                  Total count of worldwide airports, civil landing strips, military bases, and helipads currently indexed in local storage for spatial radius querying.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                  {airportsCount.toLocaleString()} Aerodromes
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <hr className="border-neutral-200 dark:border-geist-hairline" />

        {/* Section 4: About Apollo Flight */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
              About Apollo Flight
            </h2>
          </div>

          <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
            {/* Preference: Application Version */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <img src="/Icon.svg" alt="Apollo Flight" className="w-4 h-4 object-contain shrink-0" />
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Application Version
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Modern flight tracking, telemetry analysis, and IFR companion for Microsoft Flight Simulator 2020 & 2024. Featuring synchronized telemetry scrubbing and multi-touchdown analysis.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white tabular-nums">
                  v{packageJson.version}
                </span>
              </div>
            </div>

            {/* Preference: Software Updates */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Software Updates
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Check for newer releases from our Github repository.
                </p>
                {updateMessage && (
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-black/50 py-1 px-2 rounded-sm border border-neutral-200 dark:border-geist-hairline mt-2 animate-fade-in">
                    {updateMessage}
                  </p>
                )}
              </div>

              <div className="shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                </button>
              </div>
            </div>

            {/* Preference: Author & License */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Author & Maintainer
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Designed, developed, and maintained by Jürgen Jacobsen. Licensed under the MIT open-source license.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                  MIT License
                </span>
              </div>
            </div>

            {/* Preference: Platform & Interface Architecture */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                  <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                    Runtime Architecture
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                  Low-latency desktop integration with Microsoft Flight Simulator communicating via FSUIPC7.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                  Tauri v2
                </span>
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                  FSUIPC7
                </span>
                <span className="px-2.5 py-1 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline text-neutral-900 dark:text-white">
                  React 19
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
