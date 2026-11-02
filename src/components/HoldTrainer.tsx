import React, { useState, useEffect, useRef } from 'react';
import { useFlightStore } from '../store/flightStore';
import { NavSource } from '../types/flight';
import { 
  RotateCw, 
  RefreshCw,
  Sliders,
  Radio,
  Activity,
  Compass
} from 'lucide-react';

export const HoldTrainer: React.FC = () => {
  const { currentTelemetry, activeFlight, theme } = useFlightStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState<'LIVE' | 'PRACTICE'>(() => activeFlight ? 'LIVE' : 'PRACTICE');
  const [navSource, setNavSource] = useState<NavSource>('NAV1');
  const [inboundCourse, setInboundCourse] = useState(210);
  const [turnDirection, setTurnDirection] = useState<'RIGHT' | 'LEFT'>('RIGHT');
  const [aircraftHeading, setAircraftHeading] = useState(30);

  // Automatically switch to Live MSFS Sync when an ongoing flight is detected
  const prevActiveFlightIdRef = useRef<string | null>(activeFlight?.id ?? null);
  useEffect(() => {
    const currentFlightId = activeFlight?.id ?? null;
    if (currentFlightId && (!prevActiveFlightIdRef.current || prevActiveFlightIdRef.current !== currentFlightId)) {
      setMode('LIVE');
    }
    prevActiveFlightIdRef.current = currentFlightId;
  }, [activeFlight?.id]);

  // Live MSFS Telemetry Sync based on chosen NAV source
  useEffect(() => {
    if (mode === 'LIVE' && currentTelemetry.simConnected) {
      setAircraftHeading(Math.round(currentTelemetry.heading));

      if (navSource === 'NAV1') {
        if (currentTelemetry.nav1Obs > 0) {
          setInboundCourse(currentTelemetry.nav1Obs);
        }
      } else if (navSource === 'NAV2') {
        if ((currentTelemetry.nav2Obs ?? 0) > 0) {
          setInboundCourse(currentTelemetry.nav2Obs);
        }
      } else if (navSource === 'ADF') {
        if (currentTelemetry.adf1RelativeBearing !== 0) {
          const qdm = Math.round((currentTelemetry.heading + currentTelemetry.adf1RelativeBearing + 360) % 360);
          setInboundCourse(qdm);
        }
      }
    }
  }, [mode, navSource, currentTelemetry]);

  const relativeAngle = (aircraftHeading - inboundCourse + 360) % 360;

  let entryType: 'DIRECT' | 'TEARDROP' | 'PARALLEL' = 'DIRECT';
  let entryReason = '';

  if (turnDirection === 'RIGHT') {
    if (relativeAngle >= 110 && relativeAngle < 180) {
      entryType = 'TEARDROP';
      entryReason = 'Fly to the fix, turn outbound to heading (Inbound - 30°) for 1 min, then turn right to intercept the inbound course.';
    } else if (relativeAngle >= 180 && relativeAngle < 290) {
      entryType = 'PARALLEL';
      entryReason = 'Fly to the fix, turn to outbound heading on non-holding side for 1 min, then turn left toward holding side to re-intercept.';
    } else {
      entryType = 'DIRECT';
      entryReason = 'Fly directly to the fix, turn right to outbound heading, and enter the holding racetrack pattern directly.';
    }
  } else {
    if (relativeAngle >= 180 && relativeAngle < 250) {
      entryType = 'TEARDROP';
      entryReason = 'Fly to the fix, turn outbound to heading (Inbound + 30°) for 1 min, then turn left to intercept the inbound course.';
    } else if (relativeAngle >= 70 && relativeAngle < 180) {
      entryType = 'PARALLEL';
      entryReason = 'Fly to the fix, turn to outbound heading for 1 min, then turn right toward holding side to re-intercept.';
    } else {
      entryType = 'DIRECT';
      entryReason = 'Fly directly to the fix, turn left to outbound heading, and enter the holding racetrack pattern directly.';
    }
  }

  // Draw holding racetrack and entry sectors on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);

    const inboundRad = ((inboundCourse - 90) * Math.PI) / 180;
    const sectorRadius = 150;

    // 1. Draw Entry Sectors
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const dirStart = turnDirection === 'RIGHT' ? inboundRad - Math.PI * 0.4 : inboundRad - Math.PI * 0.6;
    ctx.arc(0, 0, sectorRadius, dirStart, dirStart + Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    const tdStart = dirStart + Math.PI;
    const tdSpan = (70 * Math.PI) / 180;
    ctx.arc(0, 0, sectorRadius, tdStart, tdStart + tdSpan, false);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 166, 35, 0.12)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    const parStart = tdStart + tdSpan;
    const parSpan = (110 * Math.PI) / 180;
    ctx.arc(0, 0, sectorRadius, parStart, parStart + parSpan, false);
    ctx.closePath();
    ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, sectorRadius, 0, Math.PI * 2);
    ctx.strokeStyle = theme === 'dark' ? '#262626' : '#d4d4d4';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. Draw Holding Racetrack Pattern
    ctx.save();
    ctx.rotate(inboundRad);

    const legLength = 110;
    const turnRadius = 35;
    const mult = turnDirection === 'RIGHT' ? 1 : -1;

    ctx.beginPath();
    // Inbound leg
    ctx.moveTo(-legLength, 0);
    ctx.lineTo(0, 0);
    // Turn at fix
    ctx.arc(0, mult * turnRadius, turnRadius, -Math.PI / 2, mult > 0 ? Math.PI / 2 : -Math.PI * 1.5, mult < 0);
    // Outbound leg
    ctx.lineTo(-legLength, mult * turnRadius * 2);
    // Inbound turn
    ctx.arc(-legLength, mult * turnRadius, turnRadius, mult > 0 ? Math.PI / 2 : -Math.PI * 1.5, -Math.PI / 2, mult < 0);

    ctx.strokeStyle = '#0070f3';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Arrow on inbound leg
    ctx.beginPath();
    ctx.moveTo(-20, -5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-20, 5);
    ctx.fillStyle = '#0070f3';
    ctx.fill();

    ctx.restore();

    // 3. Draw Holding Fix (center)
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0070f3';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 4. Draw Approaching Aircraft
    const arrivalRad = ((aircraftHeading - 90) * Math.PI) / 180;
    const planeDist = 120;
    const planeX = -planeDist * Math.cos(arrivalRad);
    const planeY = -planeDist * Math.sin(arrivalRad);

    // Vector line toward fix
    ctx.beginPath();
    ctx.moveTo(planeX, planeY);
    ctx.lineTo(0, 0);
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Aircraft symbol
    ctx.save();
    ctx.translate(planeX, planeY);
    ctx.rotate((aircraftHeading * Math.PI) / 180);

    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    ctx.restore();
  }, [inboundCourse, turnDirection, aircraftHeading, theme]);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-geist-hairline">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
            <RotateCw className="w-4 h-4 text-neutral-500" />
            Holding Pattern Procedural Trainer
          </h1>
          <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
            FAA & ICAO Standard Entry Sector Analysis (Direct, Teardrop, Parallel)
          </p>
        </div>

        {/* Controls: Mode Selector & Nav Source */}
        <div className="flex flex-wrap items-center gap-2">
          {/* NAV Source Switcher */}
          <div className="inline-flex rounded-sm p-0.5 bg-neutral-200 dark:bg-[#181818] border border-neutral-300 dark:border-geist-hairline">
            <button
              onClick={() => setNavSource('NAV1')}
              title="Use NAV1 Radio as holding fix reference"
              className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                navSource === 'NAV1'
                  ? 'bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              NAV1
            </button>
            <button
              onClick={() => setNavSource('NAV2')}
              title="Use NAV2 Radio as holding fix reference"
              className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                navSource === 'NAV2'
                  ? 'bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              NAV2
            </button>
            <button
              onClick={() => setNavSource('ADF')}
              title="Use ADF / NDB as holding fix reference"
              className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                navSource === 'ADF'
                  ? 'bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              ADF (NDB)
            </button>
          </div>

          {/* Live vs Practice Mode */}
          <div className="inline-flex rounded-sm p-0.5 bg-neutral-200 dark:bg-[#181818] border border-neutral-300 dark:border-geist-hairline">
            <button
              onClick={() => setMode('LIVE')}
              className={`px-3 py-1 text-xs font-medium rounded-sm flex items-center gap-1.5 transition-colors ${
                mode === 'LIVE'
                  ? 'bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              <span>Live MSFS Sync</span>
              {activeFlight && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Ongoing flight active" />
              )}
            </button>
            <button
              onClick={() => setMode('PRACTICE')}
              className={`px-3 py-1 text-xs font-medium rounded-sm flex items-center gap-1.5 transition-colors ${
                mode === 'PRACTICE'
                  ? 'bg-white dark:bg-[#282828] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-neutral-500" />
              <span>Practice Mode</span>
            </button>
          </div>

          <button
            onClick={() => {
              setInboundCourse(Math.floor(Math.random() * 36) * 10);
              setAircraftHeading(Math.floor(Math.random() * 36) * 10);
              setTurnDirection(Math.random() > 0.5 ? 'RIGHT' : 'LEFT');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-[#161616] dark:hover:bg-[#222222] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-geist-hairline transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Randomize Hold</span>
          </button>
        </div>
      </div>

      {/* Live Sim Status Banner */}
      {mode === 'LIVE' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-sm bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline text-xs">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="font-medium text-neutral-900 dark:text-white">
              Live Mode ({navSource}):
            </span>
            {currentTelemetry.simConnected ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {navSource === 'NAV1' && (
                  `Heading ${Math.round(currentTelemetry.heading)}° · NAV1 OBS ${currentTelemetry.nav1Obs}° · DME ${currentTelemetry.nav1DmeDistance > 0 ? `${currentTelemetry.nav1DmeDistance.toFixed(1)} NM` : 'No Signal'}`
                )}
                {navSource === 'NAV2' && (
                  `Heading ${Math.round(currentTelemetry.heading)}° · NAV2 OBS ${currentTelemetry.nav2Obs || 0}° · DME ${(currentTelemetry.nav2DmeDistance ?? 0) > 0 ? `${currentTelemetry.nav2DmeDistance.toFixed(1)} NM` : 'No Signal'}`
                )}
                {navSource === 'ADF' && (
                  `Heading ${Math.round(currentTelemetry.heading)}° · ADF Relative ${currentTelemetry.adf1RelativeBearing.toFixed(1)}° · Bearing to NDB (QDM) ${Math.round((currentTelemetry.heading + currentTelemetry.adf1RelativeBearing + 360) % 360)}°`
                )}
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                Waiting for MSFS connection (0x3364)... Controls will auto-sync upon connection.
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-500">
            {activeFlight && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Flight: {activeFlight.departureIcao} → {activeFlight.arrivalIcao}
              </span>
            )}
            <span>GS: {currentTelemetry.groundSpeed} kt</span>
          </div>
        </div>
      )}

      {/* Main Grid: Visualizer and Analysis Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top-down Canvas visualizer */}
        <div className="lg:col-span-2 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 flex flex-col items-center justify-center shadow-sm">
          <div className="w-full flex items-center justify-between text-xs text-neutral-500 dark:text-geist-muted mb-2">
            <span>
              Fix: {navSource === 'NAV1' ? 'NAV1 VOR/DME' : navSource === 'NAV2' ? 'NAV2 VOR/DME' : 'NDB Beacon (ADF)'}
            </span>
            <span className="font-mono tabular-nums">Inbound: {inboundCourse}° · {turnDirection} turns</span>
          </div>

          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="w-full max-w-[400px] aspect-square rounded-full border border-neutral-200 dark:border-neutral-800"
          />

          <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-neutral-300 dark:bg-[#222]" />
              <span>Direct (180°)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/50" />
              <span>Teardrop (70°)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-neutral-400 dark:bg-[#333]" />
              <span>Parallel (110°)</span>
            </div>
          </div>
        </div>

        {/* Sector Entry Analysis & Interactive Controls */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
            <span className="text-xs font-medium text-neutral-500 dark:text-geist-muted uppercase tracking-wider block">
              Procedural Entry Assessment
            </span>

            <div className="p-3 rounded-sm bg-neutral-100 dark:bg-[#181818] border border-neutral-200 dark:border-geist-hairline">
              <div className="text-xs text-neutral-500 dark:text-geist-muted">Calculated Procedure:</div>
              <div className="text-lg font-semibold text-neutral-900 dark:text-white mt-0.5 flex items-center gap-2">
                <span className={
                  entryType === 'DIRECT' ? 'text-emerald-600 dark:text-emerald-400' :
                  entryType === 'TEARDROP' ? 'text-amber-600 dark:text-amber-400' :
                  'text-blue-600 dark:text-blue-400'
                }>
                  {entryType} ENTRY
                </span>
              </div>

              <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-sans">
                {entryReason}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline">
                <span className="text-neutral-500 dark:text-geist-muted block text-[11px]">Arrival Angle:</span>
                <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">{relativeAngle}°</span>
              </div>
              <div className="p-2 rounded-sm bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline">
                <span className="text-neutral-500 dark:text-geist-muted block text-[11px]">Outbound Heading:</span>
                <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">{(inboundCourse + 180) % 360}°</span>
              </div>
            </div>
          </div>

          {/* Interactive Parameters */}
          <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-geist-hairline">
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {mode === 'LIVE' ? 'Live Telemetry Sliders' : 'Hold Parameters'}
                </span>
              </div>
              {mode === 'LIVE' && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">LIVE SYNCED</span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-neutral-500 dark:text-geist-muted mb-1 text-xs">
                  <span>Aircraft Heading to Fix</span>
                  <span className="text-neutral-900 dark:text-white font-semibold tabular-nums">{aircraftHeading}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={aircraftHeading}
                  onChange={(e) => {
                    setMode('PRACTICE');
                    setAircraftHeading(Number(e.target.value));
                  }}
                  className="w-full accent-neutral-900 dark:accent-white cursor-pointer h-1.5 bg-neutral-200 dark:bg-[#262626] rounded-sm"
                />
              </div>

              <div>
                <div className="flex justify-between text-neutral-500 dark:text-geist-muted mb-1 text-xs">
                  <span>Hold Inbound Course</span>
                  <span className="text-neutral-900 dark:text-white font-semibold tabular-nums">{inboundCourse}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={inboundCourse}
                  onChange={(e) => {
                    setMode('PRACTICE');
                    setInboundCourse(Number(e.target.value));
                  }}
                  className="w-full accent-neutral-900 dark:accent-white cursor-pointer h-1.5 bg-neutral-200 dark:bg-[#262626] rounded-sm"
                />
              </div>

              <div>
                <span className="text-neutral-500 dark:text-geist-muted block mb-1 text-xs">Turn Direction</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTurnDirection('RIGHT')}
                    className={`py-1.5 px-3 rounded-sm text-xs font-medium border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                      turnDirection === 'RIGHT'
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-[#ededed] dark:text-black dark:border-white'
                        : 'bg-white dark:bg-black text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-geist-hairline hover:text-black dark:hover:text-white'
                    }`}
                  >
                    Standard (Right)
                  </button>
                  <button
                    onClick={() => setTurnDirection('LEFT')}
                    className={`py-1.5 px-3 rounded-sm text-xs font-medium border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
                      turnDirection === 'LEFT'
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-[#ededed] dark:text-black dark:border-white'
                        : 'bg-white dark:bg-black text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-geist-hairline hover:text-black dark:hover:text-white'
                    }`}
                  >
                    Non-Std (Left)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
