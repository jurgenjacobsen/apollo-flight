import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  TelemetryData,
  FlightRecord,
  VisitedAirport,
  VisitedCountry,
  FlightStage,
  ExportFormat,
  LogbookExportFormat,
  TelemetryPoint,
  Airport,
  TouchdownEvent,
} from '../types/flight';
import { SavedRoute, GeneratedRoute } from '../types/route';
import { calculateTouchdownGForce } from '../utils/touchdownPhysics';
import { calculateDistanceNm } from '../data/mockData';
import { resolveAirport } from '../services/routeGenerator';

// Dynamic safe invoke helper for Tauri v2 / browser compatibility
export async function safeInvoke<T>(cmd: string, args: Record<string, any> = {}): Promise<T | null> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (err) {
      console.warn(`[Tauri IPC] ${cmd} failed or running outside Tauri runtime:`, err);
      return null;
    }
  }
  return null;
}

function computeAverageTouchdownRate(touchdowns: TouchdownEvent[] | undefined, fallbackVs: number): number {
  if (touchdowns && touchdowns.length > 0) {
    const sum = touchdowns.reduce((acc, t) => acc + t.verticalSpeedFpm, 0);
    return Math.round(sum / touchdowns.length);
  }
  return fallbackVs < 0 ? Math.round(fallbackVs) : -140;
}

export function calculateRecordedFlightDistance(
  points: Array<{ latitude: number; longitude: number }>,
  depAirport?: { latitude: number; longitude: number } | null,
  arrAirport?: { latitude: number; longitude: number } | null
): number {
  const validPoints = points.filter(
    (p) =>
      p &&
      typeof p.latitude === 'number' &&
      typeof p.longitude === 'number' &&
      isFinite(p.latitude) &&
      isFinite(p.longitude) &&
      Math.abs(p.latitude) <= 90 &&
      Math.abs(p.longitude) <= 180
  );

  let totalNm = 0;

  if (validPoints.length > 0) {
    const firstPoint = validPoints[0];
    const lastPoint = validPoints[validPoints.length - 1];

    // 1. Distance from departure airport reference point to first recorded point
    if (
      depAirport &&
      typeof depAirport.latitude === 'number' &&
      typeof depAirport.longitude === 'number' &&
      isFinite(depAirport.latitude) &&
      isFinite(depAirport.longitude)
    ) {
      totalNm += calculateDistanceNm(
        depAirport.latitude,
        depAirport.longitude,
        firstPoint.latitude,
        firstPoint.longitude
      );
    }

    // 2. Cumulative distance between all consecutive recorded telemetry points
    for (let i = 0; i < validPoints.length - 1; i++) {
      totalNm += calculateDistanceNm(
        validPoints[i].latitude,
        validPoints[i].longitude,
        validPoints[i + 1].latitude,
        validPoints[i + 1].longitude
      );
    }

    // 3. Distance from last recorded point to arrival airport reference point
    if (
      arrAirport &&
      typeof arrAirport.latitude === 'number' &&
      typeof arrAirport.longitude === 'number' &&
      isFinite(arrAirport.latitude) &&
      isFinite(arrAirport.longitude)
    ) {
      totalNm += calculateDistanceNm(
        lastPoint.latitude,
        lastPoint.longitude,
        arrAirport.latitude,
        arrAirport.longitude
      );
    }
  } else if (
    depAirport &&
    arrAirport &&
    typeof depAirport.latitude === 'number' &&
    typeof depAirport.longitude === 'number' &&
    typeof arrAirport.latitude === 'number' &&
    typeof arrAirport.longitude === 'number' &&
    isFinite(depAirport.latitude) &&
    isFinite(depAirport.longitude) &&
    isFinite(arrAirport.latitude) &&
    isFinite(arrAirport.longitude)
  ) {
    // If no telemetry points were recorded, calculate straight line between dep and arr airports
    totalNm = calculateDistanceNm(
      depAirport.latitude,
      depAirport.longitude,
      arrAirport.latitude,
      arrAirport.longitude
    );
  }

  return Number(totalNm.toFixed(1));
}

export function triggerFileDownload(content: string, filename: string, mimeType: string) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function triggerFileSave(
  content: string,
  filename: string,
  format: ExportFormat,
  mimeType: string
): Promise<boolean> {
  // 1. Native File System Access API (Opens Windows Explorer "Save As" location dialog)
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const descriptions: Record<ExportFormat, string> = {
        gpx: 'GPS Exchange Format (*.gpx)',
        kml: 'Google Earth KML (*.kml)',
        geojson: 'GeoJSON Map File (*.geojson)',
        csv: 'CSV Comma Delimited (*.csv)',
        json: 'JSON Data File (*.json)',
      };

      const extensions: Record<ExportFormat, string[]> = {
        gpx: ['.gpx'],
        kml: ['.kml'],
        geojson: ['.geojson'],
        csv: ['.csv'],
        json: ['.json'],
      };

      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: descriptions[format] || `${format.toUpperCase()} File`,
            accept: {
              [mimeType]: extensions[format] || [`.${format}`],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled / dismissed the Windows Explorer file picker
        return false;
      }
      console.warn('[Export] File picker unavailable, falling back to browser download:', err);
    }
  }

  // 2. Browser fallback (downloads directly to Downloads folder)
  triggerFileDownload(content, filename, mimeType);
  return true;
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateFlightExport(flight: FlightRecord, format: ExportFormat): string {
  const pts = flight.telemetryPoints || [];
  const dep = xmlEscape(flight.departureIcao || 'UNKNOWN');
  const arr = xmlEscape(flight.arrivalIcao || 'UNKNOWN');
  const aircraftType = xmlEscape(flight.aircraftType || 'Aircraft');
  const flightId = xmlEscape(flight.id || '');
  const startTime = xmlEscape(flight.startTime || '');

  switch (format) {
    case 'gpx': {
      let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
      out += '<gpx version="1.1" creator="Apollo Flight" xmlns="http://www.topografix.com/GPX/1/1">\n';
      out += `  <metadata><name>${dep} to ${arr} - ${aircraftType}</name><time>${startTime}</time></metadata>\n`;
      out += `  <trk>\n    <name>Flight ${flightId}</name>\n    <trkseg>\n`;
      for (const p of pts) {
        const ele = (p.altitudeMsl * 0.3048).toFixed(1);
        const ts = xmlEscape(p.timestamp || '');
        out += `      <trkpt lat="${p.latitude.toFixed(6)}" lon="${p.longitude.toFixed(6)}"><ele>${ele}</ele><time>${ts}</time></trkpt>\n`;
      }
      out += '    </trkseg>\n  </trk>\n</gpx>\n';
      return out;
    }
    case 'kml': {
      let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
      out += '<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n';
      out += `    <name>Flight ${dep} to ${arr} (${aircraftType})</name>\n`;
      out += '    <Style id="airborneTrajectory">\n';
      out += '      <LineStyle><color>ffff7000</color><width>3</width></LineStyle>\n';
      out += '      <PolyStyle><color>44ff7000</color></PolyStyle>\n';
      out += '    </Style>\n';
      out += '    <Style id="groundTrack">\n';
      out += '      <LineStyle><color>ff00aa00</color><width>3</width></LineStyle>\n';
      out += '    </Style>\n';
      out += '    <Folder>\n      <name>3D Flight Trajectory</name>\n';
      out += `      <Placemark>\n        <name>Airborne Profile (${dep} to ${arr})</name>\n`;
      out += '        <styleUrl>#airborneTrajectory</styleUrl>\n';
      out += '        <LineString>\n';
      out += '          <extrude>1</extrude>\n';
      out += '          <tessellate>1</tessellate>\n';
      out += '          <altitudeMode>absolute</altitudeMode>\n';
      out += '          <coordinates>\n';
      for (const p of pts) {
        const ele = (p.altitudeMsl * 0.3048).toFixed(1);
        out += `            ${p.longitude.toFixed(6)},${p.latitude.toFixed(6)},${ele}\n`;
      }
      out += '          </coordinates>\n        </LineString>\n      </Placemark>\n    </Folder>\n';
      out += '    <Folder>\n      <name>Ground Track (Surface Footprint)</name>\n';
      out += `      <Placemark>\n        <name>Runway and Ground Track (${dep} to ${arr})</name>\n`;
      out += '        <styleUrl>#groundTrack</styleUrl>\n';
      out += '        <LineString>\n';
      out += '          <tessellate>1</tessellate>\n';
      out += '          <altitudeMode>clampToGround</altitudeMode>\n';
      out += '          <coordinates>\n';
      for (const p of pts) {
        out += `            ${p.longitude.toFixed(6)},${p.latitude.toFixed(6)},0\n`;
      }
      out += '          </coordinates>\n        </LineString>\n      </Placemark>\n    </Folder>\n';
      out += '  </Document>\n</kml>\n';
      return out;
    }
    case 'geojson': {
      const coords = pts.map((p) => [p.longitude, p.latitude, Number((p.altitudeMsl * 0.3048).toFixed(1))]);
      return JSON.stringify(
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                id: flight.id,
                aircraftType: flight.aircraftType,
                departureIcao: flight.departureIcao,
                arrivalIcao: flight.arrivalIcao,
                startTime: flight.startTime,
                endTime: flight.endTime,
                durationMinutes: Math.round(flight.flightTimeSeconds / 60),
                distanceNm: flight.distanceFlownNm,
                maxAltitudeFt: flight.maxAltitude,
                maxGroundSpeedKt: flight.maxGroundSpeed,
                landingRateFpm: flight.landingRateFpm,
              },
              geometry: {
                type: 'LineString',
                coordinates: coords,
              },
            },
          ],
        },
        null,
        2
      );
    }
    case 'csv': {
      let out = 'flight_id,timestamp,latitude,longitude,altitude_msl,altitude_agl,indicated_airspeed,ground_speed,heading,vertical_speed,is_on_ground\n';
      for (const p of pts) {
        out += `${p.flightId || flight.id},${p.timestamp},${p.latitude.toFixed(6)},${p.longitude.toFixed(6)},${p.altitudeMsl.toFixed(1)},${(p.altitudeAgl ?? 0).toFixed(1)},${p.indicatedAirspeed.toFixed(1)},${p.groundSpeed.toFixed(1)},${p.heading.toFixed(1)},${(p.verticalSpeed ?? 0).toFixed(1)},${p.isOnGround ? 1 : 0}\n`;
      }
      return out;
    }
    default:
      return '';
  }
}

