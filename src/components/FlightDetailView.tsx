import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useFlightStore, safeInvoke } from '../store/flightStore';
import { ExportFormat, TouchdownEvent, Airport, TelemetryPoint } from '../types/flight';
import { FALLBACK_AIRPORTS } from '../data/fallbackAirports';
import { calculateDistanceNm } from '../data/mockData';
import { Select } from './ui/Select';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  ArrowLeft,
  Clock,
  Compass,
  TrendingDown,
  Navigation,
  Gauge,
  Wind,
  Download,
  Check,
  Layers,
  Globe,
  FileSpreadsheet,
  ChevronDown,
  Loader2,
  Plane,
  Thermometer,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { calculateTouchdownGForce } from '../utils/touchdownPhysics';

export function createTouchdownIcon(index: number, rate: number) {
  const absFpm = Math.abs(rate);
  const color = absFpm < 200 ? '#10b981' : absFpm < 350 ? '#f59e0b' : '#ef4444';
  return L.divIcon({
    className: 'custom-td-marker',
    html: `<div style="padding: 2px 5px; font-size: 10px; font-weight: 700; font-family: monospace; background: ${color}; color: #ffffff; border: 1.5px solid #ffffff; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); white-space: nowrap;">TD ${index}</div>`,
    iconSize: [36, 18],
    iconAnchor: [18, 9],
  });
}

