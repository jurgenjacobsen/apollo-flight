export interface TelemetryData {
  simConnected: boolean;
  latitude: number;
  longitude: number;
  altitudeMsl: number;
  altitudeAgl: number;
  indicatedAirspeed: number;
  trueAirspeed: number;
  groundSpeed: number;
  verticalSpeed: number;
  pitch: number;
  bank: number;
  heading: number;
  aircraftTitle: string;
  isOnGround: boolean;
  isEngineRunning: boolean;
  nav1Obs: number;
  nav1RelativeBearing: number;
  nav1DmeDistance: number;
  nav1DmeSpeed: number;
  nav2Obs: number;
  nav2RelativeBearing: number;
  nav2DmeDistance: number;
  nav2DmeSpeed: number;
  adf1RelativeBearing: number;
  timestamp: string;
}

export type NavSource = 'NAV1' | 'NAV2' | 'ADF';

export type FlightStage =
  | 'BOARDING'
  | 'TAXI_OUT'
  | 'TAKEOFF_CLIMB'
  | 'ENROUTE_CRUISE'
  | 'DESCENT_APPROACH'
  | 'TOUCHDOWN_ROLLOUT'
  | 'ARRIVED';

export type ExportFormat = 'gpx' | 'kml' | 'geojson' | 'csv';

export interface Airport {
  icao: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationFt?: number;
  countryCode: string;
  countryName: string;
  municipality?: string;
  airportType?: string;
  continent?: string;
  maxRunwayLengthFt?: number;
  hasPaved?: boolean;
  hasUnpaved?: boolean;
}

export interface OurAirportsSyncResult {
  success: boolean;
  totalAirports: number;
  message: string;
}

export interface TouchdownEvent {
  timestamp: string;
  verticalSpeedFpm: number;
  groundSpeedKt?: number;
  pitchDeg?: number;
  bankDeg?: number;
  latitude: number;
  longitude: number;
  altitudeMsl?: number;
  gForce?: number;
}

export interface FlightRecord {
  id: string;
  aircraftType: string;
  departureIcao: string;
  arrivalIcao: string;
  startTime: string;
  endTime?: string;
  flightTimeSeconds: number;
  maxAltitude: number;
  maxGroundSpeed: number;
  distanceFlownNm: number;
  landingRateFpm?: number;
  touchdowns?: TouchdownEvent[];
  status: 'RECORDING' | 'COMPLETED' | 'DISCARDED';
  isManualFlight?: boolean;
  telemetryPoints: TelemetryPoint[];
}

export interface TelemetryPoint {
  id?: number;
  flightId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitudeMsl: number;
  altitudeAgl?: number;
  indicatedAirspeed: number;
  groundSpeed: number;
  heading: number;
  pitch?: number;
  bank?: number;
  verticalSpeed?: number;
  isOnGround: boolean;
}

export interface VisitedAirport {
  icao: string;
  name: string;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
  firstVisited: string;
  lastVisited: string;
  visitCount: number;
}

export interface VisitedCountry {
  isoA2: string;
  name: string;
  firstVisited: string;
  lastVisited: string;
  flightCount: number;
}

export interface VisitedStats {
  visitedAirports: VisitedAirport[];
  visitedCountries: VisitedCountry[];
  totalCountries: number;
  totalAirports: number;
}
