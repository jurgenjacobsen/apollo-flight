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
  DeletedFlightRecord,
  ApolloExportScope,
  ApolloExportBundle,
} from '../types/flight';
import { SavedRoute, GeneratedRoute, RouteSector } from '../types/route';
import { calculateTouchdownGForce } from '../utils/touchdownPhysics';
import { calculateDistanceNm } from '../data/mockData';
import { resolveAirport } from '../services/routeGenerator';
import { saveFlightTelemetry, getFlightTelemetry, deleteFlightTelemetry } from '../utils/telemetryStorage';
import type { Update } from '@tauri-apps/plugin-updater';
import packageJson from '../../package.json';

/**
 * Formats flight duration in seconds for UI cards.
 * When flight duration reaches 60 minutes (>= 3600 seconds), formats as '0h 00min 00s'.
 * Otherwise formats as '0m 00s'.
 */
export function formatFlightDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '0m 00s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    const padMin = String(minutes).padStart(2, '0');
    const padSec = String(seconds).padStart(2, '0');
    return `${hours}h ${padMin}min ${padSec}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Formats flight duration for logbook tables and detail views.
 * When flight duration reaches 60 minutes (>= 3600 seconds or totalMins >= 60),
 * formats as '0h 00min' (e.g. '1h 05min', '2h 00min').
 * Otherwise formats as '0min' (e.g. '45min').
 */
export function formatLogbookDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '0min';
  const totalMins = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}min`;
  }

  return `${mins}min`;
}

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