const defaultIcon = L.divIcon({
  className: 'custom-leaflet-marker',
  html: `<div style="width: 12px; height: 12px; background: #0070f3; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 0 0 2px rgba(0,112,243,0.3);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const planeIcon = L.divIcon({
  className: 'custom-plane-icon',
  html: `
    <div style="transform: rotate(0deg); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: #171717; border: 1.5px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
      </svg>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const tocIcon = L.divIcon({
  className: 'custom-toc-marker',
  html: `<div style="padding: 2px 6px; font-size: 10px; font-weight: 700; font-family: monospace; background: #10b981; color: #ffffff; border: 1.5px solid #ffffff; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); white-space: nowrap;">TOC</div>`,
  iconSize: [32, 18],
  iconAnchor: [16, 9],
});

const todIcon = L.divIcon({
  className: 'custom-tod-marker',
  html: `<div style="padding: 2px 6px; font-size: 10px; font-weight: 700; font-family: monospace; background: #f59e0b; color: #ffffff; border: 1.5px solid #ffffff; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); white-space: nowrap;">TOD</div>`,
  iconSize: [32, 18],
  iconAnchor: [16, 9],
});

interface ColorStop {
  alt: number;
  r: number;
  g: number;
  b: number;
}

const ALTITUDE_COLOR_STOPS: ColorStop[] = [
  { alt: 0, r: 34, g: 197, b: 94 },       // Low altitude (0 ft): Vibrant Green (#22c55e)
  { alt: 10000, r: 132, g: 204, b: 22 },  // 10,000 ft: Lime / Yellow-Green (#84cc16)
  { alt: 20000, r: 234, g: 179, b: 8 },   // 20,000 ft: Yellow (#eab308)
  { alt: 32000, r: 249, g: 115, b: 22 },  // 32,000 ft: Orange (#f97316)
  { alt: 45000, r: 239, g: 68, b: 68 },   // 45,000 ft+: Red (#ef4444)
];

export function getAltitudeColor(altitudeFt: number): string {
  const alt = Math.max(0, altitudeFt);
  const firstStop = ALTITUDE_COLOR_STOPS[0];
  if (alt <= firstStop.alt) {
    return `rgb(${firstStop.r}, ${firstStop.g}, ${firstStop.b})`;
  }
  const lastStop = ALTITUDE_COLOR_STOPS[ALTITUDE_COLOR_STOPS.length - 1];
  if (alt >= lastStop.alt) {
    return `rgb(${lastStop.r}, ${lastStop.g}, ${lastStop.b})`;
  }

  for (let i = 0; i < ALTITUDE_COLOR_STOPS.length - 1; i++) {
    const s0 = ALTITUDE_COLOR_STOPS[i];
    const s1 = ALTITUDE_COLOR_STOPS[i + 1];
    if (alt >= s0.alt && alt <= s1.alt) {
      const t = (alt - s0.alt) / (s1.alt - s0.alt);
      const r = Math.round(s0.r + t * (s1.r - s0.r));
      const g = Math.round(s0.g + t * (s1.g - s0.g));
      const b = Math.round(s0.b + t * (s1.b - s0.b));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return `rgb(${lastStop.r}, ${lastStop.g}, ${lastStop.b})`;
}

function ChangeView({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [bounds, map]);
  return null;
}

export const FlightDetailView: React.FC = () => {
  const { 
    flights, 
    selectedFlightId, 
    setSelectedFlightId, 
    setActiveView, 
    scrubbedTelemetryIndex, 
    setScrubbedTelemetryIndex,
    exportFlight,
    theme,
    loadFlightDetails,
    isLoadingFlightDetails
  } = useFlightStore();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isHeavyReady, setIsHeavyReady] = useState(false);

  useEffect(() => {
    // Immediate frame paint for layout, selectors & cards; defer heavy Leaflet & Recharts mount by 40ms
    const timer = setTimeout(() => {
      setIsHeavyReady(true);
    }, 40);
    return () => clearTimeout(timer);
  }, [selectedFlightId]);

  useEffect(() => {
    if (!showExportMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showExportMenu]);

  const flight = useMemo(() => {
    return flights.find((f) => f.id === selectedFlightId) || flights[0];
  }, [flights, selectedFlightId]);

  const targetFlightId = flight?.id || selectedFlightId;
  const hasTelemetryPoints = (flight?.telemetryPoints && flight.telemetryPoints.length > 0) || false;
  const attemptedLoadsRef = useRef<Set<string>>(new Set());

  // Automatically fetch full telemetry trajectory dataset from SQLite if not loaded yet, or auto-heal distance if 0
  useEffect(() => {
    if (targetFlightId && !attemptedLoadsRef.current.has(targetFlightId)) {
      if (!hasTelemetryPoints || !flight?.distanceFlownNm || flight.distanceFlownNm <= 0) {
        attemptedLoadsRef.current.add(targetFlightId);
        loadFlightDetails(targetFlightId);
      }
    }
  }, [targetFlightId, hasTelemetryPoints, flight?.distanceFlownNm, loadFlightDetails]);

  const points = flight?.telemetryPoints || [];

  // Zoom range for the telemetry profile chart (timestamps in epoch ms)
  const [zoomTimeRange, setZoomTimeRange] = useState<{ start: number; end: number } | null>(null);
  const [dragSelection, setDragSelection] = useState<{
    startX: number;
    currentX: number;
    startIndex: number;
    currentIndex: number;
  } | null>(null);

  // Reset zoom whenever flight changes
  useEffect(() => {
    setZoomTimeRange(null);
    setDragSelection(null);
  }, [flight?.id]);

  // Points filtered by active zoom range (if user dragged to zoom into a timestamp range)
  const chartPoints = useMemo(() => {
    if (!zoomTimeRange) {
      return points.map((p, idx) => ({ ...p, originalIndex: idx }));
    }
    const filtered: Array<TelemetryPoint & { originalIndex: number }> = [];
    for (let idx = 0; idx < points.length; idx++) {
      const p = points[idx];
      const t = new Date(p.timestamp).getTime();
      if (t >= zoomTimeRange.start && t <= zoomTimeRange.end) {
        filtered.push({ ...p, originalIndex: idx });
      }
    }
    return filtered.length >= 2 ? filtered : points.map((p, idx) => ({ ...p, originalIndex: idx }));
  }, [points, zoomTimeRange]);

  // Downsample chart data points if length is large for silky smooth Recharts Area SVG rendering
  const chartData = useMemo(() => {
    if (chartPoints.length <= 1200) {
      return chartPoints.map((p, idx) => ({
        index: idx,
        time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rawTimestamp: new Date(p.timestamp).getTime(),
        altitude: p.altitudeMsl,
        groundSpeed: p.groundSpeed,
        ias: p.indicatedAirspeed,
        lat: p.latitude,
        lon: p.longitude,
        heading: p.heading,
        vs: p.verticalSpeed ?? 0,
        windSpeed: p.windSpeed,
        windDirection: p.windDirection,
        oat: p.oat,
        tat: p.tat,
        visibility: p.visibility,
        pointIndex: p.originalIndex,
      }));
    }
    const stride = Math.ceil(chartPoints.length / 1000);
    const sampled: Array<{
      index: number;
      time: string;
      rawTimestamp: number;
      altitude: number;
      groundSpeed: number;
      ias: number;
      lat: number;
      lon: number;
      heading: number;
      vs: number;
      windSpeed?: number;
      windDirection?: number;
      oat?: number;
      tat?: number;
      visibility?: number;
      pointIndex: number;
    }> = [];

    for (let i = 0; i < chartPoints.length; i += stride) {
      const p = chartPoints[i];
      sampled.push({
        index: sampled.length,
        time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rawTimestamp: new Date(p.timestamp).getTime(),
        altitude: p.altitudeMsl,
        groundSpeed: p.groundSpeed,
        ias: p.indicatedAirspeed,
        lat: p.latitude,
        lon: p.longitude,
        heading: p.heading,
        vs: p.verticalSpeed ?? 0,
        windSpeed: p.windSpeed,
        windDirection: p.windDirection,
        oat: p.oat,
        tat: p.tat,
        visibility: p.visibility,
        pointIndex: p.originalIndex,
      });
    }
    const lastIdx = chartPoints.length - 1;
    const lastPt = chartPoints[lastIdx];
    if (sampled[sampled.length - 1]?.pointIndex !== lastPt.originalIndex) {
      sampled.push({
        index: sampled.length,
        time: new Date(lastPt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rawTimestamp: new Date(lastPt.timestamp).getTime(),
        altitude: lastPt.altitudeMsl,
        groundSpeed: lastPt.groundSpeed,
        ias: lastPt.indicatedAirspeed,
        lat: lastPt.latitude,
        lon: lastPt.longitude,
        heading: lastPt.heading,
        vs: lastPt.verticalSpeed ?? 0,
        windSpeed: lastPt.windSpeed,
        windDirection: lastPt.windDirection,
        oat: lastPt.oat,
        tat: lastPt.tat,
        visibility: lastPt.visibility,
        pointIndex: lastPt.originalIndex,
      });
    }
    return sampled;
  }, [chartPoints]);

  // Keep ref to latest dragSelection and chartData for window-level mouseup handler
  const dragSelectionRef = useRef(dragSelection);
  const chartDataRef = useRef(chartData);
  useEffect(() => {
    dragSelectionRef.current = dragSelection;
    chartDataRef.current = chartData;
  }, [dragSelection, chartData]);

  // Window-level mouseup listener so dragging and releasing anywhere updates the zoom strictly on mouse release
  useEffect(() => {
    if (!dragSelection) return;

    const handleWindowMouseUp = () => {
      const sel = dragSelectionRef.current;
      const data = chartDataRef.current;
      if (sel && Math.abs(sel.currentX - sel.startX) > 5) {
        const minIdx = Math.min(sel.startIndex, sel.currentIndex);
        const maxIdx = Math.max(sel.startIndex, sel.currentIndex);
        if (maxIdx - minIdx >= 1 && data[minIdx] && data[maxIdx]) {
          const start = data[minIdx].rawTimestamp;
          const end = data[maxIdx].rawTimestamp;
          if (start < end) {
            setZoomTimeRange({ start, end });
          }
        }
      }
      setDragSelection(null);
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [Boolean(dragSelection)]);

  // Downsample points if trajectory has thousands of samples to keep Leaflet polyline node count smooth & responsive
  const mapPoints = useMemo(() => {
    if (points.length <= 800) return points;
    const stride = Math.ceil(points.length / 800);
    const sampled: typeof points = [];
    for (let i = 0; i < points.length; i += stride) {
      sampled.push(points[i]);
    }
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }
    return sampled;
  }, [points]);

  const coordinates: [number, number][] = useMemo(() => {
    return mapPoints.map((p) => [p.latitude, p.longitude]);
  }, [mapPoints]);

  const bounds = useMemo(() => {
    if (coordinates.length === 0) return null;
    return L.latLngBounds(coordinates);
  }, [coordinates]);

  // Compute Altitude Gradient Track Segments (0 ft: Green -> 45,000+ ft: Red)
  const altitudeSegments = useMemo(() => {
    if (mapPoints.length < 2) return [];

    const segments: { positions: [number, number][]; color: string; altitude: number }[] = [];

    // Quantize altitude to 250 ft steps for a smooth color transition and optimal rendering performance
    const getPointColor = (alt: number) => getAltitudeColor(Math.round(alt / 250) * 250);

    let currentPositions: [number, number][] = [[mapPoints[0].latitude, mapPoints[0].longitude]];
    let currentColor = getPointColor(mapPoints[0].altitudeMsl);
    let currentAlt = mapPoints[0].altitudeMsl;

    for (let i = 1; i < mapPoints.length; i++) {
      const pt = mapPoints[i];
      const ptColor = getPointColor(pt.altitudeMsl);

      if (ptColor !== currentColor) {
        // Complete the current segment up to this junction point to ensure seamless polyline connection
        currentPositions.push([pt.latitude, pt.longitude]);
        segments.push({
          positions: currentPositions,
          color: currentColor,
          altitude: currentAlt,
        });

        // Start next segment from junction point to avoid any gap
        currentPositions = [[pt.latitude, pt.longitude]];
        currentColor = ptColor;
        currentAlt = pt.altitudeMsl;
      } else {
        currentPositions.push([pt.latitude, pt.longitude]);
      }
    }

    if (currentPositions.length > 1) {
      segments.push({
        positions: currentPositions,
        color: currentColor,
        altitude: currentAlt,
      });
    }

    return segments;
  }, [mapPoints]);

  // Calculate Top of Climb (TOC) and Top of Descent (TOD)
  const { tocPoint, todPoint } = useMemo(() => {
    if (points.length < 5) return { tocPoint: null, todPoint: null };
    const maxAlt = Math.max(...points.map((p) => p.altitudeMsl));
    if (maxAlt < 1000) return { tocPoint: null, todPoint: null };

    const threshold = maxAlt * 0.95;
    const toc = points.find((p) => p.altitudeMsl >= threshold);

    let tod = null;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].altitudeMsl >= threshold) {
        tod = points[i];
        break;
      }
    }

    return {
      tocPoint: toc || null,
      todPoint: tod && tod !== toc ? tod : null,
    };
  }, [points]);

  // Extract and calculate all touchdowns (supports multiple landings, touch-and-goes, and historical flights)
  const touchdowns: TouchdownEvent[] = useMemo(() => {
    if (!flight) return [];
    if (flight.touchdowns && flight.touchdowns.length > 0) {
      return flight.touchdowns;
    }
    // Scan telemetry points for air-to-ground transitions
    if (points.length > 1) {
      const detected: TouchdownEvent[] = [];
      let wasInAir = false;
      let inAirTicks = 0;

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        if (!prev.isOnGround) {
          wasInAir = true;
          inAirTicks++;
        }

        if (wasInAir && inAirTicks >= 2 && !prev.isOnGround && curr.isOnGround) {
          const vs = (curr.verticalSpeed !== undefined && curr.verticalSpeed < 0)
            ? curr.verticalSpeed
            : (prev.verticalSpeed !== undefined && prev.verticalSpeed < 0 ? prev.verticalSpeed : -140);

          detected.push({
            timestamp: curr.timestamp,
            verticalSpeedFpm: Math.round(vs),
            groundSpeedKt: Math.round(curr.groundSpeed),
            pitchDeg: curr.pitch !== undefined ? Number(curr.pitch.toFixed(1)) : undefined,
            bankDeg: curr.bank !== undefined ? Number(curr.bank.toFixed(1)) : undefined,
            latitude: curr.latitude,
            longitude: curr.longitude,
            altitudeMsl: Math.round(curr.altitudeMsl),
            gForce: calculateTouchdownGForce(vs),
          });

          wasInAir = false;
          inAirTicks = 0;
        }
      }
      if (detected.length > 0) return detected;
    }

    if (flight.landingRateFpm) {
      const lastPt = points[points.length - 1];
      return [{
        timestamp: flight.endTime || flight.startTime,
        verticalSpeedFpm: Math.round(flight.landingRateFpm),
        latitude: lastPt?.latitude || 0,
        longitude: lastPt?.longitude || 0,
        groundSpeedKt: lastPt ? Math.round(lastPt.groundSpeed) : undefined,
        gForce: calculateTouchdownGForce(flight.landingRateFpm),
      }];
    }

    return [];
  }, [flight, points]);

  // Flight touchdown rate: average of all touchdowns
  const avgTouchdownRate = useMemo(() => {
    if (touchdowns.length > 0) {
      const sum = touchdowns.reduce((acc, t) => acc + t.verticalSpeedFpm, 0);
      return Math.round(sum / touchdowns.length);
    }
    return flight?.landingRateFpm ? Math.round(flight.landingRateFpm) : null;
  }, [touchdowns, flight?.landingRateFpm]);

  // Resolve airport metadata for each recorded touchdown
  const [resolvedTouchdownAirports, setResolvedTouchdownAirports] = useState<Record<number, { icao: string; name?: string }>>({});

  useEffect(() => {
    if (!touchdowns || touchdowns.length === 0) {
      setResolvedTouchdownAirports({});
      return;
    }

    let isCancelled = false;

    const resolveAll = async () => {
      const airportMap: Record<number, { icao: string; name?: string }> = {};

      for (let i = 0; i < touchdowns.length; i++) {
        const td = touchdowns[i];
        if (td.airportIcao) {
          airportMap[i] = { icao: td.airportIcao, name: td.airportName };
          continue;
        }

        // Try searching database for nearest airport within 5 NM of touchdown coordinates
        if (td.latitude && td.longitude) {
          try {
            const near = await safeInvoke<Airport>('search_airports_near', {
              lat: td.latitude,
              lon: td.longitude,
              radiusNm: 5.0,
            });
            if (near && near.icao) {
              airportMap[i] = { icao: near.icao, name: near.name };
              continue;
            }
          } catch {}

          // Fallback to FALLBACK_AIRPORTS from fallbackAirports
          const fallback = FALLBACK_AIRPORTS.find((a: Airport) => {
            const d = calculateDistanceNm(td.latitude, td.longitude, a.latitude, a.longitude);
            return d <= 5.0;
          });
          if (fallback) {
            airportMap[i] = { icao: fallback.icao, name: fallback.name };
            continue;
          }
        }

        // If it's the last touchdown and close to arrival, or only 1 touchdown
        if (i === touchdowns.length - 1 && flight?.arrivalIcao) {
          airportMap[i] = { icao: flight.arrivalIcao };
        }
      }

      if (!isCancelled) {
        setResolvedTouchdownAirports(airportMap);
      }
    };

    resolveAll();

    return () => {
      isCancelled = true;
    };
  }, [touchdowns, flight?.arrivalIcao]);

  // Atmospheric and Environmental Totals (Phase 12)
  const weatherStats = useMemo(() => {
    let minOat = flight?.minOat;
    let maxOat = flight?.maxOat;
    let minVis = flight?.minVisibility;
    let avgCruiseWindSpd = flight?.avgCruiseWindSpeed;
    let avgCruiseWindDir = flight?.avgCruiseWindDirection;
    let maxWindSpd = flight?.maxWindSpeed;
    let maxWindDir = flight?.maxWindDirection;

    // Fallback: derive from recorded telemetry points if not pre-calculated on flight record
    if ((minOat === undefined || maxWindSpd === undefined || avgCruiseWindSpd === undefined) && points.length > 0) {
      let sumU = 0;
      let sumV = 0;
      let cruisePts = 0;

      for (const p of points) {
        if (p.oat !== undefined) {
          minOat = minOat !== undefined ? Math.min(minOat, p.oat) : p.oat;
          maxOat = maxOat !== undefined ? Math.max(maxOat, p.oat) : p.oat;
        }
        if (p.visibility !== undefined) {
          minVis = minVis !== undefined ? Math.min(minVis, p.visibility) : p.visibility;
        }
        if (p.windSpeed !== undefined) {
          if (maxWindSpd === undefined || p.windSpeed > maxWindSpd) {
            maxWindSpd = p.windSpeed;
            maxWindDir = p.windDirection;
          }
          if (!p.isOnGround && p.altitudeMsl > 2500 && Math.abs(p.verticalSpeed ?? 0) <= 200 && p.windDirection !== undefined) {
            const rad = (p.windDirection * Math.PI) / 180;
            sumU += p.windSpeed * Math.sin(rad);
            sumV += p.windSpeed * Math.cos(rad);
            cruisePts++;
          }
        }
      }

      if (cruisePts > 0) {
        avgCruiseWindSpd = Math.round(Math.hypot(sumU / cruisePts, sumV / cruisePts));
        avgCruiseWindDir = Math.round(((Math.atan2(sumU / cruisePts, sumV / cruisePts) * 180) / Math.PI + 360) % 360);
      }
    }

    const hasWeather =
      minOat !== undefined ||
      maxOat !== undefined ||
      minVis !== undefined ||
      avgCruiseWindSpd !== undefined ||
      maxWindSpd !== undefined;

    return {
      hasWeather,
      minOat,
      maxOat,
      minVis,
      avgCruiseWindSpd,
      avgCruiseWindDir,
      maxWindSpd,
      maxWindDir,
    };
  }, [flight, points]);

  const activeScrubPoint = useMemo(() => {
    if (scrubbedTelemetryIndex !== null && points[scrubbedTelemetryIndex]) {
      return points[scrubbedTelemetryIndex];
    }
    return points[points.length - 1] || null;
  }, [points, scrubbedTelemetryIndex]);

  const handleExport = async (format: ExportFormat) => {
    if (!flight) return;
    setShowExportMenu(false);
    const result = await exportFlight(flight.id, format);
    if (result) {
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    }
  };

  if (!flight) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-500 dark:text-neutral-400 text-center">
        <Navigation className="w-8 h-8 text-neutral-400 dark:text-neutral-600 mb-3" />
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">No Flights Logged Yet</h3>
        <p className="text-xs text-neutral-500 dark:text-geist-muted max-w-sm mt-1">
          When you fly in MSFS with FSUIPC7 running, flights and telemetry trajectories will be automatically recorded here.
        </p>
        <button
          onClick={() => setActiveView('dashboard')}
          className="mt-4 px-3 py-1.5 text-xs font-medium rounded-sm bg-neutral-900 hover:bg-black dark:bg-[#ededed] dark:hover:bg-white text-white dark:text-black transition-colors"
        >
          View Live Dashboard
        </button>
      </div>
    );
  }

  const durationMins = Math.floor(flight.flightTimeSeconds / 60);
  const durationHours = Math.floor(durationMins / 60);
  const durationRemainingMins = durationMins % 60;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-150">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-geist-hairline">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('logbook')}
            className="p-1.5 rounded-sm bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
            title="Return to Logbook"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
                {flight.departureIcao} ➔ {flight.arrivalIcao}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-sm bg-neutral-100 dark:bg-[#161616] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline">
                {flight.aircraftType}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
              Operation on {new Date(flight.startTime).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Export Menu (consistent with LogbookView) */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="h-8 inline-flex items-center gap-1.5 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline text-xs font-medium text-neutral-800 dark:text-neutral-200 rounded-sm px-2.5 hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] transition-colors"
              title="Export Flight Telemetry (.GPX, .KML, .GeoJSON, .CSV)"
            >
              {copiedFormat ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Download className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span>{copiedFormat ? `Exported .${copiedFormat.toUpperCase()}` : 'Export Flight'}</span>
              <ChevronDown
                className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${
                  showExportMenu ? 'rotate-180 text-neutral-700 dark:text-neutral-200' : ''
                }`}
              />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-[#161616] border border-neutral-200 dark:border-[#2a2a2a] rounded-sm shadow-xl py-1 z-50 text-left text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-100 select-none">
                <div className="px-3 py-1.5 border-b border-neutral-100 dark:border-[#222222] mb-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Export Flight Data
                  </div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate mt-0.5 flex items-center justify-between">
                    <span>{flight.departureIcao} ➔ {flight.arrivalIcao}</span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                      {new Date(flight.startTime).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                    {flight.aircraftType}
                  </div>
                </div>

                <div className="space-y-0.5 px-1">
                  <button
                    onClick={() => handleExport('gpx')}
                    className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                  >
                    <div className="p-1 rounded-sm bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 shrink-0">
                      <Navigation className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                          GPS Track
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                          .GPX
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                        Universal GPS waypoint trajectory
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleExport('kml')}
                    className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                  >
                    <div className="p-1 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          Google Earth
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                          .KML
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                        3D globe ribbon & aerial camera tour
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleExport('geojson')}
                    className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                  >
                    <div className="p-1 rounded-sm bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          GeoJSON Feature
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                          .GeoJSON
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                        GIS vector geometry & telemetry metadata
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors flex items-center gap-2.5 group"
                  >
                    <div className="p-1 rounded-sm bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 shrink-0">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          CSV Spreadsheet
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-[#202020] px-1 py-0.5 rounded">
                          .CSV
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                        Raw tabular points (alt, GS, VS, heading)
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Flight selector */}
          <Select
            value={flight.id}
            onChange={(val) => setSelectedFlightId(String(val))}
            options={flights.map((f) => ({
              value: f.id,
              label: `${f.departureIcao} ➔ ${f.arrivalIcao} (${f.aircraftType})`,
            }))}
            className="min-w-[200px]"
            triggerClassName="bg-white dark:bg-geist-surface"
          />
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>Block Time</span>
          </div>
          <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
            {durationHours > 0 ? (
              <>
                {durationHours}
                <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal mr-1.5">h</span>
                {String(durationRemainingMins).padStart(2, '0')}
                <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">min</span>
              </>
            ) : (
              <>
                {durationRemainingMins} <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">mins</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <Compass className="w-3.5 h-3.5 text-neutral-400" />
            <span>Distance</span>
          </div>
          <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
            {flight.distanceFlownNm.toFixed(1)} <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">NM</span>
          </div>
        </div>

        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <Gauge className="w-3.5 h-3.5 text-neutral-400" />
            <span>Max Altitude</span>
          </div>
          <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
            {flight.maxAltitude.toLocaleString()} <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">ft</span>
          </div>
        </div>

        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
          <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium mb-1">
            <Wind className="w-3.5 h-3.5 text-neutral-400" />
            <span>Peak GS</span>
          </div>
          <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
            {flight.maxGroundSpeed} <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">kt</span>
          </div>
        </div>

        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline p-3 rounded-sm shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-neutral-500 dark:text-geist-muted text-[11px] font-medium">
              <TrendingDown className="w-3.5 h-3.5 text-neutral-400" />
              <span>{touchdowns.length > 1 ? 'Avg Touchdown Rate' : 'Touchdown Rate'}</span>
            </div>
            {touchdowns.length > 1 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                {touchdowns.length} Landings
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl font-semibold text-neutral-900 dark:text-white tabular-nums">
              {avgTouchdownRate !== null ? `${avgTouchdownRate}` : 'N/A'}{' '}
              <span className="text-xs text-neutral-500 dark:text-geist-muted font-normal">fpm</span>
            </div>
            {avgTouchdownRate !== null && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                  +{calculateTouchdownGForce(avgTouchdownRate).toFixed(2)} G
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2D Map with Altitude Gradient Track & TOC/TOD Badges */}
      <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 flex flex-col space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <div className="flex items-center gap-2">
            <Navigation className="w-3.5 h-3.5 text-neutral-500" />
            <span className="font-medium text-neutral-900 dark:text-white tracking-tight">Altitude-Gradient GPS Track</span>
          </div>

          {/* Altitude Gradient Legend (0 ft Green -> 45,000+ ft Red) */}
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 dark:text-neutral-400 text-[10px]">0 ft</span>
              <div
                className="w-28 sm:w-36 h-2 rounded-full border border-neutral-200 dark:border-neutral-700 shadow-inner"
                style={{
                  background: 'linear-gradient(to right, #22c55e 0%, #84cc16 22%, #eab308 44%, #f97316 71%, #ef4444 100%)',
                }}
                title="Altitude color gradient: 0 ft to 45,000+ ft"
              />
              <span className="text-neutral-500 dark:text-neutral-400 text-[10px]">45,000+ ft</span>
            </div>
            {activeScrubPoint && (
              <span className="flex flex-wrap items-center gap-1.5 text-neutral-500 dark:text-neutral-400 tabular-nums border-l border-neutral-200 dark:border-neutral-800 pl-2">
                <span
                  className="w-2 h-2 rounded-full inline-block shrink-0 shadow-sm"
                  style={{ backgroundColor: getAltitudeColor(activeScrubPoint.altitudeMsl) }}
                />
                <span className="tabular-nums">
                  Sample: {activeScrubPoint.altitudeMsl.toLocaleString()} ft · {String(activeScrubPoint.groundSpeed).padStart(3, '0')} kt
                </span>
                {activeScrubPoint.windSpeed !== undefined && activeScrubPoint.windDirection !== undefined && (
                  <span className="border-l border-neutral-300 dark:border-neutral-700 pl-1.5 flex items-center gap-1">
                    <Wind className="w-3 h-3 text-sky-500 shrink-0 inline" />
                    {activeScrubPoint.windDirection}°/{activeScrubPoint.windSpeed}kt
                  </span>
                )}
                {activeScrubPoint.oat !== undefined && (
                  <span className="border-l border-neutral-300 dark:border-neutral-700 pl-1.5">
                    {activeScrubPoint.oat > 0 ? `+${activeScrubPoint.oat}` : activeScrubPoint.oat}°C
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="h-[360px] w-full rounded-sm overflow-hidden border border-neutral-200 dark:border-geist-hairline relative z-0 flex items-center justify-center bg-neutral-50 dark:bg-black/20">
          {(!isHeavyReady || isLoadingFlightDetails || points.length === 0) ? (
            <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden bg-neutral-100/60 dark:bg-[#111111]/80">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
              <div className="relative flex flex-col items-center gap-2 px-4 py-3 rounded-md bg-white/90 dark:bg-black/70 border border-neutral-200/80 dark:border-neutral-800 backdrop-blur-sm shadow-sm">
                {points.length === 0 && !isLoadingFlightDetails ? (
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <div className="flex items-center gap-2">
                      <Plane className="w-4 h-4 text-neutral-500" />
                      <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        Summary Flight (No Raw Telemetry)
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500 max-w-xs">
                      This flight was logged or imported without raw GPS telemetry tracks. Flight metrics and touchdowns are preserved.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-500 dark:text-neutral-400" />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                        {isLoadingFlightDetails ? 'Fetching flight trajectory...' : 'Initializing 2D GPS track...'}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Rendering altitude gradient waypoint segments
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : coordinates.length > 0 ? (
            <MapContainer
              center={coordinates[0]}
              zoom={8}
              style={{ height: '100%', width: '100%' }}
              className={theme === 'dark' ? 'dark-tiles' : ''}
            >
              <ChangeView bounds={bounds} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Multi-Colored Altitude Segments */}
              {altitudeSegments.map((seg, idx) => (
                <Polyline
                  key={`seg-${idx}`}
                  positions={seg.positions}
                  color={seg.color}
                  weight={3.5}
                  opacity={0.9}
                />
              ))}

              {/* Origin Marker */}
              {points.length > 0 && (
                <Marker position={[points[0].latitude, points[0].longitude]} icon={defaultIcon}>
                  <Popup>
                    <div className="text-xs">
                      <strong>Origin: {flight.departureIcao}</strong>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Destination Marker */}
              {points.length > 1 && (
                <Marker position={[points[points.length - 1].latitude, points[points.length - 1].longitude]} icon={defaultIcon}>
                  <Popup>
                    <div className="text-xs">
                      <strong>Destination: {flight.arrivalIcao}</strong>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Top of Climb (TOC) Marker */}
              {tocPoint && (
                <Marker position={[tocPoint.latitude, tocPoint.longitude]} icon={tocIcon}>
                  <Popup>
                    <div className="text-xs">
                      <strong className="text-emerald-600">Top of Climb (TOC)</strong><br />
                      Altitude: {tocPoint.altitudeMsl.toLocaleString()} ft<br />
                      Time: {new Date(tocPoint.timestamp).toLocaleTimeString()}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Top of Descent (TOD) Marker */}
              {todPoint && (
                <Marker position={[todPoint.latitude, todPoint.longitude]} icon={todIcon}>
                  <Popup>
                    <div className="text-xs">
                      <strong className="text-amber-600">Top of Descent (TOD)</strong><br />
                      Altitude: {todPoint.altitudeMsl.toLocaleString()} ft<br />
                      Time: {new Date(todPoint.timestamp).toLocaleTimeString()}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Touchdown Markers (TOC, TOD, and all Touchdowns) */}
              {touchdowns.map((td, idx) => {
                const gVal = td.gForce ?? calculateTouchdownGForce(td.verticalSpeedFpm);
                const airport = resolvedTouchdownAirports[idx] || (td.airportIcao ? { icao: td.airportIcao, name: td.airportName } : null);
                return (
                  <Marker
                    key={`map-td-${idx}`}
                    position={[td.latitude, td.longitude]}
                    icon={createTouchdownIcon(idx + 1, td.verticalSpeedFpm)}
                  >
                    <Popup>
                      <div className="text-xs space-y-0.5">
                        <div className="flex items-center gap-1.5 font-semibold text-neutral-900">
                          <span>Touchdown #{idx + 1}</span>
                          {airport?.icao && (
                            <span
                              className="text-[10px] font-mono px-1 py-0.2 rounded bg-neutral-100 text-neutral-800 border border-neutral-300"
                              title={airport.name ? `Touchdown at ${airport.name} (${airport.icao})` : `Touchdown at ${airport.icao}`}
                            >
                              {airport.icao}
                            </span>
                          )}
                        </div>
                        <div>Rate: <span className="font-mono font-bold">{td.verticalSpeedFpm} fpm</span></div>
                        <div>Load: <span className="font-mono font-bold">+{gVal.toFixed(2)} G</span></div>
                        {td.groundSpeedKt !== undefined && <div>GS: {td.groundSpeedKt} kt</div>}
                        <div>Time: {new Date(td.timestamp).toLocaleTimeString()}</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Scrubbed Live Aircraft Marker */}
              {activeScrubPoint && (
                <Marker
                  position={[activeScrubPoint.latitude, activeScrubPoint.longitude]}
                  icon={planeIcon}
                >
                  <Popup>
                    <div className="text-xs space-y-0.5">
                      <div><strong>Alt:</strong> {activeScrubPoint.altitudeMsl.toLocaleString()} ft</div>
                      <div><strong>GS:</strong> {activeScrubPoint.groundSpeed} kt · <strong>HDG:</strong> {activeScrubPoint.heading}°</div>
                      {activeScrubPoint.windSpeed !== undefined && activeScrubPoint.windDirection !== undefined && (
                        <div><strong>Wind:</strong> {activeScrubPoint.windDirection}° / {activeScrubPoint.windSpeed} kt</div>
                      )}
                      {(activeScrubPoint.oat !== undefined || activeScrubPoint.tat !== undefined) && (
                        <div>
                          <strong>Temp:</strong> OAT {activeScrubPoint.oat !== undefined ? `${activeScrubPoint.oat > 0 ? `+${activeScrubPoint.oat}` : activeScrubPoint.oat}°C` : '--'}
                          {activeScrubPoint.tat !== undefined ? ` · TAT ${activeScrubPoint.tat > 0 ? `+${activeScrubPoint.tat}` : activeScrubPoint.tat}°C` : ''}
                        </div>
                      )}
                      {activeScrubPoint.visibility !== undefined && (
                        <div><strong>Vis:</strong> {activeScrubPoint.visibility >= 10 ? '10+ SM' : `${activeScrubPoint.visibility} SM`}</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-400">
              <Navigation className="w-8 h-8 mb-2 animate-pulse text-neutral-400 dark:text-neutral-500" />
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {isLoadingFlightDetails ? 'Loading GPS Trajectory...' : 'No telemetry points recorded for this flight'}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                {isLoadingFlightDetails ? 'Fetching telemetry dataset from local SQLite store' : 'Flight contains header information without GPS track samples'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Synchronized Telemetry Profile Chart */}
      <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <div className="flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-neutral-500" />
            <span className="font-medium text-neutral-900 dark:text-white tracking-tight">Synchronized Telemetry Scrubbing</span>
          </div>
          <div className="flex items-center gap-2">
            {zoomTimeRange ? (
              <button
                type="button"
                onClick={() => setZoomTimeRange(null)}
                className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm"
                title="Reset zoom to full flight (or double-click chart)"
              >
                <RotateCcw className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span>Reset Zoom</span>
                <span className="text-[10px] font-mono opacity-80">
                  ({new Date(zoomTimeRange.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} – {new Date(zoomTimeRange.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                </span>
              </button>
            ) : (
              <span className="text-neutral-500 dark:text-geist-muted text-[11px]">
                Click and drag an area to zoom · Double-click to reset
              </span>
            )}
          </div>
        </div>

        {(!isHeavyReady || isLoadingFlightDetails || chartData.length === 0) ? (
          <div className="h-60 w-full flex flex-col items-center justify-center rounded-sm border border-neutral-200/60 dark:border-geist-hairline/60 bg-neutral-100/60 dark:bg-[#111111]/80 relative overflow-hidden">
            <div className="absolute inset-x-0 top-1/4 border-b border-neutral-200/50 dark:border-neutral-800/50" />
            <div className="absolute inset-x-0 top-2/4 border-b border-neutral-200/50 dark:border-neutral-800/50" />
            <div className="absolute inset-x-0 top-3/4 border-b border-neutral-200/50 dark:border-neutral-800/50" />
            <div className="relative flex flex-col items-center gap-2 px-4 py-3 rounded-md bg-white/90 dark:bg-black/70 border border-neutral-200/80 dark:border-neutral-800 backdrop-blur-sm shadow-sm">
              {chartData.length === 0 && !isLoadingFlightDetails ? (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    No Altitude Profile Available
                  </span>
                  <span className="text-[11px] text-neutral-500 max-w-xs">
                    Raw telemetry points were excluded from this flight record.
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-500 dark:text-neutral-400" />
                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      {isLoadingFlightDetails ? 'Loading flight telemetry points...' : 'Loading altitude & speed profile...'}
                    </span>
                  </div>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Synchronizing flight telemetry graph
                  </span>
                </>
              )}
            </div>
          </div>
        ) : chartData.length > 0 ? (
          <div
            className={`h-60 w-full relative select-none ${dragSelection ? 'cursor-col-resize' : 'cursor-crosshair'}`}
            onDoubleClick={() => setZoomTimeRange(null)}
          >
            {/* Visual selection box overlay showing the selected area while dragging */}
            {dragSelection && Math.abs(dragSelection.currentX - dragSelection.startX) > 4 && (
              <div
                className="absolute pointer-events-none z-30 border border-blue-500 bg-blue-500/20 backdrop-blur-[0.5px]"
                style={{
                  left: Math.min(dragSelection.startX, dragSelection.currentX),
                  width: Math.abs(dragSelection.currentX - dragSelection.startX),
                  top: 5,
                  bottom: 25,
                }}
              >
                <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-mono font-medium px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                  {chartData[Math.min(dragSelection.startIndex, dragSelection.currentIndex)]?.time} –{' '}
                  {chartData[Math.max(dragSelection.startIndex, dragSelection.currentIndex)]?.time}
                </div>
              </div>
            )}

            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                onMouseDown={(e: any) => {
                  if (e && e.chartX !== undefined && e.activeTooltipIndex !== undefined) {
                    setDragSelection({
                      startX: e.chartX,
                      currentX: e.chartX,
                      startIndex: e.activeTooltipIndex,
                      currentIndex: e.activeTooltipIndex,
                    });
                  }
                }}
                onMouseMove={(e: any) => {
                  if (dragSelection) {
                    if (e && e.chartX !== undefined) {
                      setDragSelection((prev) =>
                        prev
                          ? {
                              ...prev,
                              currentX: e.chartX,
                              currentIndex:
                                e.activeTooltipIndex !== undefined ? e.activeTooltipIndex : prev.currentIndex,
                            }
                          : null
                      );
                    }
                  } else if (e && e.activeTooltipIndex !== undefined) {
                    const ptIdx = chartData[e.activeTooltipIndex]?.pointIndex ?? e.activeTooltipIndex;
                    setScrubbedTelemetryIndex(ptIdx);
                  }
                }}
                onMouseLeave={() => {
                  setScrubbedTelemetryIndex(null);
                }}
              >
                <defs>
                  <linearGradient id="altGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme === 'dark' ? '#38bdf8' : '#0070f3'} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={theme === 'dark' ? '#38bdf8' : '#0070f3'} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1f1f1f' : '#f0f0f0'} vertical={false} />
                <XAxis dataKey="time" stroke="#737373" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis
                  yAxisId="alt"
                  orientation="left"
                  stroke={theme === 'dark' ? '#38bdf8' : '#0070f3'}
                  tick={{ fontSize: 11, fill: theme === 'dark' ? '#38bdf8' : '#0070f3' }}
                  unit=" ft"
                />
                <YAxis
                  yAxisId="speed"
                  orientation="right"
                  stroke="#10b981"
                  tick={{ fontSize: 11, fill: '#10b981' }}
                  unit=" kt"
                />
                <Tooltip
                  content={({ active: tooltipActive, payload }) => {
                    if (!tooltipActive || !payload || payload.length === 0) return null;
                    const data = payload[0]?.payload;
                    if (!data) return null;

                    const windComp =
                      data.windSpeed !== undefined && data.windDirection !== undefined && data.heading !== undefined
                        ? Math.round(data.windSpeed * Math.cos(((data.windDirection - data.heading) * Math.PI) / 180))
                        : null;

                    return (
                      <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-[#262626] rounded-md p-2.5 text-xs shadow-md space-y-1.5 min-w-[170px]">
                        <div className="font-mono font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800 pb-1">
                          {data.time}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sky-500 flex items-center gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 inline-block" />
                              Altitude:
                            </span>
                            <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                              {Number(data.altitude).toLocaleString()} ft
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-emerald-500 flex items-center gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                              Ground Speed:
                            </span>
                            <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                              {data.groundSpeed} kt
                            </span>
                          </div>
                          {data.windSpeed !== undefined && data.windDirection !== undefined && (
                            <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-100 dark:border-neutral-800/80">
                              <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1 font-medium">
                                <Wind className="w-3 h-3 text-sky-400 shrink-0" />
                                Wind:
                              </span>
                              <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                {data.windDirection}° / {data.windSpeed} kt
                                {windComp !== null && (
                                  <span className="text-[10px] text-neutral-400 font-normal ml-1">
                                    ({windComp >= 0 ? `+${windComp} tail` : `${windComp} head`})
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          {(data.oat !== undefined || data.tat !== undefined) && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1 font-medium">
                                <Thermometer className="w-3 h-3 text-amber-500 shrink-0" />
                                Temp (OAT/TAT):
                              </span>
                              <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                {data.oat !== undefined ? `${data.oat > 0 ? `+${data.oat}` : data.oat}°C` : '--'}
                                {data.tat !== undefined ? ` / ${data.tat > 0 ? `+${data.tat}` : data.tat}°C` : ''}
                              </span>
                            </div>
                          )}
                          {data.visibility !== undefined && (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1 font-medium">
                                <Eye className="w-3 h-3 text-indigo-400 shrink-0" />
                                Visibility:
                              </span>
                              <span className="font-mono font-semibold text-neutral-900 dark:text-white tabular-nums">
                                {data.visibility >= 10 ? '10+ SM (CAVOK)' : `${data.visibility} SM`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  yAxisId="alt"
                  type="monotone"
                  dataKey="altitude"
                  stroke={theme === 'dark' ? '#38bdf8' : '#0070f3'}
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#altGradient)"
                  name="Altitude (MSL)"
                />
                <Area
                  yAxisId="speed"
                  type="monotone"
                  dataKey="groundSpeed"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#speedGradient)"
                  name="Ground Speed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-44 w-full flex flex-col items-center justify-center border border-dashed border-neutral-200 dark:border-geist-hairline rounded text-center text-neutral-400">
            <Gauge className="w-6 h-6 mb-1.5 text-neutral-400" />
            <span className="text-xs">No telemetry profile data available</span>
          </div>
        )}
      </div>

      {/* Atmospheric & Weather Summary ("Totals" - Phase 12) */}
      {weatherStats.hasWeather && (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-sky-500" />
            <h3 className="text-xs font-medium tracking-tight text-neutral-900 dark:text-white">
              Atmospheric & Environmental Totals
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            {/* OAT Range */}
            <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                <span>OAT Range (Min / Max)</span>
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums font-mono">
                {weatherStats.minOat !== undefined ? `${weatherStats.minOat > 0 ? `+${weatherStats.minOat}` : weatherStats.minOat}°C` : '--'}
                <span className="text-neutral-400 font-sans mx-1">/</span>
                {weatherStats.maxOat !== undefined ? `${weatherStats.maxOat > 0 ? `+${weatherStats.maxOat}` : weatherStats.maxOat}°C` : '--'}
              </div>
              <p className="text-[10px] text-neutral-400 leading-tight">Lowest and highest static air temperature</p>
            </div>

            {/* Lowest Visibility */}
            <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>Lowest Visibility</span>
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums font-mono">
                {weatherStats.minVis !== undefined
                  ? weatherStats.minVis >= 10
                    ? '10+ SM (CAVOK)'
                    : `${weatherStats.minVis} SM`
                  : 'N/A'}
              </div>
              <p className="text-[10px] text-neutral-400 leading-tight">Minimum atmospheric visibility range</p>
            </div>

            {/* Average Wind During Cruise */}
            <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                <Compass className="w-3.5 h-3.5 text-sky-500" />
                <span>Cruise Wind (Avg)</span>
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums font-mono">
                {weatherStats.avgCruiseWindSpd !== undefined && weatherStats.avgCruiseWindDir !== undefined
                  ? `${String(weatherStats.avgCruiseWindDir).padStart(3, '0')}° @ ${weatherStats.avgCruiseWindSpd} kt`
                  : 'N/A'}
              </div>
              <p className="text-[10px] text-neutral-400 leading-tight">Vector-averaged wind during cruise</p>
            </div>

            {/* Maximum Wind Speed */}
            <div className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                <Wind className="w-3.5 h-3.5 text-rose-500" />
                <span>Max Wind Encountered</span>
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums font-mono">
                {weatherStats.maxWindSpd !== undefined
                  ? `${weatherStats.maxWindDir !== undefined ? `${String(weatherStats.maxWindDir).padStart(3, '0')}° @ ` : ''}${weatherStats.maxWindSpd} kt`
                  : 'N/A'}
              </div>
              <p className="text-[10px] text-neutral-400 leading-tight">Peak wind velocity and direction recorded</p>
            </div>
          </div>
        </div>
      )}

      {/* Touchdown & Landing Analysis Panel (displays multiple ratings & individual touchdown G-force) */}
      {touchdowns.length > 0 && (
        <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-neutral-500" />
              <h3 className="text-xs font-medium tracking-tight text-neutral-900 dark:text-white">
                Touchdown & Landing Analysis
              </h3>
            </div>
            {avgTouchdownRate !== null && (
              <div className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-2 tabular-nums">
                <span>Overall Touchdown Rate:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">{avgTouchdownRate} fpm</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  (+{calculateTouchdownGForce(avgTouchdownRate).toFixed(2)} G)
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {touchdowns.map((td, idx) => {
              const gVal = td.gForce ?? calculateTouchdownGForce(td.verticalSpeedFpm);
              const airport = resolvedTouchdownAirports[idx] || (td.airportIcao ? { icao: td.airportIcao, name: td.airportName } : null);
              const isDifferentFromArrival = airport?.icao && flight && airport.icao.toUpperCase() !== flight.arrivalIcao.toUpperCase();

              return (
                <div
                  key={`td-card-${idx}`}
                  className="p-3 rounded-sm bg-neutral-50 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-neutral-900 dark:text-white whitespace-nowrap">
                        Touchdown #{idx + 1}
                      </span>
                      {airport?.icao && (
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors ${
                            isDifferentFromArrival
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : 'bg-neutral-100 dark:bg-[#202020] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700'
                          }`}
                          title={`Touchdown at ${airport.name ? `${airport.name} (${airport.icao})` : airport.icao}`}
                        >
                          {airport.icao}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700">
                        +{gVal.toFixed(2)} G
                      </span>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-lg font-bold text-neutral-900 dark:text-white">
                      {td.verticalSpeedFpm} <span className="text-[11px] font-normal text-neutral-500">fpm</span>
                    </span>
                    {td.groundSpeedKt !== undefined && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {td.groundSpeedKt} kt GS
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-geist-muted border-t border-neutral-200 dark:border-geist-hairline pt-1.5">
                    <span>{new Date(td.timestamp).toLocaleTimeString()}</span>
                    {(td.pitchDeg !== undefined || td.bankDeg !== undefined) && (
                      <span>
                        {td.pitchDeg !== undefined ? `${td.pitchDeg > 0 ? '+' : ''}${td.pitchDeg}° Pitch` : ''}
                        {td.pitchDeg !== undefined && td.bankDeg !== undefined ? ' · ' : ''}
                        {td.bankDeg !== undefined ? `${td.bankDeg}° Bank` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
