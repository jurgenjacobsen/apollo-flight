import React from 'react';
import { useFlightStore } from '../store/flightStore';
import { Gauge, Wind, Compass, ArrowUpRight, Navigation, Radio, Sun, Moon, Menu } from 'lucide-react';

export const TopHeader: React.FC = () => {
  const { currentTelemetry, activeFlight, theme, toggleTheme, isSidebarCollapsed, toggleSidebar } = useFlightStore();

  return (
    <header className="h-11 bg-white dark:bg-geist-surface border-b border-neutral-200 dark:border-geist-hairline px-3 sm:px-4 flex items-center justify-between text-xs font-sans text-neutral-600 dark:text-neutral-300 z-10 flex-shrink-0 select-none transition-colors duration-150 gap-2">
      {/* Sidebar Toggle for Small Screens or Collapsed Mode */}
      <div className="flex items-center gap-2">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-1.5 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors shrink-0"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <Menu className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Real-time telemetry items */}
        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto text-xs no-scrollbar">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-neutral-400 dark:text-geist-muted font-medium">ALT</span>
            <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">{currentTelemetry.altitudeMsl.toLocaleString()}</span>
            <span className="text-[10px] text-neutral-400 dark:text-geist-muted">FT</span>
          </div>

          <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-neutral-400 dark:text-geist-muted font-medium">GS</span>
            <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">{currentTelemetry.groundSpeed}</span>
            <span className="text-[10px] text-neutral-400 dark:text-geist-muted">KT</span>
            <span className="hidden md:inline text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">({currentTelemetry.indicatedAirspeed} IAS)</span>
          </div>

          <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-neutral-400 dark:text-geist-muted font-medium">HDG</span>
            <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">{String(currentTelemetry.heading).padStart(3, '0')}°</span>
          </div>

          <div className="hidden sm:block h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

          <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-neutral-400 dark:text-geist-muted font-medium">VS</span>
            <span className={`font-semibold tabular-nums ${
              currentTelemetry.verticalSpeed > 50 ? 'text-emerald-600 dark:text-geist-success' :
              currentTelemetry.verticalSpeed < -50 ? 'text-red-600 dark:text-geist-error' : 'text-neutral-700 dark:text-neutral-300'
            }`}>
              {currentTelemetry.verticalSpeed > 0 ? `+${currentTelemetry.verticalSpeed}` : currentTelemetry.verticalSpeed}
            </span>
            <span className="text-[10px] text-neutral-400 dark:text-geist-muted">FPM</span>
          </div>

          <div className="hidden lg:block h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline shrink-0" />

          <div className="hidden lg:flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-neutral-400 dark:text-geist-muted font-medium">ATT</span>
            <span className="font-semibold text-neutral-900 dark:text-white tabular-nums">{currentTelemetry.pitch}° / {currentTelemetry.bank}°</span>
          </div>
        </div>
      </div>

      {/* Flight recording status & Connection indicator & Theme toggle */}
      <div className="flex items-center gap-2 sm:gap-3 pl-2 shrink-0">
        {/* FSUIPC Real Connection Badge */}
        {currentTelemetry.simConnected ? (
          <div 
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap shadow-xs" 
            title={`Live MSFS Telemetry: ${currentTelemetry.aircraftTitle}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">MSFS LIVE</span>
            <span className="sm:hidden">LIVE</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 whitespace-nowrap"
            title="Waiting for MSFS and FSUIPC7 to launch"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
            <span className="hidden sm:inline">FSUIPC7 STANDBY</span>
            <span className="sm:hidden">STANDBY</span>
          </div>
        )}

        <div className="hidden sm:block h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline" />

        {activeFlight ? (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300 font-medium whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="tracking-tight">{activeFlight.departureIcao} ➔ {activeFlight.arrivalIcao}</span>
          </div>
        ) : (
          <span className="hidden md:flex text-xs text-neutral-400 dark:text-geist-muted items-center gap-1.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Standby
          </span>
        )}

        <div className="h-3 w-[1px] bg-neutral-200 dark:border-geist-hairline" />

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          className="p-1 rounded-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
          {theme === 'light' ? (
            <Moon className="w-3.5 h-3.5" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>
      </div>
    </header>
  );
};
