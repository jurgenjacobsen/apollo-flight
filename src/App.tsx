import React from 'react';
import { useFlightStore } from './store/flightStore';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DashboardView } from './components/DashboardView';
import { NewRouteView } from './components/NewRouteView';
import { LogbookView } from './components/LogbookView';
import { FlightDetailView } from './components/FlightDetailView';
import { VisitedWorldView } from './components/VisitedWorldView';
import { IfrTrainer } from './components/IfrTrainer';
import { HoldTrainer } from './components/HoldTrainer';
import { SettingsView } from './components/SettingsView';
import { SimBridge } from './components/SimBridge';
import { Radio, Cpu, Database, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const { 
    activeView, 
    currentTelemetry, 
    activeFlight, 
    airportsCount, 
    isSyncingAirports, 
    syncOurAirports,
    lastSyncMessage 
  } = useFlightStore();

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
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'new-route' && <NewRouteView />}
          {activeView === 'logbook' && <LogbookView />}
          {activeView === 'flight-detail' && <FlightDetailView />}
          {activeView === 'visited' && <VisitedWorldView />}
          {activeView === 'ifr-trainer' && <IfrTrainer />}
          {activeView === 'hold-trainer' && <HoldTrainer />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};

export default App;

