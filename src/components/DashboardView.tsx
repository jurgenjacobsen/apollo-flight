import React, { useState, useEffect } from 'react';
import { useFlightStore, formatFlightDuration } from '../store/flightStore';
import { 
  Compass, 
  Gauge, 
  MapPin, 
  ArrowUpRight, 
  PlaneTakeoff, 
  Play, 
  Square, 
  Navigation,
  Wind,
  Radio,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Milestone
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { 
    currentTelemetry, 
    activeFlight, 
    flightStage,
    startManualFlight, 
    endActiveFlight,
    showEndFlightPrompt,
    setShowEndFlightPrompt,
    detectedMultiSectorRoute,
    nearestAirport,
    fetchNearestAirport,
    autoStartRecording,
    setAutoStartRecording,
  } = useFlightStore();

  const [depIcao, setDepIcao] = useState('');
  const [arrIcao, setArrIcao] = useState('');
  const [aircraftName, setAircraftName] = useState('');

  useEffect(() => {
    if (currentTelemetry.latitude !== 0 || currentTelemetry.longitude !== 0) {
      fetchNearestAirport(currentTelemetry.latitude, currentTelemetry.longitude);
    }
  }, [currentTelemetry.latitude, currentTelemetry.longitude, fetchNearestAirport]);

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'TAKEOFF_CLIMB':
        return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40';
      case 'ENROUTE_CRUISE':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40';
      case 'DESCENT_APPROACH':
        return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40';
      case 'TOUCHDOWN_ROLLOUT':
        return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40';
      case 'ARRIVED':
        return 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700';
      default:
        return 'text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
      
      {/* Flight End / Multi-Sector Continuation Prompt (Phase 9.1 & Item 4 Safeguard) */}
      {showEndFlightPrompt && (
        <div className="bg-amber-50 dark:bg-[#1f170a] border border-amber-300 dark:border-amber-700/60 p-4 rounded-sm animate-fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 mt-0.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {detectedMultiSectorRoute 
                    ? `Multi-Sector Route: ${detectedMultiSectorRoute.route.name}`
                    : 'Finish Flight Recording?'}
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                  {detectedMultiSectorRoute ? (
                    <>
                      The aircraft is parked at <strong>{detectedMultiSectorRoute.currentAirportIcao}</strong> with engines shut down.
                      We think you might be executing saved route <strong>"{detectedMultiSectorRoute.route.name}"</strong> ({detectedMultiSectorRoute.route.departureIcao} ➔ {detectedMultiSectorRoute.route.arrivalIcao}).
                      {detectedMultiSectorRoute.nextSectorArrivalIcao && (
                        <span> Next planned destination: <strong>{detectedMultiSectorRoute.nextSectorArrivalIcao}</strong>.</span>
                      )}
                      {' '}Would you like to keep recording for the next sector, or finish and save this flight now?
                    </>
                  ) : (
                    'The aircraft has been stationary for over 30 seconds with engines shut down. Since this flight was started manually, would you like to finish recording and log this flight?'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={() => setShowEndFlightPrompt(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-sm text-neutral-700 dark:text-neutral-300 hover:bg-amber-100/60 dark:hover:bg-[#2c210e] border border-neutral-300 dark:border-neutral-700 transition-colors"
              >
                {detectedMultiSectorRoute ? 'Keep Recording (Next Sector)' : 'Keep Recording'}
              </button>
              <button
                onClick={() => endActiveFlight()}
                className="px-3.5 py-1.5 text-xs font-medium rounded-sm bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Finish & Save Flight</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <span>Altitude MSL</span>
            <Gauge className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
            {currentTelemetry.simConnected ? currentTelemetry.altitudeMsl.toLocaleString() : '--'}{' '}
            <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted">
              {currentTelemetry.simConnected ? 'ft' : ''}
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1">
            {currentTelemetry.simConnected ? `AGL ${currentTelemetry.altitudeAgl} ft` : 'No Sim Connection'}
          </div>
        </div>

        <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <span>Ground Speed</span>
            <Wind className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
            {currentTelemetry.simConnected ? currentTelemetry.groundSpeed : '--'}{' '}
            <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted">
              {currentTelemetry.simConnected ? 'kt' : ''}
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1">
            {currentTelemetry.simConnected
              ? `IAS ${currentTelemetry.indicatedAirspeed} · TAS ${currentTelemetry.trueAirspeed}`
              : 'Standby'}
          </div>
        </div>

        <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <span>Magnetic Heading</span>
            <Compass className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
            {currentTelemetry.simConnected ? `${String(currentTelemetry.heading).padStart(3, '0')}°` : '--'}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1">
            {currentTelemetry.simConnected ? (
              currentTelemetry.heading >= 315 || currentTelemetry.heading < 45 ? 'North' :
              currentTelemetry.heading >= 45 && currentTelemetry.heading < 135 ? 'East' :
              currentTelemetry.heading >= 135 && currentTelemetry.heading < 225 ? 'South' : 'West'
            ) : 'Standby'}
          </div>
        </div>

        <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <span>Vertical Speed</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className={`text-2xl font-semibold tabular-nums tracking-tight ${
            !currentTelemetry.simConnected ? 'text-neutral-900 dark:text-white' :
            currentTelemetry.verticalSpeed > 100 ? 'text-emerald-600 dark:text-geist-success' :
            currentTelemetry.verticalSpeed < -100 ? 'text-red-600 dark:text-geist-error' : 'text-neutral-900 dark:text-white'
          }`}>
            {currentTelemetry.simConnected
              ? (currentTelemetry.verticalSpeed > 0 ? `+${currentTelemetry.verticalSpeed}` : currentTelemetry.verticalSpeed)
              : '--'}
            <span className="text-xs font-normal text-neutral-500 dark:text-geist-muted ml-1">
              {currentTelemetry.simConnected ? 'fpm' : ''}
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1">
            {currentTelemetry.simConnected ? (currentTelemetry.isOnGround ? 'On Runway / Surface' : 'Airborne') : 'Standby'}
          </div>
        </div>

        <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <span>Attitude & Engine</span>
            <Navigation className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className="text-2xl font-semibold text-neutral-900 dark:text-white tabular-nums tracking-tight">
            {currentTelemetry.simConnected ? `${currentTelemetry.pitch}° / ${currentTelemetry.bank}°` : '-- / --'}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${currentTelemetry.simConnected && currentTelemetry.isEngineRunning ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
            <span>
              {currentTelemetry.simConnected
                ? (currentTelemetry.isEngineRunning ? 'Engines Running' : 'Engines Off')
                : 'Sim Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <span>Flight Stage</span>
            <Activity className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className="text-sm font-semibold tracking-tight uppercase truncate">
            <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[11px] border font-mono ${getStageColor(flightStage)}`}>
              {flightStage.replace('_', ' ')}
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-geist-muted mt-1">
            7-Stage Lifecycle
          </div>
        </div>
      </div>

      {/* Main Section: Clean Flight Overview (PFD removed) & Flight Lifecycle Controller */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Left Column (lg:col-span-2): Active Telemetry & Nav Status Deck */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Live Flight & Navigation Overview Card */}
          <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-geist-hairline">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${currentTelemetry.simConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  Flight Telemetry & Navigation Deck
                </h2>
              </div>
              <span className="text-[11px] text-neutral-500 dark:text-geist-muted tabular-nums">
                {currentTelemetry.simConnected
                  ? `LAT ${currentTelemetry.latitude.toFixed(4)}° · LON ${currentTelemetry.longitude.toFixed(4)}°`
                  : 'STANDBY · NO SIM SIGNAL'}
              </span>
            </div>

            {/* Live Navigation & Radio State */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] mb-1">
                  <span>NAV1 Radial / OBS</span>
                  <Radio className="w-3.5 h-3.5 text-neutral-400" />
                </div>
                <div className="text-lg font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                  {String(currentTelemetry.nav1Obs).padStart(3, '0')}°
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-geist-muted mt-0.5">
                  Relative: {currentTelemetry.nav1RelativeBearing.toFixed(1)}°
                </div>
              </div>

              <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] mb-1">
                  <span>NAV1 DME Station</span>
                  <Milestone className="w-3.5 h-3.5 text-neutral-400" />
                </div>
                <div className="text-lg font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                  {currentTelemetry.nav1DmeDistance > 0 ? `${currentTelemetry.nav1DmeDistance.toFixed(1)} NM` : 'NO SIGNAL'}
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-geist-muted mt-0.5">
                  DME Speed: {currentTelemetry.nav1DmeSpeed} kt
                </div>
              </div>

              <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center justify-between text-neutral-500 dark:text-geist-muted text-[11px] mb-1">
                  <span>ADF1 Relative</span>
                  <Compass className="w-3.5 h-3.5 text-neutral-400" />
                </div>
                <div className="text-lg font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                  {currentTelemetry.adf1RelativeBearing !== 0 ? `${currentTelemetry.adf1RelativeBearing.toFixed(1)}°` : 'INACTIVE'}
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-geist-muted mt-0.5">
                  NDB Bearing Needle
                </div>
              </div>
            </div>

            {/* Operational Flight Path Details */}
            <div className="p-3.5 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {activeFlight ? `${activeFlight.departureIcao} ➔ ${activeFlight.arrivalIcao}` : 'Standby / Preflight'}
                </span>
                <span className="text-[11px] font-mono text-neutral-500 dark:text-geist-muted">
                  {currentTelemetry.aircraftTitle}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-neutral-200 dark:border-geist-hairline text-xs">
                <div>
                  <span className="text-[10px] text-neutral-500 dark:text-geist-muted block">Duration</span>
                  <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                    {activeFlight ? formatFlightDuration(activeFlight.flightTimeSeconds) : '--'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 dark:text-geist-muted block">Distance Flown</span>
                  <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                    {activeFlight ? `${activeFlight.distanceFlownNm.toFixed(1)} NM` : '--'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 dark:text-geist-muted block">Max Altitude</span>
                  <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                    {activeFlight ? `${activeFlight.maxAltitude.toLocaleString()} ft` : '--'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 dark:text-geist-muted block">Peak Groundspeed</span>
                  <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                    {activeFlight ? `${activeFlight.maxGroundSpeed} kt` : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Nearest Aerodrome Information Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-100/70 dark:bg-[#151515] p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-neutral-500 shrink-0" />
                <div>
                  <span className="text-neutral-500 dark:text-geist-muted mr-1">Nearest Aerodrome:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {nearestAirport
                      ? `${nearestAirport.icao} — ${nearestAirport.name}`
                      : currentTelemetry.simConnected
                      ? (currentTelemetry.isInMenu ? 'Simulator in Menu / Loading' : 'Scanning aerodromes...')
                      : '-- (Disconnected)'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-neutral-500 dark:text-geist-muted text-[11px]">
                  {nearestAirport ? `${nearestAirport.countryName || nearestAirport.countryCode} · Elev. ${nearestAirport.elevationFt ?? 0} ft` : ''}
                </span>
                {nearestAirport && !activeFlight && (
                  <button
                    onClick={() => {
                      setDepIcao(nearestAirport.icao);
                    }}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-[#252525] border border-neutral-300 dark:border-geist-hairline hover:bg-neutral-50 transition-colors"
                  >
                    Set Dep
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (lg:col-span-1): Flight Management & Recording Controller */}
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-geist-hairline mb-4">
              <div className="flex items-center gap-2">
                <PlaneTakeoff className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  Flight Logger
                </h2>
              </div>
            </div>

            {activeFlight ? (
              <div className="space-y-4">
                <div className="bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-geist-hairline p-4 rounded-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Recording Active
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-[#222] font-mono text-neutral-600 dark:text-neutral-400">
                      {activeFlight.isManualFlight ? 'Manual Session' : 'Auto Session'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-neutral-700 dark:text-neutral-300">
                    <div className="flex justify-between">
                      <span className="text-neutral-500 dark:text-geist-muted">Route:</span>
                      <span className="font-semibold text-neutral-900 dark:text-white">{activeFlight.departureIcao} ➔ {activeFlight.arrivalIcao}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500 dark:text-geist-muted">Aircraft:</span>
                      <span className="truncate max-w-[150px] text-neutral-800 dark:text-neutral-300">{activeFlight.aircraftType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500 dark:text-geist-muted">Duration:</span>
                      <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">
                        {formatFlightDuration(activeFlight.flightTimeSeconds)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500 dark:text-geist-muted">Points Tracked:</span>
                      <span className="tabular-nums font-mono">{activeFlight.telemetryPoints.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500 dark:text-geist-muted">Max Altitude:</span>
                      <span className="tabular-nums font-mono">{activeFlight.maxAltitude} ft</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500 dark:text-geist-muted">Peak Ground Speed:</span>
                      <span className="tabular-nums font-mono">{activeFlight.maxGroundSpeed} kt</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => endActiveFlight()}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-medium py-2 px-4 rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white text-xs"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span>Finalize & Log Flight</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-xs space-y-1.5 text-neutral-600 dark:text-neutral-400">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${autoStartRecording ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                      {autoStartRecording ? 'Automatic Recording Active' : 'Manual Recording Mode'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAutoStartRecording(!autoStartRecording)}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-[#252525] hover:bg-neutral-300 dark:hover:bg-[#333333] text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-geist-hairline transition-colors"
                      title={autoStartRecording ? 'Click to disable auto-start' : 'Click to enable auto-start'}
                    >
                      {autoStartRecording ? 'Auto-Start: ON' : 'Auto-Start: OFF'}
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {autoStartRecording
                      ? 'Recording starts automatically when ground speed exceeds 20 kt or an engine starts. Or manually initiate a session below:'
                      : 'Auto-start on telemetry triggers is disabled. Initiate a session below or via the system tray when ready to fly:'}
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-neutral-500 dark:text-geist-muted mb-1 font-medium">Departure ICAO</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={depIcao}
                      onChange={(e) => setDepIcao(e.target.value.toUpperCase())}
                      placeholder={nearestAirport ? nearestAirport.icao : "e.g. LOWI"}
                      className="w-full h-8 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-3 text-xs text-neutral-900 dark:text-white focus-visible:outline-none focus-visible:border-neutral-400 transition-colors uppercase placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-neutral-500 dark:text-geist-muted mb-1 font-medium">Destination ICAO</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={arrIcao}
                      onChange={(e) => setArrIcao(e.target.value.toUpperCase())}
                      placeholder="e.g. EDDM"
                      className="w-full h-8 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-3 text-xs text-neutral-900 dark:text-white focus-visible:outline-none focus-visible:border-neutral-400 transition-colors uppercase placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-neutral-500 dark:text-geist-muted mb-1 font-medium">Aircraft Model / Airframe</label>
                    <input
                      type="text"
                      value={aircraftName}
                      onChange={(e) => setAircraftName(e.target.value)}
                      placeholder={currentTelemetry.aircraftTitle || "e.g. Cessna 172 Skyhawk"}
                      className="w-full h-8 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-geist-hairline rounded-sm px-3 text-xs text-neutral-900 dark:text-white focus-visible:outline-none focus-visible:border-neutral-400 transition-colors placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    startManualFlight(depIcao || (nearestAirport ? nearestAirport.icao : 'LOWI'), arrIcao || 'EDDM', aircraftName);
                    setDepIcao('');
                    setArrIcao('');
                    setAircraftName('');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black font-medium py-2 px-4 rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 text-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Manual Flight Session</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