export function sanitizeFlightRecord(raw: any): FlightRecord {
  const id = String(raw.id || raw.flightId || `flight-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const aircraftType = String(raw.aircraftType || raw.aircraft_type || raw.aircraft || raw.aircraftName || 'Unknown');
  const departureIcao = String(raw.departureIcao || raw.departure_icao || raw.dep || '').toUpperCase();
  const arrivalIcao = String(raw.arrivalIcao || raw.arrival_icao || raw.arr || '').toUpperCase();
  const startTime = raw.startTime || raw.start_time || raw.date || new Date().toISOString();
  const endTime = raw.endTime || raw.end_time || undefined;
  const flightTimeSeconds = Math.round(Number(raw.flightTimeSeconds ?? raw.flight_time_seconds ?? 0)) || 0;
  const maxAltitude = Math.round(Number(raw.maxAltitude ?? raw.max_altitude ?? 0)) || 0;
  const maxGroundSpeed = Math.round(Number(raw.maxGroundSpeed ?? raw.max_ground_speed ?? 0)) || 0;
  const distanceFlownNm = Number((Number(raw.distanceFlownNm ?? raw.distance_flown_nm ?? 0)).toFixed(1)) || 0;

  let landingRateFpm: number | undefined = undefined;
  if (raw.landingRateFpm !== undefined && raw.landingRateFpm !== null && !isNaN(Number(raw.landingRateFpm))) {
    landingRateFpm = Math.round(Number(raw.landingRateFpm));
  } else if (raw.landing_rate_fpm !== undefined && raw.landing_rate_fpm !== null && !isNaN(Number(raw.landing_rate_fpm))) {
    landingRateFpm = Math.round(Number(raw.landing_rate_fpm));
  }

  let status: 'RECORDING' | 'COMPLETED' | 'DISCARDED' = 'COMPLETED';
  const rawStatus = String(raw.status || '').toUpperCase();
  if (rawStatus === 'RECORDING' || rawStatus === 'COMPLETED' || rawStatus === 'DISCARDED') {
    status = rawStatus;
  }

  const touchdowns: TouchdownEvent[] | undefined = Array.isArray(raw.touchdowns)
    ? raw.touchdowns.map((td: any) => ({
        timestamp: td.timestamp || startTime,
        verticalSpeedFpm: Math.round(Number(td.verticalSpeedFpm ?? td.vertical_speed_fpm ?? td.vs ?? 0)),
        groundSpeedKt: td.groundSpeedKt !== undefined && td.groundSpeedKt !== null
          ? Math.round(Number(td.groundSpeedKt))
          : (td.ground_speed_kt !== undefined && td.ground_speed_kt !== null ? Math.round(Number(td.ground_speed_kt)) : undefined),
        pitchDeg: td.pitchDeg !== undefined && td.pitchDeg !== null
          ? Number(td.pitchDeg)
          : (td.pitch_deg !== undefined && td.pitch_deg !== null ? Number(td.pitch_deg) : undefined),
        bankDeg: td.bankDeg !== undefined && td.bankDeg !== null
          ? Number(td.bankDeg)
          : (td.bank_deg !== undefined && td.bank_deg !== null ? Number(td.bank_deg) : undefined),
        latitude: Number(td.latitude ?? td.lat) || 0,
        longitude: Number(td.longitude ?? td.lon ?? td.lng) || 0,
        altitudeMsl: td.altitudeMsl !== undefined && td.altitudeMsl !== null
          ? Math.round(Number(td.altitudeMsl))
          : (td.altitude_msl !== undefined && td.altitude_msl !== null ? Math.round(Number(td.altitude_msl)) : undefined),
        gForce: td.gForce !== undefined && td.gForce !== null
          ? Number(td.gForce)
          : (td.g_force !== undefined && td.g_force !== null ? Number(td.g_force) : undefined),
        airportIcao: td.airportIcao || td.airport_icao || td.airport || undefined,
        airportName: td.airportName || td.airport_name || undefined,
      }))
    : undefined;
  const rawTelemetry =
    raw.telemetryPoints ||
    raw.telemetry_points ||
    raw.telemetry ||
    raw.points ||
    raw.track ||
    raw.tracks ||
    [];

  const telemetryPoints: TelemetryPoint[] = Array.isArray(rawTelemetry)
    ? rawTelemetry.map((tp: any) => ({
        flightId: id,
        timestamp: tp.timestamp || tp.time || tp.ts || startTime,
        latitude: Number(tp.latitude ?? tp.lat) || 0,
        longitude: Number(tp.longitude ?? tp.lon ?? tp.lng) || 0,
        altitudeMsl: Math.round(Number(tp.altitudeMsl ?? tp.altitude_msl ?? tp.alt ?? tp.altitude) || 0),
        altitudeAgl: tp.altitudeAgl !== undefined && tp.altitudeAgl !== null
          ? Math.round(Number(tp.altitudeAgl))
          : (tp.altitude_agl !== undefined && tp.altitude_agl !== null
            ? Math.round(Number(tp.altitude_agl))
            : (tp.agl !== undefined && tp.agl !== null ? Math.round(Number(tp.agl)) : undefined)),
        indicatedAirspeed: Math.round(Number(tp.indicatedAirspeed ?? tp.indicated_airspeed ?? tp.ias ?? tp.airspeed) || 0),
        groundSpeed: Math.round(Number(tp.groundSpeed ?? tp.ground_speed ?? tp.gs) || 0),
        heading: Math.round(Number(tp.heading ?? tp.hdg) || 0),
        pitch: tp.pitch !== undefined && tp.pitch !== null ? Number(tp.pitch) : undefined,
        bank: tp.bank !== undefined && tp.bank !== null ? Number(tp.bank) : undefined,
        verticalSpeed: tp.verticalSpeed !== undefined && tp.verticalSpeed !== null
          ? Number(tp.verticalSpeed)
          : (tp.vertical_speed !== undefined && tp.vertical_speed !== null
            ? Number(tp.vertical_speed)
            : (tp.vs !== undefined && tp.vs !== null ? Number(tp.vs) : undefined)),
        isOnGround: Boolean(tp.isOnGround ?? tp.is_on_ground ?? tp.onGround ?? tp.on_ground),
        windSpeed: tp.windSpeed !== undefined && tp.windSpeed !== null ? Number(tp.windSpeed) : (tp.wind_speed !== undefined && tp.wind_speed !== null ? Number(tp.wind_speed) : undefined),
        windDirection: tp.windDirection !== undefined && tp.windDirection !== null ? Number(tp.windDirection) : (tp.wind_direction !== undefined && tp.wind_direction !== null ? Number(tp.wind_direction) : undefined),
        oat: tp.oat !== undefined && tp.oat !== null ? Number(tp.oat) : undefined,
        tat: tp.tat !== undefined && tp.tat !== null ? Number(tp.tat) : undefined,
        visibility: tp.visibility !== undefined && tp.visibility !== null ? Number(tp.visibility) : undefined,
      }))
    : [];

  return {
    id,
    aircraftType,
    departureIcao,
    arrivalIcao,
    startTime,
    endTime,
    flightTimeSeconds,
    maxAltitude,
    maxGroundSpeed,
    distanceFlownNm,
    landingRateFpm,
    touchdowns,
    status,
    isManualFlight: Boolean(raw.isManualFlight),
    minOat: raw.minOat !== undefined && raw.minOat !== null ? Number(raw.minOat) : (raw.min_oat !== undefined && raw.min_oat !== null ? Number(raw.min_oat) : undefined),
    maxOat: raw.maxOat !== undefined && raw.maxOat !== null ? Number(raw.maxOat) : (raw.max_oat !== undefined && raw.max_oat !== null ? Number(raw.max_oat) : undefined),
    minVisibility: raw.minVisibility !== undefined && raw.minVisibility !== null ? Number(raw.minVisibility) : (raw.min_visibility !== undefined && raw.min_visibility !== null ? Number(raw.min_visibility) : undefined),
    avgCruiseWindSpeed: raw.avgCruiseWindSpeed !== undefined && raw.avgCruiseWindSpeed !== null ? Number(raw.avgCruiseWindSpeed) : (raw.avg_cruise_wind_speed !== undefined && raw.avg_cruise_wind_speed !== null ? Number(raw.avg_cruise_wind_speed) : undefined),
    avgCruiseWindDirection: raw.avgCruiseWindDirection !== undefined && raw.avgCruiseWindDirection !== null ? Number(raw.avgCruiseWindDirection) : (raw.avg_cruise_wind_direction !== undefined && raw.avg_cruise_wind_direction !== null ? Number(raw.avg_cruise_wind_direction) : undefined),
    maxWindSpeed: raw.maxWindSpeed !== undefined && raw.maxWindSpeed !== null ? Number(raw.maxWindSpeed) : (raw.max_wind_speed !== undefined && raw.max_wind_speed !== null ? Number(raw.max_wind_speed) : undefined),
    maxWindDirection: raw.maxWindDirection !== undefined && raw.maxWindDirection !== null ? Number(raw.maxWindDirection) : (raw.max_wind_direction !== undefined && raw.max_wind_direction !== null ? Number(raw.max_wind_direction) : undefined),
    telemetryPoints,
  };
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
                minOat: flight.minOat,
                maxOat: flight.maxOat,
                minVisibility: flight.minVisibility,
                avgCruiseWindSpeed: flight.avgCruiseWindSpeed,
                avgCruiseWindDirection: flight.avgCruiseWindDirection,
                maxWindSpeed: flight.maxWindSpeed,
                maxWindDirection: flight.maxWindDirection,
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
      let out = 'flight_id,timestamp,latitude,longitude,altitude_msl,altitude_agl,indicated_airspeed,ground_speed,heading,vertical_speed,is_on_ground,wind_speed,wind_direction,oat,tat,visibility\n';
      for (const p of pts) {
        const wSpd = p.windSpeed !== undefined ? p.windSpeed.toFixed(1) : '';
        const wDir = p.windDirection !== undefined ? p.windDirection.toFixed(1) : '';
        const oatStr = p.oat !== undefined ? p.oat.toFixed(1) : '';
        const tatStr = p.tat !== undefined ? p.tat.toFixed(1) : '';
        const visStr = p.visibility !== undefined ? p.visibility.toFixed(1) : '';
        out += `${p.flightId || flight.id},${p.timestamp},${p.latitude.toFixed(6)},${p.longitude.toFixed(6)},${p.altitudeMsl.toFixed(1)},${(p.altitudeAgl ?? 0).toFixed(1)},${p.indicatedAirspeed.toFixed(1)},${p.groundSpeed.toFixed(1)},${p.heading.toFixed(1)},${(p.verticalSpeed ?? 0).toFixed(1)},${p.isOnGround ? 1 : 0},${wSpd},${wDir},${oatStr},${tatStr},${visStr}\n`;
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
  activeView: 'dashboard' | 'new-route' | 'saved-routes' | 'logbook' | 'flight-detail' | 'visited' | 'ifr-trainer' | 'hold-trainer' | 'settings' | 'feedback' | 'recycle-bin';
  recycleBin: DeletedFlightRecord[];
  isSidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  dbInitialized: boolean;
  airportsCount: number;
  isSyncingAirports: boolean;
  syncProgress: { stage: string; percent: number; message: string } | null;
  lastSyncMessage: string | null;
  closeToTray: boolean;
  autoStartRecording: boolean;
  recordDetailedTelemetry: boolean;
  autoCheckUpdates: boolean;
  availableUpdate: Update | null;
  isCheckingUpdate: boolean;
  isInstallingUpdate: boolean;
  downloadProgress: number | null;
  updateMessage: string | null;
  updateDismissed: boolean;
  pageSize: number;
  setPageSize: (size: number) => Promise<void>;
  setAutoCheckUpdates: (enabled: boolean) => void;
  dismissUpdate: () => void;
  checkForUpdates: (silent?: boolean) => Promise<Update | null>;
  installUpdate: () => Promise<void>;
  updateSavedRoute: (id: string, updates: Partial<SavedRoute>) => Promise<SavedRoute | null>;
  showEndFlightPrompt: boolean;
  detectedMultiSectorRoute: {
    route: SavedRoute;
    currentAirportIcao: string;
    nextSectorArrivalIcao?: string;
  } | null;
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
  setRecordDetailedTelemetry: (enabled: boolean) => void;
  setShowEndFlightPrompt: (show: boolean) => void;
  updateTelemetry: (telemetry: Partial<TelemetryData>) => void;
  startManualFlight: (depIcao: string, arrIcao: string, aircraft: string) => void;
  endActiveFlight: () => Promise<void>;
  deleteFlight: (id: string) => Promise<void>;
  exportFlight: (id: string, format: ExportFormat) => Promise<string | null>;
  exportLogbook: (format: LogbookExportFormat, flightsOverride?: FlightRecord[]) => Promise<string | null>;
  addVisitedAirport: (airport: VisitedAirport) => void;
  toggleSidebar: () => void;
  moveToRecycleBin: (id: string) => Promise<void>;
  restoreFlightFromRecycleBin: (id: string) => Promise<void>;
  permanentlyDeleteFromRecycleBin: (id: string) => Promise<void>;
  emptyRecycleBin: () => Promise<void>;
  purgeExpiredRecycleBinItems: () => Promise<void>;
  exportDataBundle: (scope: ApolloExportScope, includeTelemetry?: boolean) => Promise<string | null>;
  importDataBundle: (
    bundle: ApolloExportBundle,
    strategy: 'skip' | 'overwrite' | 'keep_both',
    settingsChoices?: Record<string, 'current' | 'imported'>
  ) => Promise<{ importedFlights: number; importedRoutes: number; message: string }>;
}

const DEFAULT_TELEMETRY: TelemetryData = {
  simConnected: false,
  isInMenu: false,
  flightLoadCount: 0,
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
  nav1Radial: 0,
  nav1RelativeBearing: 0,
  nav1DmeDistance: 0,
  nav1DmeSpeed: 0,
  nav2Obs: 0,
  nav2Radial: 0,
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
let isTurnaroundStay = false;
let lastFlightLoadCount: number | null = null;
let cruiseWindSumU = 0;
let cruiseWindSumV = 0;
let cruiseWindCount = 0;

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

/**
 * Phase 9.1: Checks if an aircraft stopped at `currentIcao` is at an intermediate airport
 * of a multi-sector saved route that started at `departureIcao`.
 */
function findMatchingMultiSectorSavedRoute(
  departureIcao: string,
  currentIcao: string,
  savedRoutes: SavedRoute[]
): { route: SavedRoute; nextSectorArrivalIcao?: string } | null {
  if (!departureIcao || !currentIcao) return null;
  const dep = departureIcao.toUpperCase().trim();
  const cur = currentIcao.toUpperCase().trim();
  if (dep === cur || dep === 'ZZZZ' || cur === 'ZZZZ') return null;

  for (const sr of savedRoutes) {
    if (sr.status === 'flown') continue;
    const srDep = (sr.departureIcao || '').toUpperCase().trim();
    const srArr = (sr.arrivalIcao || '').toUpperCase().trim();

    // Route must start from our recorded departure and not already be at the final arrival
    if (srDep !== dep || srArr === cur) continue;

    let intermediates: string[] = [];
    try {
      intermediates = JSON.parse(sr.intermediateIcaos || '[]');
    } catch {
      intermediates = [];
    }
    const normIntermediates = intermediates.map((i) => i.toUpperCase().trim());

    let sectorArrivals: string[] = [];
    if (sr.sectorsJson) {
      try {
        const parsedSectors: any[] = JSON.parse(sr.sectorsJson);
        sectorArrivals = parsedSectors.map((s: any) => s.arrival?.icao?.toUpperCase().trim()).filter(Boolean);
      } catch {}
    }

    const intermediateIdx = normIntermediates.indexOf(cur);
    if (intermediateIdx !== -1) {
      const nextIcao = normIntermediates[intermediateIdx + 1] || srArr;
      return { route: sr, nextSectorArrivalIcao: nextIcao };
    }

    const sectorIdx = sectorArrivals.indexOf(cur);
    if (sectorIdx !== -1 && sectorIdx < sectorArrivals.length - 1) {
      const nextIcao = sectorArrivals[sectorIdx + 1] || srArr;
      return { route: sr, nextSectorArrivalIcao: nextIcao };
    }
  }

  return null;
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
      recycleBin: [],
      isSidebarCollapsed: false,
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
      pageSize: 50,
      airportsCount: 75,
      isSyncingAirports: false,
      syncProgress: null,
      lastSyncMessage: null,
      closeToTray: false,
      autoStartRecording: true,
      recordDetailedTelemetry: false,
      autoCheckUpdates: true,
      availableUpdate: null,
      isCheckingUpdate: false,
      isInstallingUpdate: false,
      downloadProgress: null,
      updateMessage: null,
      updateDismissed: false,
      showEndFlightPrompt: false,
      detectedMultiSectorRoute: null,
      nearestAirport: null,
      isLoadingFlightDetails: false,

      setAutoCheckUpdates: (enabled: boolean) => {
        set({ autoCheckUpdates: enabled });
        safeInvoke('set_user_setting', { key: 'autoCheckUpdates', value: String(enabled) });
      },

      dismissUpdate: () => {
        set({ updateDismissed: true });
      },

      checkForUpdates: async (silent = false) => {
        if (get().isCheckingUpdate || get().isInstallingUpdate) return null;
        set({ isCheckingUpdate: true, updateMessage: silent ? null : 'Checking for updates...' });
        try {
          if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
            const { check } = await import('@tauri-apps/plugin-updater');
            const update = await check();
            if (update) {
              set({
                availableUpdate: update,
                updateDismissed: false,
                updateMessage: `Update v${update.version} is available!`,
                isCheckingUpdate: false,
              });
              return update;
            } else {
              set({
                availableUpdate: null,
                updateMessage: silent ? null : `Apollo Flight is up to date (v${packageJson.version})`,
                isCheckingUpdate: false,
              });
              return null;
            }
          } else {
            if (!silent) {
              set({ updateMessage: 'Updater configured for signed release builds' });
            }
            set({ isCheckingUpdate: false });
            return null;
          }
        } catch (err) {
          console.warn('[flightStore] Update check error:', err);
          if (!silent) {
            set({ updateMessage: 'Already running latest version' });
          }
          set({ isCheckingUpdate: false });
          return null;
        }
      },

      installUpdate: async () => {
        const update = get().availableUpdate;
        if (!update || get().isInstallingUpdate) return;
        set({ isInstallingUpdate: true, downloadProgress: 0, updateMessage: 'Starting download...' });
        try {
          let totalBytes = 0;
          let downloadedBytes = 0;
          await update.downloadAndInstall((event: any) => {
            if (event.event === 'Started') {
              totalBytes = event.data?.contentLength ?? 0;
              set({ downloadProgress: 0, updateMessage: 'Downloading update...' });
            } else if (event.event === 'Progress') {
              downloadedBytes += event.data.chunkLength;
              if (totalBytes > 0) {
                const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
                set({ downloadProgress: pct, updateMessage: `Downloading update: ${pct}%` });
              } else {
                const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
                set({ updateMessage: `Downloading update: ${mb} MB` });
              }
            } else if (event.event === 'Finished') {
              set({ downloadProgress: 100, updateMessage: 'Installing update and restarting...' });
            }
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          set({ isInstallingUpdate: false, updateMessage: `Update failed: ${errMsg}` });
        }
      },

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

      setRecordDetailedTelemetry: (enabled: boolean) => {
        set({ recordDetailedTelemetry: enabled });
        safeInvoke('set_user_setting', { key: 'recordDetailedTelemetry', value: String(enabled) });
      },

      setShowEndFlightPrompt: (show: boolean) => {
        if (!show) {
          // If a multi-sector intermediate stop was prompted and dismissed, stay in turnaround mode
          if (get().detectedMultiSectorRoute) {
            isTurnaroundStay = true;
          }
          stoppedSinceTimestamp = null;
        }
        set({
          showEndFlightPrompt: show,
          detectedMultiSectorRoute: show ? get().detectedMultiSectorRoute : null,
        });
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
            if (typeof dbSettings.recordDetailedTelemetry === 'string') {
              set({ recordDetailedTelemetry: dbSettings.recordDetailedTelemetry === 'true' });
            }
            if (typeof dbSettings.autoCheckUpdates === 'string') {
              set({ autoCheckUpdates: dbSettings.autoCheckUpdates === 'true' });
            }
            if (typeof dbSettings.pageSize === 'string') {
              const ps = parseInt(dbSettings.pageSize, 10);
              if ([25, 50, 100].includes(ps)) {
                set({ pageSize: ps });
              }
            }
            if (typeof dbSettings.recycle_bin_flights === 'string') {
              try {
                const parsed = JSON.parse(dbSettings.recycle_bin_flights);
                if (Array.isArray(parsed)) {
                  set({ recycleBin: parsed });
                }
              } catch {}
            }
          } else {
            // Seed existing preferences into logbook.db user_settings table on initial migration
            const currentTheme = get().theme;
            const currentCloseToTray = get().closeToTray;
            const currentAutoStart = get().autoStartRecording;
            const currentRecordDetailed = get().recordDetailedTelemetry;
            const currentAutoCheck = get().autoCheckUpdates;
            const currentPageSize = get().pageSize || 50;
            await safeInvoke('set_user_setting', { key: 'theme', value: currentTheme });
            await safeInvoke('set_user_setting', { key: 'closeToTray', value: String(currentCloseToTray) });
            await safeInvoke('set_user_setting', { key: 'autoStartRecording', value: String(currentAutoStart) });
            await safeInvoke('set_user_setting', { key: 'recordDetailedTelemetry', value: String(currentRecordDetailed) });
            await safeInvoke('set_user_setting', { key: 'autoCheckUpdates', value: String(currentAutoCheck) });
            await safeInvoke('set_user_setting', { key: 'pageSize', value: String(currentPageSize) });
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
          } else if (get().flights.length > 0) {
            // Retain cached flights rehydrated from localStorage across dev restarts,
            // and sync existing cached flights to SQLite backend if running in Tauri runtime
            for (const f of get().flights) {
              const { telemetryPoints: _pts, touchdowns: _tds, ...dbRecord } = f;
              await safeInvoke('save_flight', { flight: dbRecord });
            }
            const initialId = get().selectedFlightId || get().flights[0]?.id || null;
            if (initialId) {
              set({ selectedFlightId: initialId });
              get().loadFlightDetails(initialId);
            }
          }

          if (dbStats?.visitedAirports && Array.isArray(dbStats.visitedAirports) && dbStats.visitedAirports.length > 0) {
            set({
              visitedAirports: dbStats.visitedAirports,
              visitedCountries: dbStats.visitedCountries || computeVisitedCountries(get().flights, dbStats.visitedAirports),
            });
          } else if (get().visitedAirports.length > 0) {
            for (const apt of get().visitedAirports) {
              await safeInvoke('record_airport_visit', {
                airport: {
                  icao: apt.icao,
                  name: apt.name,
                  latitude: apt.latitude,
                  longitude: apt.longitude,
                  countryCode: apt.countryCode,
                  countryName: apt.countryName,
                },
                timestamp: apt.lastVisited,
              });
            }
            set({
              visitedCountries: computeVisitedCountries(get().flights, get().visitedAirports),
            });
          }
          await get().fetchSavedRoutes();
          await get().purgeExpiredRecycleBinItems();
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

      setPageSize: async (size: number) => {
        const validSize = [25, 50, 100].includes(size) ? size : 50;
        set({ pageSize: validSize });
        try {
          await safeInvoke('set_user_setting', { key: 'pageSize', value: String(validSize) });
        } catch (err) {
          console.warn('[flightStore] Failed to save pageSize user setting:', err);
        }
      },

      updateSavedRoute: async (id: string, updates: Partial<SavedRoute>) => {
        const existing = get().savedRoutes.find((r) => r.id === id);
        if (!existing) return null;
        const merged: Partial<SavedRoute> & { departureIcao: string; arrivalIcao: string } = {
          ...existing,
          ...updates,
          id,
          departureIcao: updates.departureIcao || existing.departureIcao,
          arrivalIcao: updates.arrivalIcao || existing.arrivalIcao,
        };
        return await get().saveRoute(merged);
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

          let pts = details?.telemetryPoints || [];
          if (pts.length > 0) {
            // Cache in IndexedDB for dev mode / offline fallback
            saveFlightTelemetry(id, pts).catch(() => {});
          } else {
            // Try loading from IndexedDB
            try {
              const cachedPts = await getFlightTelemetry(id);
              if (cachedPts && cachedPts.length > 0) {
                pts = cachedPts;
              }
            } catch {}
          }

          const baseFlight = details?.flight || existing;
          if (baseFlight) {
            let distance = baseFlight.distanceFlownNm || 0;
            if (distance <= 0 && pts.length > 0) {
              const depApt = await resolveAirport(baseFlight.departureIcao);
              const arrApt = await resolveAirport(baseFlight.arrivalIcao);
              distance = calculateRecordedFlightDistance(pts, depApt, arrApt);
            }

            const updatedFlight: FlightRecord = {
              ...baseFlight,
              distanceFlownNm: distance,
              telemetryPoints: pts,
              touchdowns: baseFlight.touchdowns || existing?.touchdowns,
            };

            set((state) => ({
              flights: state.flights.map((f) => (f.id === id ? { ...f, ...updatedFlight } : f)),
              activeFlight: state.activeFlight?.id === id ? { ...state.activeFlight, distanceFlownNm: distance, telemetryPoints: pts } : state.activeFlight,
              isLoadingFlightDetails: false,
            }));

            if (distance > 0 && (!baseFlight.distanceFlownNm || baseFlight.distanceFlownNm <= 0)) {
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
        // 1. FSUIPC Disconnect: Clean all telemetry display & nearest aerodrome
        if (newData.simConnected === false) {
          lastFlightLoadCount = null;
          isTurnaroundStay = false;
          stoppedSinceTimestamp = null;
          set({
            currentTelemetry: { ...DEFAULT_TELEMETRY, simConnected: false },
            nearestAirport: null,
            flightStage: get().activeFlight ? get().flightStage : 'BOARDING',
          });
          return;
        }

        // 2. MSFS Main Menu / Loading Screen: Clean telemetry display & halt recording data
        if (newData.isInMenu) {
          set({
            currentTelemetry: {
              ...DEFAULT_TELEMETRY,
              simConnected: true,
              isInMenu: true,
              aircraftTitle: 'MSFS Main Menu / Loading',
            },
            nearestAirport: null,
            flightStage: get().activeFlight ? get().flightStage : 'BOARDING',
          });
          return;
        }

        const prev = get().currentTelemetry;
        const current: TelemetryData = { ...prev, ...newData, timestamp: new Date().toISOString() };
        let active = get().activeFlight;
        let flights = get().flights;
        let currentStage = get().flightStage;

        // 3. Simulator Flight Restart Detection:
        // When an active flight is recording, detect reload counter change or sudden teleportation
        if (active && active.status === 'RECORDING') {
          const loadCounterChanged =
            typeof newData.flightLoadCount === 'number' &&
            lastFlightLoadCount !== null &&
            newData.flightLoadCount !== lastFlightLoadCount;

          let isTeleported = false;
          if (prev.latitude !== 0 && prev.longitude !== 0 && current.latitude !== 0 && current.longitude !== 0) {
            const jumpDistNm = calculateDistanceNm(prev.latitude, prev.longitude, current.latitude, current.longitude);
            if (jumpDistNm > 10.0 && prev.groundSpeed < 450) {
              isTeleported = true;
            }
          }

          if (loadCounterChanged || isTeleported) {
            console.warn('[Apollo Flight] Simulator restart detected. Halting active flight recording to prevent corrupted telemetry.');
            stoppedSinceTimestamp = null;
            isTurnaroundStay = false;
            flushTelemetryBuffer();
            set({
              activeFlight: null,
              flightStage: 'BOARDING',
              showEndFlightPrompt: false,
              detectedMultiSectorRoute: null,
            });
            if (typeof newData.flightLoadCount === 'number') {
              lastFlightLoadCount = newData.flightLoadCount;
            }
            return;
          }
        }

        if (typeof newData.flightLoadCount === 'number') {
          lastFlightLoadCount = newData.flightLoadCount;
        }

        // Auto-fetch nearest airport when position shifts or not set
        const lastApt = get().nearestAirport;
        const coordsMoved = !lastApt || Math.abs(prev.latitude - current.latitude) > 0.05 || Math.abs(prev.longitude - current.longitude) > 0.05;
        if (coordsMoved && (current.latitude !== 0 || current.longitude !== 0)) {
          get().fetchNearestAirport(current.latitude, current.longitude);
        }

        // Auto-flight start triggers (Item 4 in FIXES.md):
        // 1. Moving faster than 20kt
        // 2. Engine started (combustion 0 -> 1)
        if (!active && current.simConnected && !current.isInMenu && get().autoStartRecording && !get().isSyncingAirports) {
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
            cruiseWindSumU = 0;
            cruiseWindSumV = 0;
            cruiseWindCount = 0;
            const isDetailed = get().recordDetailedTelemetry;
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
              ...(isDetailed && current.windSpeed !== undefined ? {
                windSpeed: current.windSpeed,
                windDirection: current.windDirection,
                oat: current.oat,
                tat: current.tat,
                visibility: current.visibility,
              } : {}),
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
              minOat: current.oat,
              maxOat: current.oat,
              minVisibility: current.visibility,
              maxWindSpeed: current.windSpeed,
              maxWindDirection: current.windDirection,
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
          const isDetailed = get().recordDetailedTelemetry;
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
            ...(isDetailed && current.windSpeed !== undefined ? {
              windSpeed: current.windSpeed,
              windDirection: current.windDirection,
              oat: current.oat,
              tat: current.tat,
              visibility: current.visibility,
            } : {}),
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

          // Track running atmospheric totals
          let minOat = active.minOat;
          let maxOat = active.maxOat;
          if (current.oat !== undefined) {
            minOat = minOat !== undefined ? Math.min(minOat, current.oat) : current.oat;
            maxOat = maxOat !== undefined ? Math.max(maxOat, current.oat) : current.oat;
          }
          let minVisibility = active.minVisibility;
          if (current.visibility !== undefined) {
            minVisibility = minVisibility !== undefined ? Math.min(minVisibility, current.visibility) : current.visibility;
          }
          let maxWindSpeed = active.maxWindSpeed;
          let maxWindDirection = active.maxWindDirection;
          if (current.windSpeed !== undefined && (maxWindSpeed === undefined || current.windSpeed > maxWindSpeed)) {
            maxWindSpeed = current.windSpeed;
            maxWindDirection = current.windDirection;
          }

          // Cruise wind vector accumulator
          if (currentStage === 'ENROUTE_CRUISE' && current.windSpeed !== undefined && current.windDirection !== undefined) {
            const rad = (current.windDirection * Math.PI) / 180;
            cruiseWindSumU += current.windSpeed * Math.sin(rad);
            cruiseWindSumV += current.windSpeed * Math.cos(rad);
            cruiseWindCount += 1;
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
                  radiusNm: 5.0,
                });
                if (nearApt) {
                  tdIcao = nearApt.icao;
                  tdName = nearApt.name;
                } else if (get().nearestAirport) {
                  const near = get().nearestAirport;
                  if (near && calculateDistanceNm(current.latitude, current.longitude, near.latitude, near.longitude) <= 5.0) {
                    tdIcao = near.icao;
                    tdName = near.name;
                  }
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

          // Auto-stop triggers (Item 4 in FIXES.md & Phase 9.1):
          // Aircraft stopped for 30s AND one or more engines turned off
          const isAircraftStopped = current.isOnGround && current.groundSpeed < 2.0;
          if (isAircraftStopped) {
            if (stoppedSinceTimestamp === null && !isTurnaroundStay) {
              stoppedSinceTimestamp = Date.now();
            }
          } else {
            stoppedSinceTimestamp = null;
            if (current.groundSpeed > 5.0) {
              isTurnaroundStay = false;
            }
          }

          const stoppedDurationSeconds = stoppedSinceTimestamp ? (Date.now() - stoppedSinceTimestamp) / 1000 : 0;
          const isEngineOff = !current.isEngineRunning;

          if (stoppedDurationSeconds >= 30 && isEngineOff && !isTurnaroundStay) {
            let arrIcao = 'ZZZZ';
            const arrLookup = await safeInvoke<any>('search_airports_near', {
              lat: current.latitude,
              lon: current.longitude,
              radiusNm: 5.0,
            });
            const arrApt = arrLookup || get().nearestAirport;
            if (arrApt) {
              arrIcao = arrApt.icao.toUpperCase().trim();
            }

            // Phase 9.1: Verify if aircraft is stopped at an intermediate airport of a multi-sector saved route
            const matchingRouteInfo = arrIcao && arrIcao !== 'ZZZZ'
              ? findMatchingMultiSectorSavedRoute(active.departureIcao, arrIcao, get().savedRoutes)
              : null;

            if (matchingRouteInfo) {
              // Multi-sector intermediate landing: do NOT auto-stop, prompt the user!
              if (!get().showEndFlightPrompt) {
                set({
                  showEndFlightPrompt: true,
                  detectedMultiSectorRoute: {
                    route: matchingRouteInfo.route,
                    currentAirportIcao: arrIcao,
                    nextSectorArrivalIcao: matchingRouteInfo.nextSectorArrivalIcao,
                  },
                });
              }
            } else if (active.isManualFlight) {
              // Safeguard for manual start: prompt user instead of automatically ending
              if (!get().showEndFlightPrompt) {
                set({ showEndFlightPrompt: true, detectedMultiSectorRoute: null });
              }
            } else {
              // Auto-started flight: complete recording
              stoppedSinceTimestamp = null;
              isTurnaroundStay = false;

              const [depApt, resolvedArrApt] = await Promise.all([
                resolveAirport(active.departureIcao),
                arrApt ? Promise.resolve(arrApt) : resolveAirport(arrIcao),
              ]);

              const allPoints = [...active.telemetryPoints, newPoint];
              const totalDistanceNm = calculateRecordedFlightDistance(allPoints, depApt, resolvedArrApt);

              const avgLandingRate = computeAverageTouchdownRate(currentTouchdowns, current.verticalSpeed);

              let avgCruiseWindSpeed = active.avgCruiseWindSpeed;
              let avgCruiseWindDirection = active.avgCruiseWindDirection;
              if (cruiseWindCount > 0) {
                const meanU = cruiseWindSumU / cruiseWindCount;
                const meanV = cruiseWindSumV / cruiseWindCount;
                avgCruiseWindSpeed = Math.round(Math.hypot(meanU, meanV));
                avgCruiseWindDirection = Math.round(((Math.atan2(meanU, meanV) * 180) / Math.PI + 360) % 360);
              }

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
                minOat,
                maxOat,
                minVisibility,
                avgCruiseWindSpeed,
                avgCruiseWindDirection,
                maxWindSpeed,
                maxWindDirection,
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
                detectedMultiSectorRoute: null,
                visitedCountries: computeVisitedCountries(updatedFlights, get().visitedAirports),
              });
              checkAndMarkFlownSavedRoutes(completedFlight, get().savedRoutes, get().updateRouteStatus);
              return;
            }
          }

          const updatedActive: FlightRecord = {
            ...active,
            minOat,
            maxOat,
            minVisibility,
            maxWindSpeed,
            maxWindDirection,
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
        cruiseWindSumU = 0;
        cruiseWindSumV = 0;
        cruiseWindCount = 0;
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
          minOat: state.currentTelemetry.oat,
          maxOat: state.currentTelemetry.oat,
          minVisibility: state.currentTelemetry.visibility,
          maxWindSpeed: state.currentTelemetry.windSpeed,
          maxWindDirection: state.currentTelemetry.windDirection,
          touchdowns: [],
          telemetryPoints: [],
        };
        safeInvoke('save_flight', { flight: newFlight });
        stoppedSinceTimestamp = null;
        isTurnaroundStay = false;
        set({ activeFlight: newFlight, flightStage: 'TAKEOFF_CLIMB', showEndFlightPrompt: false, detectedMultiSectorRoute: null });
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

        let avgCruiseWindSpeed = activeFlight.avgCruiseWindSpeed;
        let avgCruiseWindDirection = activeFlight.avgCruiseWindDirection;
        if (cruiseWindCount > 0) {
          const meanU = cruiseWindSumU / cruiseWindCount;
          const meanV = cruiseWindSumV / cruiseWindCount;
          avgCruiseWindSpeed = Math.round(Math.hypot(meanU, meanV));
          avgCruiseWindDirection = Math.round(((Math.atan2(meanU, meanV) * 180) / Math.PI + 360) % 360);
        }

        const completedFlight: FlightRecord = {
          ...activeFlight,
          arrivalIcao: arrIcao,
          endTime: new Date().toISOString(),
          status: 'COMPLETED',
          landingRateFpm: avgLandingRate,
          touchdowns: tds,
          distanceFlownNm: totalDistanceNm,
          avgCruiseWindSpeed,
          avgCruiseWindDirection,
        };

        flushTelemetryBuffer();
        safeInvoke('save_flight', { flight: completedFlight });
        if (completedFlight.telemetryPoints && completedFlight.telemetryPoints.length > 0) {
          saveFlightTelemetry(completedFlight.id, completedFlight.telemetryPoints).catch(() => {});
        }
        stoppedSinceTimestamp = null;
        isTurnaroundStay = false;

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
          detectedMultiSectorRoute: null,
          visitedCountries: computeVisitedCountries(updatedFlights, visitedAirports),
        });
        checkAndMarkFlownSavedRoutes(completedFlight, get().savedRoutes, get().updateRouteStatus);
      },

      deleteFlight: async (id) => {
        await get().moveToRecycleBin(id);
      },

      toggleSidebar: () => {
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
      },

      moveToRecycleBin: async (id: string) => {
        let fullFlight = await get().loadFlightDetails(id);
        if (!fullFlight) {
          fullFlight = get().flights.find((f) => f.id === id) || null;
        }
        if (!fullFlight) return;

        const deletedFlight: DeletedFlightRecord = {
          ...fullFlight,
          deletedAt: new Date().toISOString(),
        };

        await safeInvoke('delete_flight', { id });

        const updatedActive = get().flights.filter((f) => f.id !== id);
        const updatedRecycle = [deletedFlight, ...get().recycleBin.filter((f) => f.id !== id)];

        set({
          flights: updatedActive,
          recycleBin: updatedRecycle,
          selectedFlightId: get().selectedFlightId === id ? updatedActive[0]?.id || null : get().selectedFlightId,
          visitedCountries: computeVisitedCountries(updatedActive, get().visitedAirports),
        });

        try {
          await safeInvoke('set_user_setting', {
            key: 'recycle_bin_flights',
            value: JSON.stringify(updatedRecycle),
          });
        } catch (err) {
          console.warn('[flightStore] Failed to persist recycle bin:', err);
        }
      },

      restoreFlightFromRecycleBin: async (id: string) => {
        const item = get().recycleBin.find((f) => f.id === id);
        if (!item) return;

        try {
          const { telemetryPoints: _pts, touchdowns: _tds, ...dbRecord } = item;
          await safeInvoke('save_flight', { flight: dbRecord });
          if (item.telemetryPoints && item.telemetryPoints.length > 0) {
            saveFlightTelemetry(item.id, item.telemetryPoints).catch(() => {});
            const rawPoints = item.telemetryPoints.map((tp) => ({
              flightId: item.id,
              timestamp: tp.timestamp,
              latitude: tp.latitude,
              longitude: tp.longitude,
              altitudeMsl: tp.altitudeMsl,
              altitudeAgl: tp.altitudeAgl,
              indicatedAirspeed: tp.indicatedAirspeed,
              groundSpeed: tp.groundSpeed,
              heading: tp.heading,
              pitch: tp.pitch,
              bank: tp.bank,
              verticalSpeed: tp.verticalSpeed,
              isOnGround: tp.isOnGround,
            }));
            await safeInvoke('save_telemetry_batch', { points: rawPoints });
          }
        } catch (err) {
          console.warn('[flightStore] Error restoring flight to SQLite:', err);
        }

        const updatedFlights = [item, ...get().flights.filter((f) => f.id !== id)];
        const updatedRecycle = get().recycleBin.filter((f) => f.id !== id);

        set({
          flights: updatedFlights,
          recycleBin: updatedRecycle,
          visitedCountries: computeVisitedCountries(updatedFlights, get().visitedAirports),
        });

        try {
          await safeInvoke('set_user_setting', {
            key: 'recycle_bin_flights',
            value: JSON.stringify(updatedRecycle),
          });
        } catch {}
      },

      permanentlyDeleteFromRecycleBin: async (id: string) => {
        const updatedRecycle = get().recycleBin.filter((f) => f.id !== id);
        set({ recycleBin: updatedRecycle });
        try {
          await safeInvoke('delete_flight', { id });
          deleteFlightTelemetry(id).catch(() => {});
          await safeInvoke('set_user_setting', {
            key: 'recycle_bin_flights',
            value: JSON.stringify(updatedRecycle),
          });
        } catch (err) {
          console.warn('[flightStore] Error permanently deleting:', err);
        }
      },

      emptyRecycleBin: async () => {
        const ids = get().recycleBin.map((f) => f.id);
        set({ recycleBin: [] });
        for (const id of ids) {
          await safeInvoke('delete_flight', { id });
          deleteFlightTelemetry(id).catch(() => {});
        }
        try {
          await safeInvoke('set_user_setting', {
            key: 'recycle_bin_flights',
            value: JSON.stringify([]),
          });
        } catch {}
      },

      purgeExpiredRecycleBinItems: async () => {
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const currentBin = get().recycleBin;
        const kept: DeletedFlightRecord[] = [];
        const expiredIds: string[] = [];

        for (const item of currentBin) {
          const deletedTime = new Date(item.deletedAt).getTime();
          if (now - deletedTime >= THIRTY_DAYS_MS) {
            expiredIds.push(item.id);
          } else {
            kept.push(item);
          }
        }

        if (expiredIds.length > 0) {
          for (const id of expiredIds) {
            await safeInvoke('delete_flight', { id });
            deleteFlightTelemetry(id).catch(() => {});
          }
          set({ recycleBin: kept });
          try {
            await safeInvoke('set_user_setting', {
              key: 'recycle_bin_flights',
              value: JSON.stringify(kept),
            });
          } catch {}
        }
      },

      exportDataBundle: async (scope: ApolloExportScope, includeTelemetry = true) => {
        const now = new Date().toISOString();
        const bundle: ApolloExportBundle = {
          format: 'apollo-flight-bundle',
          version: '1.0',
          exportedAt: now,
          scope,
          metadata: {
            appVersion: '0.0.3',
            hasTelemetry: includeTelemetry,
          },
        };

        if (scope === 'full' || scope === 'settings') {
          const dbSettings = await safeInvoke<Record<string, string>>('get_all_user_settings');
          bundle.userSettings = dbSettings || {
            theme: get().theme,
            closeToTray: String(get().closeToTray),
            autoStartRecording: String(get().autoStartRecording),
            recordDetailedTelemetry: String(get().recordDetailedTelemetry),
            autoCheckUpdates: String(get().autoCheckUpdates),
            pageSize: String(get().pageSize),
          };
        }

        if (scope === 'full' || scope === 'logbook') {
          let flightsToExport = get().flights;
          if (includeTelemetry) {
            flightsToExport = await Promise.all(
              get().flights.map(async (f) => {
                if (f.telemetryPoints && f.telemetryPoints.length > 0) return f;
                const detailed = await get().loadFlightDetails(f.id);
                return detailed || f;
              })
            );
          } else {
            flightsToExport = get().flights.map((f) => ({
              ...f,
              telemetryPoints: [],
            }));
          }
          bundle.flights = flightsToExport;
          bundle.metadata.flightCount = flightsToExport.length;
          bundle.visitedAirports = get().visitedAirports;
          bundle.visitedCountries = get().visitedCountries;
        }

        if (scope === 'full' || scope === 'routes') {
          bundle.savedRoutes = get().savedRoutes;
          bundle.metadata.routeCount = get().savedRoutes.length;
        }

        const jsonStr = JSON.stringify(bundle, null, 2);
        const dateTag = now.slice(0, 10);
        const filename = `apollo_flight_${scope}_${dateTag}.json`;

        if (typeof document !== 'undefined') {
          await triggerFileSave(jsonStr, filename, 'json', 'application/json');
        }

        return jsonStr;
      },

      importDataBundle: async (bundle, strategy, settingsChoices) => {
        if (!bundle || bundle.format !== 'apollo-flight-bundle') {
          throw new Error('Invalid Apollo Flight backup bundle format.');
        }

        let importedFlightsCount = 0;
        let importedRoutesCount = 0;

        // 1. Settings
        if (bundle.userSettings) {
          for (const [key, val] of Object.entries(bundle.userSettings)) {
            const choice = settingsChoices?.[key] ?? 'imported';
            if (choice === 'imported') {
              if (key === 'theme' && (val === 'light' || val === 'dark')) {
                get().setTheme(val);
              }
              if (key === 'closeToTray') {
                get().setCloseToTray(val === 'true');
              }
              if (key === 'autoStartRecording') {
                get().setAutoStartRecording(val === 'true');
              }
              if (key === 'recordDetailedTelemetry') {
                get().setRecordDetailedTelemetry(val === 'true');
              }
              if (key === 'autoCheckUpdates') {
                get().setAutoCheckUpdates(val === 'true');
              }
              if (key === 'pageSize') {
                const ps = parseInt(val, 10);
                if ([25, 50, 100].includes(ps)) get().setPageSize(ps);
              }
              await safeInvoke('set_user_setting', { key, value: String(val) });
            }
          }
        }

        // 2. Flights
        if (bundle.flights && Array.isArray(bundle.flights)) {
          const currentFlights = get().flights;
          const currentIds = new Set(currentFlights.map((f) => f.id));
          const toAdd: FlightRecord[] = [];

          for (const rawFlight of bundle.flights) {
            const f = sanitizeFlightRecord(rawFlight);
            let flightToSave = { ...f };
            if (currentIds.has(flightToSave.id)) {
              if (strategy === 'skip') {
                continue;
              } else if (strategy === 'keep_both') {
                flightToSave.id = `flight-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              }
            }

            // Strip telemetry points and touchdowns from dbRecord to prevent oversized payload over IPC
            const { telemetryPoints: pts, touchdowns: _tds, ...dbRecord } = flightToSave;
            await safeInvoke('save_flight', { flight: dbRecord });

            if (pts && pts.length > 0) {
              const rawPoints = pts.map((tp: any) => ({
                flightId: flightToSave.id,
                timestamp: tp.timestamp || flightToSave.startTime,
                latitude: Number(tp.latitude) || 0,
                longitude: Number(tp.longitude) || 0,
                altitudeMsl: Math.round(Number(tp.altitudeMsl ?? tp.altitude_msl) || 0),
                altitudeAgl: tp.altitudeAgl !== undefined && tp.altitudeAgl !== null ? Math.round(Number(tp.altitudeAgl)) : (tp.altitude_agl !== undefined && tp.altitude_agl !== null ? Math.round(Number(tp.altitude_agl)) : null),
                indicatedAirspeed: Math.round(Number(tp.indicatedAirspeed ?? tp.indicated_airspeed) || 0),
                groundSpeed: Math.round(Number(tp.groundSpeed ?? tp.ground_speed) || 0),
                heading: Math.round(Number(tp.heading) || 0),
                pitch: tp.pitch !== undefined && tp.pitch !== null ? Number(tp.pitch) : null,
                bank: tp.bank !== undefined && tp.bank !== null ? Number(tp.bank) : null,
                verticalSpeed: tp.verticalSpeed !== undefined && tp.verticalSpeed !== null ? Number(tp.verticalSpeed) : (tp.vertical_speed !== undefined && tp.vertical_speed !== null ? Number(tp.vertical_speed) : null),
                isOnGround: Boolean(tp.isOnGround ?? tp.is_on_ground),
                windSpeed: tp.windSpeed !== undefined && tp.windSpeed !== null ? Number(tp.windSpeed) : (tp.wind_speed !== undefined && tp.wind_speed !== null ? Number(tp.wind_speed) : null),
                windDirection: tp.windDirection !== undefined && tp.windDirection !== null ? Number(tp.windDirection) : (tp.wind_direction !== undefined && tp.wind_direction !== null ? Number(tp.wind_direction) : null),
                oat: tp.oat !== undefined && tp.oat !== null ? Number(tp.oat) : null,
                tat: tp.tat !== undefined && tp.tat !== null ? Number(tp.tat) : null,
                visibility: tp.visibility !== undefined && tp.visibility !== null ? Number(tp.visibility) : null,
              }));

              await saveFlightTelemetry(flightToSave.id, pts);

              const CHUNK_SIZE = 500;
              for (let i = 0; i < rawPoints.length; i += CHUNK_SIZE) {
                const chunk = rawPoints.slice(i, i + CHUNK_SIZE);
                await safeInvoke('save_telemetry_batch', { points: chunk });
              }
            }

            toAdd.push(flightToSave);
            importedFlightsCount++;
          }

          if (toAdd.length > 0) {
            const merged = strategy === 'overwrite'
              ? [...toAdd, ...currentFlights.filter((cf) => !toAdd.some((ta) => ta.id === cf.id))]
              : [...toAdd, ...currentFlights];
            const initialId = merged[0]?.id || null;
            set({
              flights: merged,
              selectedFlightId: initialId,
              visitedCountries: computeVisitedCountries(merged, get().visitedAirports),
            });
            if (initialId) {
              get().loadFlightDetails(initialId);
            }
          }
        }

        // 3. Saved Routes
        if (bundle.savedRoutes && Array.isArray(bundle.savedRoutes)) {
          const currentRoutes = get().savedRoutes;
          const currentIds = new Set(currentRoutes.map((r) => r.id));

          for (const r of bundle.savedRoutes) {
            let routeToSave = { ...r };
            if (currentIds.has(routeToSave.id)) {
              if (strategy === 'skip') {
                continue;
              } else if (strategy === 'keep_both') {
                routeToSave.id = `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              }
            }
            await get().saveRoute(routeToSave);
            importedRoutesCount++;
          }
        }

        // 4. Visited Airports
        if (bundle.visitedAirports && Array.isArray(bundle.visitedAirports)) {
          for (const apt of bundle.visitedAirports) {
            if (apt && apt.icao) {
              get().addVisitedAirport({
                icao: apt.icao,
                name: apt.name || apt.icao,
                countryCode: apt.countryCode || '',
                countryName: apt.countryName || '',
                latitude: Number(apt.latitude) || 0,
                longitude: Number(apt.longitude) || 0,
                firstVisited: apt.firstVisited || new Date().toISOString(),
                lastVisited: apt.lastVisited || new Date().toISOString(),
                visitCount: apt.visitCount || 1,
              });
            }
          }
        }

        return {
          importedFlights: importedFlightsCount,
          importedRoutes: importedRoutesCount,
          message: `Imported ${importedFlightsCount} flight(s) and ${importedRoutesCount} route(s) successfully.`,
        };
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
        recordDetailedTelemetry: state.recordDetailedTelemetry,
        autoCheckUpdates: state.autoCheckUpdates,
        pageSize: state.pageSize,
        savedRoutes: state.savedRoutes,
        recycleBin: state.recycleBin,
        flights: state.flights.map(({ telemetryPoints, ...rest }) => ({
          ...rest,
          telemetryPoints: [],
        })),
        visitedAirports: state.visitedAirports,
        visitedCountries: state.visitedCountries,
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
