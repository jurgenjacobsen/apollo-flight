import React from 'react';
import { useFlightStore } from '../store/flightStore';
import { 
  Plane, 
  Activity, 
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
  Route
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { 
    currentTelemetry, 
    activeView, 
    setActiveView, 
    activeFlight,
    endActiveFlight,
    startManualFlight
  } = useFlightStore();

  const navSections = [
    {
      label: 'Operations',
      items: [
        { id: 'dashboard', label: 'Flight Overview', icon: Activity },
        { id: 'new-route', label: 'New Route', icon: Route },
        { id: 'logbook', label: 'Flight Logbook', icon: BookOpen },
        { id: 'flight-detail', label: 'Telemetry Analysis', icon: Layers },
        { id: 'visited', label: 'Visited Destinations', icon: Globe2 },
      ]
    },
    {
      label: 'Procedural Trainer',
      items: [
        { id: 'ifr-trainer', label: 'VOR / NDB Intercept', icon: Compass },
        { id: 'hold-trainer', label: 'Holding Pattern Trainer', icon: RotateCw },
      ]
    },
    {
      label: 'Configuration',
      items: [
        { id: 'settings', label: 'Settings', icon: Settings },
      ]
    }
  ];

  return (
    <aside className="w-64 bg-white dark:bg-geist-surface border-r border-neutral-200 dark:border-geist-hairline flex flex-col justify-between select-none z-20 flex-shrink-0 transition-colors duration-150">
      {/* Brand Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-geist-hairline">
        <div className="flex items-center gap-2">
          <img 
            src="/Icon.svg" 
            alt="Apollo Flight" 
            className="w-9 h-9 object-contain shrink-0"
          />
          <div className='flex flex-col gap-0'>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-white">Apollo Flight</span>
            </div>
            <span className="text-[11px] text-neutral-500 dark:text-geist-muted tracking-tight">
              Flight Sim. Tool
            </span>
          </div>
        </div>

        {/* Real FSUIPC Connection Indicator */}
        <div className="mt-3.5 pt-3 border-t border-neutral-200 dark:border-geist-hairline">
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-sm text-xs bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${currentTelemetry.simConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
              <span className="text-neutral-700 dark:text-[#d4d4d4] font-medium text-xs">
                {currentTelemetry.simConnected ? 'MSFS Connected' : 'Waiting for MSFS'}
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
              FSUIPC7
            </span>
          </div>

          <p className="text-xs text-neutral-500 dark:text-geist-muted truncate mt-2 px-0.5" title={currentTelemetry.aircraftTitle}>
            {currentTelemetry.aircraftTitle || 'Awaiting simulator connection...'}
          </p>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 py-3 px-2.5 overflow-y-auto space-y-4">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            <div className="px-2 pb-1 text-[11px] font-medium text-neutral-400 dark:text-geist-muted">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id as any)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                      isActive
                        ? 'bg-neutral-900 text-white font-medium dark:bg-[#1f1f1f] dark:text-white dark:border dark:border-[#333333]'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-[#121212]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-neutral-400 dark:text-neutral-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Flight Recorder & Hardware Status Footer */}
      <div className="p-3 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-surface space-y-2.5">
        {activeFlight ? (
          <div className="bg-red-50 dark:bg-[#140a0a] border border-red-200 dark:border-red-900/60 p-2.5 rounded-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Recording Active
              </span>
              <span className="text-xs text-neutral-700 dark:text-neutral-300">
                {activeFlight.departureIcao} ➔ {activeFlight.arrivalIcao}
              </span>
            </div>
            <button
              onClick={() => endActiveFlight()}
              className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs py-1.5 rounded-sm transition-colors duration-150 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
            >
              <Square className="w-3 h-3 fill-white" />
              <span>Finalize & Log Flight</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setActiveView('dashboard')}
            className="w-full flex items-center justify-center gap-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#171717] dark:hover:bg-[#222222] text-neutral-800 dark:text-[#ededed] text-xs py-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
          >
            <Play className="w-3 h-3 text-emerald-600 dark:text-geist-success fill-emerald-600 dark:fill-geist-success" />
            <span>Flight Operations</span>
          </button>
        )}
      </div>
    </aside>
  );
};