export function generateLogbookExport(flights: FlightRecord[], format: LogbookExportFormat): string {
  if (format === 'json') {
    const flightSummaries = flights.map((f) => {
      const durationMins = Math.round(f.flightTimeSeconds / 60);
      const hours = Math.floor(durationMins / 60);
      const mins = durationMins % 60;
      const formattedDuration = `${hours}h ${mins.toString().padStart(2, '0')}m`;

      return {
        id: f.id,
        departureIcao: f.departureIcao || '',
        arrivalIcao: f.arrivalIcao || '',
        aircraftType: f.aircraftType || '',
        startTime: f.startTime || '',
        endTime: f.endTime || null,
        flightTimeSeconds: f.flightTimeSeconds || 0,
        flightTimeFormatted: formattedDuration,
        distanceNm: Number((f.distanceFlownNm || 0).toFixed(1)),
        maxAltitudeFt: f.maxAltitude || 0,
        maxGroundSpeedKt: f.maxGroundSpeed || 0,
        landingRateFpm: f.landingRateFpm !== undefined && f.landingRateFpm !== null ? Math.round(f.landingRateFpm) : null,
        status: f.status || 'COMPLETED',
      };
    });

    return JSON.stringify(flightSummaries, null, 2);
  }

  // CSV format
  const escapeCsvField = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Flight ID',
    'Departure ICAO',
    'Arrival ICAO',
    'Aircraft Type',
    'Start Time (UTC)',
    'End Time (UTC)',
    'Duration (Seconds)',
    'Duration',
    'Distance (NM)',
    'Max Altitude (ft)',
    'Peak Ground Speed (kt)',
    'Landing Rate (fpm)',
    'Status',
  ];

  const rows = flights.map((f) => {
    const durationMins = Math.round(f.flightTimeSeconds / 60);
    const hours = Math.floor(durationMins / 60);
    const mins = durationMins % 60;
    const formattedDuration = `${hours}h ${mins.toString().padStart(2, '0')}m`;

    return [
      escapeCsvField(f.id),
      escapeCsvField(f.departureIcao || ''),
      escapeCsvField(f.arrivalIcao || ''),
      escapeCsvField(f.aircraftType || ''),
      escapeCsvField(f.startTime || ''),
      escapeCsvField(f.endTime || ''),
      escapeCsvField(f.flightTimeSeconds || 0),
      escapeCsvField(formattedDuration),
      escapeCsvField(Number((f.distanceFlownNm || 0).toFixed(1))),
      escapeCsvField(f.maxAltitude || 0),
      escapeCsvField(f.maxGroundSpeed || 0),
      escapeCsvField(f.landingRateFpm !== undefined && f.landingRateFpm !== null ? Math.round(f.landingRateFpm) : ''),
      escapeCsvField(f.status || 'COMPLETED'),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

export const computeVisitedCountries = (
  flights: FlightRecord[],
  visitedAirports: VisitedAirport[]
): VisitedCountry[] => {
  const countryMap = new Map<string, VisitedCountry>();

  const getAirportCountry = (icao: string): { isoA2: string; name: string } | null => {
    const found = visitedAirports.find((a) => a.icao === icao);
    if (found) {
      return { isoA2: found.countryCode, name: found.countryName };
    }
    return null;
  };

  flights.forEach((fl) => {
    // Collect unique countries visited across departure, touchdowns, and arrival for THIS flight
    const flightCountries = new Map<string, { isoA2: string; name: string }>();
    if (fl.departureIcao) {
      const depCountry = getAirportCountry(fl.departureIcao);
      if (depCountry) flightCountries.set(depCountry.isoA2, depCountry);
    }
    if (fl.arrivalIcao) {
      const arrCountry = getAirportCountry(fl.arrivalIcao);
      if (arrCountry) flightCountries.set(arrCountry.isoA2, arrCountry);
    }
    if (fl.touchdowns) {
      for (const td of fl.touchdowns) {
        if (td.airportIcao) {
          const tdCountry = getAirportCountry(td.airportIcao);
          if (tdCountry) flightCountries.set(tdCountry.isoA2, tdCountry);
        }
      }
    }
    const flightTime = fl.endTime || fl.startTime;

    for (const country of flightCountries.values()) {
      const existing = countryMap.get(country.isoA2);
      if (existing) {
        existing.flightCount += 1;
        if (new Date(flightTime) > new Date(existing.lastVisited)) {
          existing.lastVisited = flightTime;
        }
        if (new Date(flightTime) < new Date(existing.firstVisited)) {
          existing.firstVisited = flightTime;
        }
      } else {
        countryMap.set(country.isoA2, {
          isoA2: country.isoA2,
          name: country.name,
          firstVisited: flightTime,
          lastVisited: flightTime,
          flightCount: 1,
        });
      }
    }
  });

  return Array.from(countryMap.values()).sort((a, b) => b.flightCount - a.flightCount);
};

export interface FlightState {
  currentTelemetry: TelemetryData;
  activeFlight: FlightRecord | null;
  flightStage: FlightStage;
  flights: FlightRecord[];
  visitedAirports: VisitedAirport[];
  visitedCountries: VisitedCountry[];
  savedRoutes: SavedRoute[];
  currentGeneratedRoute: GeneratedRoute | null;
  selectedFlightId: string | null;
  scrubbedTelemetryIndex: number | null;
  activeView: 'dashboard' | 'new-route' | 'saved-routes' | 'logbook' | 'flight-detail' | 'visited' | 'ifr-trainer' | 'hold-trainer' | 'settings' | 'feedback';
  theme: 'light' | 'dark';
  dbInitialized: boolean;
  airportsCount: number;
  isSyncingAirports: boolean;
  syncProgress: { stage: string; percent: number; message: string } | null;
  lastSyncMessage: string | null;
  closeToTray: boolean;
  autoStartRecording: boolean;
  showEndFlightPrompt: boolean;
  nearestAirport: Airport | null;
  isLoadingFlightDetails: boolean;

  // Actions
  initFromDatabase: () => Promise<void>;
  fetchSavedRoutes: () => Promise<SavedRoute[]>;
  setCurrentGeneratedRoute: (route: GeneratedRoute | null) => void;
  saveRoute: (route: Partial<SavedRoute> & { departureIcao: string; arrivalIcao: string }) => Promise<SavedRoute | null>;
  toggleRouteFavorite: (id: string) => Promise<boolean>;
  updateRouteStatus: (id: string, status: 'draft' | 'flown', linkedFlightId?: string) => Promise<void>;
  deleteSavedRoute: (id: string) => Promise<void>;
  loadFlightDetails: (id: string) => Promise<FlightRecord | null>;
  fetchAirportsCount: () => Promise<void>;
  fetchNearestAirport: (lat: number, lon: number, radiusNm?: number) => Promise<Airport | null>;
  syncOurAirports: () => Promise<any>;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setActiveView: (view: FlightState['activeView']) => void;
  setSelectedFlightId: (id: string | null) => void;
  setScrubbedTelemetryIndex: (index: number | null) => void;
  setCloseToTray: (enabled: boolean) => Promise<void>;
  setAutoStartRecording: (enabled: boolean) => void;
  setShowEndFlightPrompt: (show: boolean) => void;
  updateTelemetry: (telemetry: Partial<TelemetryData>) => void;
  startManualFlight: (depIcao: string, arrIcao: string, aircraft: string) => void;
  endActiveFlight: () => Promise<void>;
  deleteFlight: (id: string) => Promise<void>;
  exportFlight: (id: string, format: ExportFormat) => Promise<string | null>;
  exportLogbook: (format: LogbookExportFormat, flightsOverride?: FlightRecord[]) => Promise<string | null>;
  addVisitedAirport: (airport: VisitedAirport) => void;
}

const DEFAULT_TELEMETRY: TelemetryData = {
  simConnected: false,
  latitude: 0,
  longitude: 0,
  altitudeMsl: 0,
  altitudeAgl: 0,
  indicatedAirspeed: 0,
  trueAirspeed: 0,
  groundSpeed: 0,
  verticalSpeed: 0,
  pitch: 0,
  bank: 0,
  heading: 0,
  aircraftTitle: 'Standby (Waiting for MSFS)',
  isOnGround: true,
  isEngineRunning: false,
  nav1Obs: 0,
  nav1RelativeBearing: 0,
  nav1DmeDistance: 0,
  nav1DmeSpeed: 0,
  nav2Obs: 0,
  nav2RelativeBearing: 0,
  nav2DmeDistance: 0,
  nav2DmeSpeed: 0,
  adf1RelativeBearing: 0,
  timestamp: new Date().toISOString(),
};

// Batch buffer for SQLite writes
let telemetryBuffer: TelemetryPoint[] = [];
let lastFlushTimestamp = Date.now();
let stoppedSinceTimestamp: number | null = null;

async function flushTelemetryBuffer() {
  if (telemetryBuffer.length === 0) return;
  const toSend = [...telemetryBuffer];
  telemetryBuffer = [];
  lastFlushTimestamp = Date.now();

  await safeInvoke('save_telemetry_batch', { points: toSend });
}

function hydrateSavedRoute(r: any): SavedRoute {
  let sectors: any[] = [];
  try {
    sectors = JSON.parse(r.sectorsJson || '[]');
  } catch {}
  const intermediateIcaos =
    r.intermediateIcaos ||
    (Array.isArray(sectors) && sectors.length > 1
      ? JSON.stringify(sectors.slice(0, -1).map((s: any) => s.arrival?.icao).filter(Boolean))
      : '[]');
  return {
    ...r,
    aircraftName: r.aircraftName || 'Aircraft',
    sectorCount: r.sectorCount ?? (Array.isArray(sectors) && sectors.length > 0 ? sectors.length : 1),
    includeGroundTime: r.includeGroundTime ?? true,
    isRoundTrip: r.isRoundTrip ?? false,
    intermediateIcaos,
    sectors: Array.isArray(sectors) ? sectors : [],
  };
}

async function checkAndMarkFlownSavedRoutes(
  completedFlight: FlightRecord,
  savedRoutes: SavedRoute[],
  updateRouteStatus: (id: string, status: 'draft' | 'flown', linkedFlightId?: string) => Promise<void>
) {
  const dep = (completedFlight.departureIcao || '').toUpperCase().trim();
  const arr = (completedFlight.arrivalIcao || '').toUpperCase().trim();
  if (!dep || !arr || dep === 'ZZZZ' || arr === 'ZZZZ') return;

  // Collect distinct touchdown ICAOs in sequence
  const tdIcaos: string[] = [];
  if (completedFlight.touchdowns) {
    for (const td of completedFlight.touchdowns) {
      if (td.airportIcao) {
        const icao = td.airportIcao.toUpperCase().trim();
        if (tdIcaos.length === 0 || tdIcaos[tdIcaos.length - 1] !== icao) {
          tdIcaos.push(icao);
        }
      }
    }
  }

  for (const sr of savedRoutes) {
    if (sr.status === 'flown') continue;
    const srDep = (sr.departureIcao || '').toUpperCase().trim();
    const srArr = (sr.arrivalIcao || '').toUpperCase().trim();

    if (srDep !== dep || srArr !== arr) continue;

    let intermediates: string[] = [];
    try {
      intermediates = JSON.parse(sr.intermediateIcaos || '[]');
    } catch {
      intermediates = [];
    }

    if (intermediates.length === 0) {
      // Single sector route: dep & arr match
      await updateRouteStatus(sr.id, 'flown', completedFlight.id);
    } else {
      // Multi sector route: all intermediate airports must have landed in sequence
      let intermediateIdx = 0;
      for (const td of tdIcaos) {
        if (intermediateIdx < intermediates.length && td === intermediates[intermediateIdx].toUpperCase().trim()) {
          intermediateIdx++;
        }
      }
      if (intermediateIdx === intermediates.length) {
        await updateRouteStatus(sr.id, 'flown', completedFlight.id);
      }
    }
  }
}

export const useFlightStore = create<FlightState>()(
  persist(
    (set, get) => ({
      currentTelemetry: DEFAULT_TELEMETRY,
      activeFlight: null,
      flightStage: 'BOARDING',
      flights: [],
      visitedAirports: [],
      visitedCountries: [],
      savedRoutes: [],
      currentGeneratedRoute: null,
      selectedFlightId: null,
      scrubbedTelemetryIndex: null,
      activeView: 'dashboard',
      theme: (() => {
        try {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem('apollo-flight-store');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.state?.theme === 'dark' || parsed?.state?.theme === 'light') {
                return parsed.state.theme;
              }
            }
          }
        } catch {}
        return 'light';
      })(),
      dbInitialized: false,
      airportsCount: 75,
      isSyncingAirports: false,
      syncProgress: null,
      lastSyncMessage: null,
      closeToTray: false,
      autoStartRecording: true,
      showEndFlightPrompt: false,
      nearestAirport: null,
      isLoadingFlightDetails: false,

      fetchNearestAirport: async (lat: number, lon: number, radiusNm = 25.0) => {
        if (lat === 0 && lon === 0) return null;
        try {
          const apt = await safeInvoke<Airport>('search_airports_near', {
            lat,
            lon,
            radiusNm,
          });
          if (apt) {
            set({ nearestAirport: apt });
          }
          return apt;
        } catch {
          return null;
        }
      },

      fetchAirportsCount: async () => {
        const count = await safeInvoke<number>('get_airports_count');
        if (typeof count === 'number' && count > 0) {
          set({ airportsCount: count });
        }
      },

      setCloseToTray: async (enabled: boolean) => {
        set({ closeToTray: enabled });
        await safeInvoke('set_close_to_tray', { enabled });
        await safeInvoke('set_user_setting', { key: 'closeToTray', value: String(enabled) });
      },

      setAutoStartRecording: (enabled: boolean) => {
        set({ autoStartRecording: enabled });
        safeInvoke('set_user_setting', { key: 'autoStartRecording', value: String(enabled) });
      },

      setShowEndFlightPrompt: (show: boolean) => {
        if (!show) {
          // Reset stopped timer so prompt doesn't instantly retrigger
          stoppedSinceTimestamp = null;
        }
        set({ showEndFlightPrompt: show });
      },

      syncOurAirports: async () => {
        if (get().activeFlight) {
          const msg = 'Cannot update OurAirports dataset while a flight recording is active.';
          set({ lastSyncMessage: msg });
          return { success: false, message: msg };
        }

        set({
          isSyncingAirports: true,
          syncProgress: { stage: 'starting', percent: 0, message: 'Initializing dataset synchronization...' },
          lastSyncMessage: 'Initializing dataset synchronization...',
        });

        let unlisten: (() => void) | null = null;
        try {
          if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
            const { listen } = await import('@tauri-apps/api/event');
            unlisten = await listen<any>('ourairports-sync-progress', (event) => {
              if (event?.payload) {
                set({
                  syncProgress: event.payload,
                  lastSyncMessage: event.payload.message || 'Syncing...',
                });
              }
            });
          }

          const result = await safeInvoke<any>('sync_ourairports');
          if (result && result.success) {
            set({
              airportsCount: result.totalAirports,
              isSyncingAirports: false,
              syncProgress: { stage: 'complete', percent: 100, message: result.message },
              lastSyncMessage: result.message,
            });
            setTimeout(() => {
              set({ syncProgress: null });
            }, 4000);
            return result;
          } else {
            set({
              isSyncingAirports: false,
              syncProgress: null,
              lastSyncMessage: result?.message || 'Sync failed or not supported in web mode',
            });
            return null;
          }
        } catch (err: any) {
          set({
            isSyncingAirports: false,
            syncProgress: null,
            lastSyncMessage: `Sync failed: ${err?.message || err}`,
          });
          return null;
        } finally {
          if (unlisten) {
            unlisten();
          }
        }
      },

      initFromDatabase: async () => {
        try {
          const dbFlights = await safeInvoke<FlightRecord[]>('get_flights');
          const dbStats = await safeInvoke<any>('get_visited_stats');
          const count = await safeInvoke<number>('get_airports_count');
          const closeToTrayVal = await safeInvoke<boolean>('get_close_to_tray');

          if (typeof closeToTrayVal === 'boolean') {
            set({ closeToTray: closeToTrayVal });
          }

          if (typeof count === 'number' && count > 0) {
            set({ airportsCount: count });
          }

          // Load persisted user settings from SQLite (logbook.db)
          const dbSettings = await safeInvoke<Record<string, string>>('get_all_user_settings');
          if (dbSettings && Object.keys(dbSettings).length > 0) {
            if (dbSettings.theme === 'dark' || dbSettings.theme === 'light') {
              get().setTheme(dbSettings.theme);
            }
            if (typeof dbSettings.closeToTray === 'string') {
              set({ closeToTray: dbSettings.closeToTray === 'true' });
            }
            if (typeof dbSettings.autoStartRecording === 'string') {
              set({ autoStartRecording: dbSettings.autoStartRecording === 'true' });
            }
          } else {
            // Seed existing preferences into logbook.db user_settings table on initial migration
            const currentTheme = get().theme;
            const currentCloseToTray = get().closeToTray;
            const currentAutoStart = get().autoStartRecording;
            await safeInvoke('set_user_setting', { key: 'theme', value: currentTheme });
            await safeInvoke('set_user_setting', { key: 'closeToTray', value: String(currentCloseToTray) });
            await safeInvoke('set_user_setting', { key: 'autoStartRecording', value: String(currentAutoStart) });
          }

          if (dbFlights && Array.isArray(dbFlights) && dbFlights.length > 0) {
            const initialId = get().selectedFlightId || dbFlights[0]?.id || null;
            set({ flights: dbFlights, selectedFlightId: initialId });
            if (initialId) {
              get().loadFlightDetails(initialId);
            }
            // Auto-heal any legacy flights with 0 distance in the background
            const needsHealing = dbFlights.filter((f) => !f.distanceFlownNm || f.distanceFlownNm <= 0);
            for (const f of needsHealing) {
              if (f.id !== initialId) {
                get().loadFlightDetails(f.id);
              }
            }
          }

          if (dbStats?.visitedAirports) {
            set({
              visitedAirports: dbStats.visitedAirports,
              visitedCountries: dbStats.visitedCountries || computeVisitedCountries(get().flights, dbStats.visitedAirports),
            });
          }
          await get().fetchSavedRoutes();
          set({ dbInitialized: true });
        } catch (err) {
          console.warn('[flightStore] Could not load from SQLite backend, using local store:', err);
        }
      },

      fetchSavedRoutes: async () => {
        try {
          const list = await safeInvoke<SavedRoute[]>('get_saved_routes');
          if (list && Array.isArray(list)) {
            const hydrated = list.map(hydrateSavedRoute);
            if (hydrated.length > 0) {
              set({ savedRoutes: hydrated });
              return hydrated;
            } else if (get().savedRoutes.length > 0) {
              // Sync existing cached routes to SQLite backend
              for (const r of get().savedRoutes) {
                await safeInvoke('save_route', { route: r });
              }
              return get().savedRoutes;
            } else {
              set({ savedRoutes: [] });
              return [];
            }
          }
        } catch (err) {
          console.warn('[flightStore] Failed to fetch saved routes:', err);
        }
        return get().savedRoutes;
      },

      setCurrentGeneratedRoute: (route) => {
        set({ currentGeneratedRoute: route });
      },

      saveRoute: async (routeInput) => {
        // If an id was provided, check if it exists; otherwise check if an identical route is already saved
        const existing = get().savedRoutes.find((r) => {
          if (routeInput.id && r.id === routeInput.id) return true;
          return (
            r.departureIcao === routeInput.departureIcao &&
            r.arrivalIcao === routeInput.arrivalIcao &&
            r.aircraftCategory === routeInput.aircraftCategory &&
            r.totalDistanceNm === routeInput.totalDistanceNm &&
            (routeInput.intermediateIcaos ? r.intermediateIcaos === routeInput.intermediateIcaos : true)
          );
        });

        const id = routeInput.id || existing?.id || `route-${Date.now()}`;
        const now = new Date().toISOString();
        const sectors = routeInput.sectors || existing?.sectors || [];
        const sectorsJson = routeInput.sectorsJson || existing?.sectorsJson || JSON.stringify(sectors);
        const sectorCount = routeInput.sectorCount ?? (sectors.length > 0 ? sectors.length : 1);
        const aircraftName = routeInput.aircraftName || existing?.aircraftName || 'Aircraft';
        const includeGroundTime = routeInput.includeGroundTime ?? existing?.includeGroundTime ?? true;
        const isRoundTrip = routeInput.isRoundTrip ?? existing?.isRoundTrip ?? false;

        const fullRoute: SavedRoute = {
          id,
          name: routeInput.name || existing?.name || `${routeInput.departureIcao} ➔ ${routeInput.arrivalIcao}`,
          aircraftName,
          aircraftCategory: routeInput.aircraftCategory || existing?.aircraftCategory || 'A',
          departureIcao: routeInput.departureIcao,
          arrivalIcao: routeInput.arrivalIcao,
          intermediateIcaos: routeInput.intermediateIcaos || existing?.intermediateIcaos || '[]',
          sectorCount,
          sectorsJson,
          sectors: sectors.length > 0 ? sectors : undefined,
          totalDistanceNm: routeInput.totalDistanceNm ?? existing?.totalDistanceNm ?? 0,
          totalAirborneMinutes: routeInput.totalAirborneMinutes ?? existing?.totalAirborneMinutes ?? 0,
          totalGroundMinutes: routeInput.totalGroundMinutes ?? existing?.totalGroundMinutes ?? 0,
          totalDurationMinutes: routeInput.totalDurationMinutes ?? existing?.totalDurationMinutes ?? 0,
          includeGroundTime,
          isRoundTrip,
          recommendedAltitudeFt: routeInput.recommendedAltitudeFt ?? existing?.recommendedAltitudeFt ?? null,
          status: routeInput.status || existing?.status || 'draft',
          isFavorite: routeInput.isFavorite !== undefined ? routeInput.isFavorite : (existing?.isFavorite ?? false),
          linkedFlightId: routeInput.linkedFlightId ?? existing?.linkedFlightId ?? null,
          createdAt: existing?.createdAt || routeInput.createdAt || now,
          flownAt: routeInput.flownAt ?? existing?.flownAt ?? null,
        };

        try {
          await safeInvoke('save_route', { route: fullRoute });
        } catch (err) {
          console.warn('[flightStore] Failed to save route to SQLite:', err);
        }

        const hydrated = hydrateSavedRoute(fullRoute);
        set((state) => ({
          savedRoutes: [hydrated, ...state.savedRoutes.filter((r) => r.id !== id)],
        }));
        return hydrated;
      },

      toggleRouteFavorite: async (id: string) => {
        let newFav = false;
        try {
          const res = await safeInvoke<boolean>('toggle_route_favorite', { id });
          if (typeof res === 'boolean') {
            newFav = res;
          } else {
            const existing = get().savedRoutes.find((r) => r.id === id);
            newFav = !existing?.isFavorite;
          }
        } catch {
          const existing = get().savedRoutes.find((r) => r.id === id);
          newFav = !existing?.isFavorite;
        }

        set((state) => ({
          savedRoutes: state.savedRoutes.map((r) => (r.id === id ? { ...r, isFavorite: newFav } : r)),
        }));
        return newFav;
      },

      updateRouteStatus: async (id: string, status: 'draft' | 'flown', linkedFlightId?: string) => {
        try {
          await safeInvoke('update_route_status', { id, status, linkedFlightId });
        } catch (err) {
          console.warn('[flightStore] Failed to update route status in SQLite:', err);
        }

        const flownAt = status === 'flown' ? new Date().toISOString() : null;
        set((state) => ({
          savedRoutes: state.savedRoutes.map((r) =>
            r.id === id ? { ...r, status, flownAt: flownAt ?? r.flownAt, linkedFlightId: linkedFlightId ?? r.linkedFlightId } : r
          ),
        }));
      },

      deleteSavedRoute: async (id: string) => {
        try {
          await safeInvoke('delete_saved_route', { id });
        } catch (err) {
          console.warn('[flightStore] Failed to delete route from SQLite:', err);
        }

        set((state) => ({
          savedRoutes: state.savedRoutes.filter((r) => r.id !== id),
        }));
      },

      loadFlightDetails: async (id: string) => {
        if (!id) return null;
        const currentFlights = get().flights;
        const existing = currentFlights.find((f) => f.id === id);

        // If telemetry points are already cached in memory, check if distance needs solving
        if (existing && existing.telemetryPoints && existing.telemetryPoints.length > 0) {
          if (!existing.distanceFlownNm || existing.distanceFlownNm <= 0) {
            const depApt = await resolveAirport(existing.departureIcao);
            const arrApt = await resolveAirport(existing.arrivalIcao);
            const solved = calculateRecordedFlightDistance(existing.telemetryPoints, depApt, arrApt);
            if (solved > 0) {
              const healed = { ...existing, distanceFlownNm: solved };
              set((state) => ({
                flights: state.flights.map((f) => (f.id === id ? healed : f)),
                activeFlight: state.activeFlight?.id === id ? { ...state.activeFlight, distanceFlownNm: solved } : state.activeFlight,
              }));
              safeInvoke('save_flight', { flight: healed }).catch(() => {});
              return healed;
            }
          }
          return existing;
        }

        set({ isLoadingFlightDetails: true });
        try {
          const details = await safeInvoke<{
            flight: FlightRecord;
            telemetryPoints: TelemetryPoint[];
          }>('get_flight_details', { id });

          if (details && details.flight) {
            const pts = details.telemetryPoints || [];
            let distance = details.flight.distanceFlownNm || 0;
            if (distance <= 0) {
              const depApt = await resolveAirport(details.flight.departureIcao);
              const arrApt = await resolveAirport(details.flight.arrivalIcao);
              distance = calculateRecordedFlightDistance(pts, depApt, arrApt);
            }

            const updatedFlight: FlightRecord = {
              ...details.flight,
              distanceFlownNm: distance,
              telemetryPoints: pts,
              touchdowns: details.flight.touchdowns || existing?.touchdowns,
            };

            set((state) => ({
              flights: state.flights.map((f) => (f.id === id ? { ...f, ...updatedFlight } : f)),
              activeFlight: state.activeFlight?.id === id ? { ...state.activeFlight, distanceFlownNm: distance, telemetryPoints: pts } : state.activeFlight,
              isLoadingFlightDetails: false,
            }));

            if (distance > 0 && (!details.flight.distanceFlownNm || details.flight.distanceFlownNm <= 0)) {
              safeInvoke('save_flight', { flight: updatedFlight }).catch(() => {});
            }

            return updatedFlight;
          }
        } catch (err) {
          console.warn(`[flightStore] Failed to load details for flight ${id}:`, err);
        } finally {
          set({ isLoadingFlightDetails: false });
        }

        return existing || null;
      },

      setTheme: (theme: 'light' | 'dark') => {
        if (typeof document !== 'undefined') {
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        set({ theme });
        safeInvoke('set_user_setting', { key: 'theme', value: theme });
      },

      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(next);
      },

      setActiveView: (view) => set({ activeView: view }),
      setSelectedFlightId: (id) => {
        set({ selectedFlightId: id, scrubbedTelemetryIndex: null });
        if (id) {
          get().loadFlightDetails(id);
        }
      },
      setScrubbedTelemetryIndex: (index) => set({ scrubbedTelemetryIndex: index }),

      updateTelemetry: async (newData) => {
        const prev = get().currentTelemetry;
        const current: TelemetryData = { ...prev, ...newData, timestamp: new Date().toISOString() };
        let active = get().activeFlight;
        let flights = get().flights;
        let currentStage = get().flightStage;

        // Auto-fetch nearest airport when position shifts or not set
        const lastApt = get().nearestAirport;
        const coordsMoved = !lastApt || Math.abs(prev.latitude - current.latitude) > 0.05 || Math.abs(prev.longitude - current.longitude) > 0.05;
        if (coordsMoved && (current.latitude !== 0 || current.longitude !== 0)) {
          get().fetchNearestAirport(current.latitude, current.longitude);
        }

        // Auto-flight start triggers (Item 4 in FIXES.md):
        // 1. Moving faster than 20kt
        // 2. Engine started (combustion 0 -> 1)
        if (!active && current.simConnected && get().autoStartRecording && !get().isSyncingAirports) {
          const engineStarted = !prev.isEngineRunning && current.isEngineRunning;
          const speedOver20 = current.groundSpeed > 20;

          if (speedOver20 || engineStarted) {
            currentStage = speedOver20 ? 'TAKEOFF_CLIMB' : 'TAXI_OUT';

            // Resolve nearest airport for departure
            let originIcao = 'ZZZZ';
            const airportLookup = await safeInvoke<any>('search_airports_near', {
              lat: current.latitude,
              lon: current.longitude,
              radiusNm: 5.0,
            });

            const depApt = airportLookup || get().nearestAirport;
            if (depApt) {
              originIcao = depApt.icao;
            }

            const newFlightId = `fl-${Date.now()}`;
            const initialPoint: TelemetryPoint = {
              flightId: newFlightId,
              timestamp: new Date().toISOString(),
              latitude: current.latitude,
              longitude: current.longitude,
              altitudeMsl: current.altitudeMsl,
              altitudeAgl: current.altitudeAgl,
              indicatedAirspeed: current.indicatedAirspeed,
              groundSpeed: current.groundSpeed,
              heading: current.heading,
              pitch: current.pitch,
              bank: current.bank,
              verticalSpeed: current.verticalSpeed,
              isOnGround: current.isOnGround,
            };

            const newFlight: FlightRecord = {
              id: newFlightId,
              aircraftType: current.aircraftTitle && current.aircraftTitle !== 'Standby (Waiting for MSFS)'
                ? current.aircraftTitle
                : 'MSFS Aircraft',
              departureIcao: originIcao,
              arrivalIcao: 'TBD',
              startTime: new Date().toISOString(),
              flightTimeSeconds: 0,
              maxAltitude: Math.round(current.altitudeMsl),
              maxGroundSpeed: Math.round(current.groundSpeed),
              distanceFlownNm: 0,
              status: 'RECORDING',
              isManualFlight: false,
              touchdowns: [],
              telemetryPoints: [initialPoint],
            };

            safeInvoke('save_flight', { flight: newFlight });
            telemetryBuffer.push(initialPoint);
            stoppedSinceTimestamp = null;

            if (depApt) {
              get().addVisitedAirport({
                icao: depApt.icao,
                name: depApt.name,
                countryCode: depApt.countryCode,
                countryName: depApt.countryName || depApt.country,
                latitude: depApt.latitude || depApt.lat,
                longitude: depApt.longitude || depApt.lon,
                firstVisited: new Date().toISOString(),
                lastVisited: new Date().toISOString(),
                visitCount: 1,
              });
            }

            set({ activeFlight: newFlight, currentTelemetry: current, flightStage: currentStage, showEndFlightPrompt: false });
            return;
          }
        }

        // 7-Stage Flight Lifecycle State Machine (when no active flight)
        if (!active) {
          if (current.isOnGround && current.groundSpeed < 3) {
            currentStage = 'BOARDING';
          } else if (current.isOnGround && current.groundSpeed >= 3 && current.groundSpeed <= 40) {
            currentStage = 'TAXI_OUT';
          }
        }

        // Active Flight In-Progress Processing
        if (active) {
          const lastPoint = active.telemetryPoints[active.telemetryPoints.length - 1];
          const newPoint: TelemetryPoint = {
            flightId: active.id,
            timestamp: new Date().toISOString(),
            latitude: current.latitude,
            longitude: current.longitude,
            altitudeMsl: current.altitudeMsl,
            altitudeAgl: current.altitudeAgl,
            indicatedAirspeed: current.indicatedAirspeed,
            groundSpeed: current.groundSpeed,
            heading: current.heading,
            pitch: current.pitch,
            bank: current.bank,
            verticalSpeed: current.verticalSpeed,
            isOnGround: current.isOnGround,
          };

          // Add to telemetry batch buffer
          telemetryBuffer.push(newPoint);
          if (telemetryBuffer.length >= 20 || Date.now() - lastFlushTimestamp > 5000) {
            flushTelemetryBuffer();
          }

          let distInc = 0;
          if (lastPoint) {
            const rad = Math.PI / 180;
            const dLat = (current.latitude - lastPoint.latitude) * rad;
            const dLon = (current.longitude - lastPoint.longitude) * rad;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lastPoint.latitude * rad) *
                Math.cos(current.latitude * rad) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            distInc = 3440.065 * c;
          }

          // Stage determination while airborne
          if (!current.isOnGround) {
            if (current.verticalSpeed < -300) {
              currentStage = 'DESCENT_APPROACH';
            } else if (Math.abs(current.verticalSpeed) <= 150) {
              currentStage = 'ENROUTE_CRUISE';
            } else {
              currentStage = 'TAKEOFF_CLIMB';
            }
          }

          let currentTouchdowns = active.touchdowns ? [...active.touchdowns] : [];

          // TOUCHDOWN_ROLLOUT: transition from air to ground (captures each touchdown)
          if (prev && !prev.isOnGround && current.isOnGround) {
            currentStage = 'TOUCHDOWN_ROLLOUT';

            const now = Date.now();
            const lastTd = currentTouchdowns[currentTouchdowns.length - 1];
            const lastTdTime = lastTd ? new Date(lastTd.timestamp).getTime() : 0;
            // Debounce 4 seconds to prevent micro-gear bounces from registering as distinct landings
            if (now - lastTdTime > 4000) {
              const vsAtTouchdown = (current.verticalSpeed !== undefined && current.verticalSpeed < 0)
                ? current.verticalSpeed
                : (prev && prev.verticalSpeed !== undefined && prev.verticalSpeed < 0 ? prev.verticalSpeed : -140);

              let tdIcao: string | undefined = undefined;
              let tdName: string | undefined = undefined;
              try {
                const nearApt = await safeInvoke<Airport>('search_airports_near', {
                  lat: current.latitude,
                  lon: current.longitude,
                  radiusNm: 3.0,
                });
                if (nearApt) {
                  tdIcao = nearApt.icao;
                  tdName = nearApt.name;
                }
              } catch {}

              currentTouchdowns.push({
                timestamp: current.timestamp || new Date().toISOString(),
                verticalSpeedFpm: Math.round(vsAtTouchdown),
                groundSpeedKt: Math.round(current.groundSpeed),
                pitchDeg: current.pitch !== undefined ? Number(current.pitch.toFixed(1)) : undefined,
                bankDeg: current.bank !== undefined ? Number(current.bank.toFixed(1)) : undefined,
                latitude: current.latitude,
                longitude: current.longitude,
                altitudeMsl: Math.round(current.altitudeMsl),
                gForce: calculateTouchdownGForce(vsAtTouchdown),
                airportIcao: tdIcao,
                airportName: tdName,
              });
            }
          }

          // Auto-stop triggers (Item 4 in FIXES.md):
          // Aircraft stopped for 30s AND one or more engines turned off
          const isAircraftStopped = current.isOnGround && current.groundSpeed < 2.0;
          if (isAircraftStopped) {
            if (stoppedSinceTimestamp === null) {
              stoppedSinceTimestamp = Date.now();
            }
          } else {
            stoppedSinceTimestamp = null;
          }

          const stoppedDurationSeconds = stoppedSinceTimestamp ? (Date.now() - stoppedSinceTimestamp) / 1000 : 0;
          const isEngineOff = !current.isEngineRunning;

          if (stoppedDurationSeconds >= 30 && isEngineOff) {
            // Safeguard for manual start: prompt user instead of automatically ending
            if (active.isManualFlight) {
              if (!get().showEndFlightPrompt) {
                set({ showEndFlightPrompt: true });
              }
            } else {
              // Auto-started flight: complete recording
              stoppedSinceTimestamp = null;

              let arrIcao = 'ZZZZ';
              const arrLookup = await safeInvoke<any>('search_airports_near', {
                lat: current.latitude,
                lon: current.longitude,
                radiusNm: 5.0,
              });
              const arrApt = arrLookup || get().nearestAirport;
              if (arrApt) {
                arrIcao = arrApt.icao;
              }

              const [depApt, resolvedArrApt] = await Promise.all([
                resolveAirport(active.departureIcao),
                arrApt ? Promise.resolve(arrApt) : resolveAirport(arrIcao),
              ]);

              const allPoints = [...active.telemetryPoints, newPoint];
              const totalDistanceNm = calculateRecordedFlightDistance(allPoints, depApt, resolvedArrApt);

              const avgLandingRate = computeAverageTouchdownRate(currentTouchdowns, current.verticalSpeed);

              const completedFlight: FlightRecord = {
                ...active,
                arrivalIcao: arrIcao,
                endTime: new Date().toISOString(),
                status: 'COMPLETED',
                landingRateFpm: avgLandingRate,
                touchdowns: currentTouchdowns,
                flightTimeSeconds: active.flightTimeSeconds + 1,
                maxAltitude: Math.max(active.maxAltitude, Math.round(current.altitudeMsl)),
                maxGroundSpeed: Math.max(active.maxGroundSpeed, Math.round(current.groundSpeed)),
                distanceFlownNm: totalDistanceNm,
                telemetryPoints: allPoints,
              };

              flushTelemetryBuffer();
              safeInvoke('save_flight', { flight: completedFlight });

              // Record unique airports visited on this flight
              const uniqueAirportIcaos = new Set<string>();
              if (depApt) uniqueAirportIcaos.add(depApt.icao);
              if (resolvedArrApt) uniqueAirportIcaos.add(resolvedArrApt.icao);
              for (const td of currentTouchdowns) {
                if (td.airportIcao) uniqueAirportIcaos.add(td.airportIcao);
              }

              for (const icao of uniqueAirportIcaos) {
                const aptToRecord = (depApt && depApt.icao === icao) ? depApt : (resolvedArrApt && resolvedArrApt.icao === icao) ? resolvedArrApt : null;
                if (aptToRecord) {
                  get().addVisitedAirport({
                    icao: aptToRecord.icao,
                    name: aptToRecord.name,
                    countryCode: aptToRecord.countryCode,
                    countryName: aptToRecord.countryName || (aptToRecord as any).country,
                    latitude: aptToRecord.latitude || (aptToRecord as any).lat,
                    longitude: aptToRecord.longitude || (aptToRecord as any).lon,
                    firstVisited: new Date().toISOString(),
                    lastVisited: new Date().toISOString(),
                    visitCount: 1,
                  });
                }
              }

              const updatedFlights = [completedFlight, ...flights.filter((f) => f.id !== completedFlight.id)];
              set({
                activeFlight: null,
                flightStage: 'ARRIVED',
                flights: updatedFlights,
                selectedFlightId: completedFlight.id,
                currentTelemetry: current,
                showEndFlightPrompt: false,
                visitedCountries: computeVisitedCountries(updatedFlights, get().visitedAirports),
              });
              checkAndMarkFlownSavedRoutes(completedFlight, get().savedRoutes, get().updateRouteStatus);
              return;
            }
          }

          const updatedActive: FlightRecord = {
            ...active,
            touchdowns: currentTouchdowns,
            flightTimeSeconds: active.flightTimeSeconds + 1,
            maxAltitude: Math.max(active.maxAltitude, Math.round(current.altitudeMsl)),
            maxGroundSpeed: Math.max(active.maxGroundSpeed, Math.round(current.groundSpeed)),
            distanceFlownNm: Number((active.distanceFlownNm + (isNaN(distInc) ? 0 : distInc)).toFixed(1)),
            telemetryPoints: [...active.telemetryPoints, newPoint],
          };

          set({ activeFlight: updatedActive, flightStage: currentStage, currentTelemetry: current });
          return;
        }

        set({ currentTelemetry: current, flightStage: currentStage });
      },

      startManualFlight: (depIcao, arrIcao, aircraft) => {
        const state = get();
        if (state.isSyncingAirports) {
          console.warn('Cannot start flight recording while OurAirports dataset sync is in progress');
          return;
        }
        const newFlightId = `fl-${Date.now()}`;
        const newFlight: FlightRecord = {
          id: newFlightId,
          aircraftType: aircraft || (state.currentTelemetry.aircraftTitle !== 'Standby (Waiting for MSFS)' ? state.currentTelemetry.aircraftTitle : 'MSFS Aircraft'),
          departureIcao: depIcao.toUpperCase() || 'ZZZZ',
          arrivalIcao: arrIcao.toUpperCase() || 'ZZZZ',
          startTime: new Date().toISOString(),
          flightTimeSeconds: 0,
          maxAltitude: Math.round(state.currentTelemetry.altitudeMsl),
          maxGroundSpeed: Math.round(state.currentTelemetry.groundSpeed),
          distanceFlownNm: 0,
          status: 'RECORDING',
          isManualFlight: true,
          touchdowns: [],
          telemetryPoints: [],
        };
        safeInvoke('save_flight', { flight: newFlight });
        stoppedSinceTimestamp = null;
        set({ activeFlight: newFlight, flightStage: 'TAKEOFF_CLIMB', showEndFlightPrompt: false });
      },

      endActiveFlight: async () => {
        const { activeFlight, flights, currentTelemetry, visitedAirports } = get();
        if (!activeFlight) return;

        let arrIcao = activeFlight.arrivalIcao;
        if (arrIcao === 'TBD' || arrIcao === 'ZZZZ') {
          const arrLookup = await safeInvoke<any>('search_airports_near', {
            lat: currentTelemetry.latitude,
            lon: currentTelemetry.longitude,
            radiusNm: 5.0,
          });
          const arrApt = arrLookup || get().nearestAirport;
          if (arrApt) {
            arrIcao = arrApt.icao;
          }
        }

        const [depApt, resolvedArrApt] = await Promise.all([
          resolveAirport(activeFlight.departureIcao),
          resolveAirport(arrIcao),
        ]);

        const allPoints = activeFlight.telemetryPoints || [];
        const totalDistanceNm = calculateRecordedFlightDistance(allPoints, depApt, resolvedArrApt);

        const tds = activeFlight.touchdowns || [];
        const avgLandingRate = computeAverageTouchdownRate(tds, currentTelemetry.verticalSpeed);

        const completedFlight: FlightRecord = {
          ...activeFlight,
          arrivalIcao: arrIcao,
          endTime: new Date().toISOString(),
          status: 'COMPLETED',
          landingRateFpm: avgLandingRate,
          touchdowns: tds,
          distanceFlownNm: totalDistanceNm,
        };

        flushTelemetryBuffer();
        safeInvoke('save_flight', { flight: completedFlight });
        stoppedSinceTimestamp = null;

        // Record unique airports visited on this flight
        const uniqueAirportIcaos = new Set<string>();
        if (depApt) uniqueAirportIcaos.add(depApt.icao);
        if (resolvedArrApt) uniqueAirportIcaos.add(resolvedArrApt.icao);
        for (const td of tds) {
          if (td.airportIcao) uniqueAirportIcaos.add(td.airportIcao);
        }

        for (const icao of uniqueAirportIcaos) {
          const aptToRecord = (depApt && depApt.icao === icao) ? depApt : (resolvedArrApt && resolvedArrApt.icao === icao) ? resolvedArrApt : null;
          if (aptToRecord) {
            get().addVisitedAirport({
              icao: aptToRecord.icao,
              name: aptToRecord.name,
              countryCode: aptToRecord.countryCode,
              countryName: aptToRecord.countryName || (aptToRecord as any).country,
              latitude: aptToRecord.latitude || (aptToRecord as any).lat,
              longitude: aptToRecord.longitude || (aptToRecord as any).lon,
              firstVisited: new Date().toISOString(),
              lastVisited: new Date().toISOString(),
              visitCount: 1,
            });
          }
        }

        const updatedFlights = [completedFlight, ...flights.filter((f) => f.id !== completedFlight.id)];
        set({
          activeFlight: null,
          flights: updatedFlights,
          selectedFlightId: completedFlight.id,
          flightStage: 'ARRIVED',
          showEndFlightPrompt: false,
          visitedCountries: computeVisitedCountries(updatedFlights, visitedAirports),
        });
        checkAndMarkFlownSavedRoutes(completedFlight, get().savedRoutes, get().updateRouteStatus);
      },

      deleteFlight: async (id) => {
        await safeInvoke('delete_flight', { id });
        const updated = get().flights.filter((f) => f.id !== id);
        set({
          flights: updated,
          selectedFlightId: get().selectedFlightId === id ? updated[0]?.id || null : get().selectedFlightId,
          visitedCountries: computeVisitedCountries(updated, get().visitedAirports),
        });
      },

      exportFlight: async (id, format) => {
        let content = await safeInvoke<string>('export_flight', { id, format });
        const flight = get().flights.find((f) => f.id === id);

        if (!content && flight) {
          content = generateFlightExport(flight, format);
        }

        if (content && typeof document !== 'undefined') {
          const mimeTypes: Record<ExportFormat, string> = {
            gpx: 'application/gpx+xml',
            kml: 'application/vnd.google-earth.kml+xml',
            geojson: 'application/geo+json',
            csv: 'text/csv',
            json: 'application/json',
          };
          const dep = flight?.departureIcao || 'DEP';
          const arr = flight?.arrivalIcao || 'ARR';
          const dateStr = flight?.startTime ? flight.startTime.slice(0, 10) : 'flight';
          const filename = `${dep}_${arr}_${dateStr}.${format}`;

          const saved = await triggerFileSave(content, filename, format, mimeTypes[format] || 'text/plain');
          if (!saved) {
            // User cancelled in the Explorer file picker
            return null;
          }
        }

        return content;
      },

      exportLogbook: async (format, flightsOverride) => {
        const targetFlights = flightsOverride ?? get().flights;
        if (!targetFlights || targetFlights.length === 0) {
          return null;
        }

        let content: string | null = null;
        // Attempt backend export if no custom filtered list is provided
        if (!flightsOverride) {
          content = await safeInvoke<string>('export_logbook', { format });
        }

        // Fallback to client-side generator
        if (!content) {
          content = generateLogbookExport(targetFlights, format);
        }

        if (content && typeof document !== 'undefined') {
          const mimeTypes: Record<LogbookExportFormat, string> = {
            csv: 'text/csv',
            json: 'application/json',
          };
          const now = new Date().toISOString().slice(0, 10);
          const isFiltered = flightsOverride && flightsOverride.length !== get().flights.length;
          const filename = `apollo_logbook_${isFiltered ? 'filtered_' : ''}${now}.${format}`;

          const saved = await triggerFileSave(content, filename, format, mimeTypes[format]);
          if (!saved) {
            return null;
          }
        }

        return content;
      },

      addVisitedAirport: (airport) => {
        safeInvoke('record_airport_visit', {
          airport: {
            icao: airport.icao,
            name: airport.name,
            latitude: airport.latitude,
            longitude: airport.longitude,
            countryCode: airport.countryCode,
            countryName: airport.countryName,
          },
          timestamp: airport.lastVisited,
        });

        const current = get().visitedAirports;
        const existingIdx = current.findIndex((a) => a.icao === airport.icao);
        let updated: VisitedAirport[];

        if (existingIdx >= 0) {
          updated = [...current];
          updated[existingIdx] = {
            ...updated[existingIdx],
            visitCount: updated[existingIdx].visitCount + 1,
            lastVisited: airport.lastVisited,
          };
        } else {
          updated = [...current, airport];
        }

        set({
          visitedAirports: updated,
          visitedCountries: computeVisitedCountries(get().flights, updated),
        });
      },
    }),
    {
      name: 'apollo-flight-store',
      partialize: (state) => ({
        theme: state.theme,
        closeToTray: state.closeToTray,
        autoStartRecording: state.autoStartRecording,
        savedRoutes: state.savedRoutes,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          if (state.theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },
    }
  )
);
