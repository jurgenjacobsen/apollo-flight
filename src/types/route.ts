import { Airport } from './flight';

export type AircraftCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type AirportTypePreference = 'all' | 'large_airport' | 'medium_airport' | 'small_airport';

export type RunwaySurfacePreference = 'any' | 'paved' | 'unpaved';

export type RouteLimitType = 'none' | 'time' | 'distance';

export interface AircraftCategoryProfile {
  category: AircraftCategory;
  name: string;
  speedRange: string;
  examples: string[];
  cruiseSpeedTasKt: number;
  typicalCruiseAltFt: number;
  climbRateFpm: number;
  climbSpeedTasKt: number;
  descentRateFpm: number;
  descentSpeedTasKt: number;
  taxiOutMinutes: number;
  taxiInMinutes: number;
  maxSectorRangeNm: number;
  minRunwayFt: number;
  allowedAirportTypes: ('large_airport' | 'medium_airport' | 'small_airport')[];
}

export interface RouteSearchParams {
  category: AircraftCategory;
  airportType: AirportTypePreference;
  runwaySurface?: RunwaySurfacePreference;
  customMinRunwayFt?: number;
  customMaxRunwayFt?: number;
  region: string; // 'random' | 'EU' | 'NA' | 'SA' | 'AS' | 'AF' | 'OC' | countryCode
  limitBy: RouteLimitType;
  limitScope?: 'total' | 'sector';
  minLimitValue?: number; // Minutes or NM
  maxLimitValue?: number; // Minutes or NM
  sectorCount: number; // 1, 2, 3, or -1 for round-trip (2 sectors A->B->A)
  sectorDistanceLimit?: number; // Optional max NM per sector
  sectorDurationLimit?: number; // Optional max minutes per sector
  departureIcao?: string;
  arrivalIcao?: string;
  includeGroundTime: boolean;
}

export interface RouteSector {
  sectorIndex: number;
  departure: Airport;
  arrival: Airport;
  distanceNm: number;
  initialBearingDeg: number;
  airborneMinutes: number;
  groundMinutes: number;
  totalMinutes: number;
  climbMinutes: number;
  cruiseMinutes: number;
  descentMinutes: number;
  cruiseAltitudeFt: number;
  cruiseSpeedKt: number;
}

export interface GeneratedRoute {
  id: string;
  createdAt: string;
  aircraftCategory: AircraftCategory;
  aircraftName: string;
  sectors: RouteSector[];
  totalDistanceNm: number;
  totalAirborneMinutes: number;
  totalGroundMinutes: number;
  totalDurationMinutes: number;
  includeGroundTime: boolean;
  isRoundTrip: boolean;
}
