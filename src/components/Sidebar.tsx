import React from 'react';
import { useFlightStore } from '../store/flightStore';
import { StatusPill } from './ui';
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
  Route,
  LifeBuoy,
  Bookmark,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

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
    startManualFlight,
    isSyncingAirports,
    isSidebarCollapsed,
    toggleSidebar,
  } = useFlightStore();

  const navSections: NavSection[] = [
    {
      label: 'Operations',
      items: [
        { id: 'dashboard', label: 'Flight Overview', icon: Activity },
        { id: 'new-route', label: 'New Route', icon: Route },
        { id: 'saved-routes', label: 'Saved Routes', icon: Bookmark },
        { id: 'logbook', label: 'Flight Logbook', icon: BookOpen },
        { id: 'flight-detail', label: 'Telemetry Analysis', icon: Layers },
        { id: 'visited', label: 'Visited Destinations', icon: Globe2 }
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
      label: 'Control',
      items: [
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'feedback', label: 'Help & Feedback', icon: LifeBuoy },
      ]
    }
  ];

  return (
    <aside
      className={`${
        isSidebarCollapsed ? 'w-16' : 'w-64'
      } bg-white dark:bg-geist-surface border-r border-neutral-200 dark:border-geist-hairline flex flex-col justify-between select-none z-20 flex-shrink-0 transition-all duration-200`}
    >
      {/* Brand Header */}
      <div className={`p-4 border-b border-neutral-200 dark:border-geist-hairline ${isSidebarCollapsed ? 'px-2' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <img 
              src="/Icon.svg" 
              alt="Apollo Flight" 
              className="w-8 h-8 object-contain shrink-0"
            />
            {!isSidebarCollapsed && (
              <div className="flex flex-col gap-0 min-w-0">
                <span className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-white truncate">
                  Apollo Flight
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-geist-muted tracking-tight truncate">
                  Flight Sim. Tool
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleSidebar}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* System & Connection Status */}
        <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-geist-hairline">
          {isSidebarCollapsed ? (
            <div className="flex justify-center">
              <StatusPill compact />
            </div>
          ) : (
            <div className="space-y-1.5">
              <StatusPill className="w-full justify-between" />
              {currentTelemetry.simConnected && currentTelemetry.aircraftTitle && currentTelemetry.aircraftTitle !== 'Standby (Waiting for MSFS)' ? (
                <p className="text-[11px] text-neutral-500 dark:text-geist-muted truncate px-0.5" title={currentTelemetry.aircraftTitle}>
                  {currentTelemetry.aircraftTitle}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Nav List */}
      <div className={`flex-1 py-3 ${isSidebarCollapsed ? 'px-1.5' : 'px-2.5'} overflow-y-auto space-y-4`}>
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-2 pb-0 text-[11px] font-medium text-neutral-400 dark:text-geist-muted">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id || (activeView === 'recycle-bin' && item.id === 'logbook');

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id as any)}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={`w-full flex items-center ${
                      isSidebarCollapsed ? 'justify-center px-1' : 'justify-between px-2.5'
                    } py-1.5 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 relative ${
                      isActive
                        ? 'bg-neutral-900 text-white font-medium dark:bg-[#1f1f1f] dark:text-white dark:border dark:border-[#333333]'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-[#121212]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-neutral-400 dark:text-neutral-500'}`} />
                      {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </div>

                    {item.badge !== undefined && item.badge > 0 && (
                      isSidebarCollapsed ? (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                          {item.badge}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Flight Recorder & Hardware Status Footer */}
      <div className={`p-3 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-surface space-y-2.5 ${isSidebarCollapsed ? 'px-2' : ''}`}>
        {activeFlight ? (
          <div className={`bg-red-50 dark:bg-[#140a0a] border border-red-200 dark:border-red-900/60 ${isSidebarCollapsed ? 'p-1.5' : 'p-2.5'} rounded-sm space-y-2`}>
            {!isSidebarCollapsed && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Recording
                </span>
                <span className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300">
                  {activeFlight.departureIcao} ➔ {activeFlight.arrivalIcao}
                </span>
              </div>
            )}
            <button
              onClick={() => endActiveFlight()}
              title={isSidebarCollapsed ? 'Finalize & Log Flight' : undefined}
              className={`w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs ${isSidebarCollapsed ? 'py-2 px-1' : 'py-1.5'} rounded-sm transition-colors duration-150 font-medium`}
            >
              <Square className="w-3 h-3 fill-white" />
              {!isSidebarCollapsed && <span>Finalize & Log</span>}
            </button>
          </div>
        ) : (
          <button
            disabled={isSyncingAirports}
            title={isSidebarCollapsed ? 'Flight Operations' : isSyncingAirports ? 'Dataset update in progress...' : undefined}
            onClick={() => setActiveView('dashboard')}
            className={`w-full flex items-center justify-center gap-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#171717] dark:hover:bg-[#222222] text-neutral-800 dark:text-[#ededed] text-xs ${isSidebarCollapsed ? 'py-2 px-1' : 'py-1.5'} rounded-sm border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 font-medium`}
          >
            <Play className="w-3 h-3 text-emerald-600 dark:text-geist-success fill-emerald-600 dark:fill-geist-success" />
            {!isSidebarCollapsed && <span>{isSyncingAirports ? 'Syncing...' : 'Flight Operations'}</span>}
          </button>
        )}
      </div>
    </aside>
  );
};
