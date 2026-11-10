import { Airport } from "./flight";

export type AircraftCategory = "A" | "B" | "C" | "D" | "E" | "F";

export type AirportTypePreference =
    "all" | "large_airport" | "medium_airport" | "small_airport";

export type RunwaySurfacePreference = "any" | "paved" | "unpaved";

export type RouteLimitType = "none" | "time" | "distance";

export type GeographicAreaType = "preset" | "circle" | "polygon";

export interface GeographicAreaFilter {
    type: GeographicAreaType;
    circleCenter?: [number, number]; // [lat, lon]
    circleRadiusNm?: number;
    polygonCoords?: [number, number][]; // [[lat, lon], ...]
}

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
    allowedAirportTypes: (
        "large_airport" | "medium_airport" | "small_airport"
    )[];
}

export interface RouteSearchParams {
    category: AircraftCategory;
    airportType: AirportTypePreference;
    runwaySurface?: RunwaySurfacePreference;
    customMinRunwayFt?: number;
    customMaxRunwayFt?: number;
    region: string; // 'random' | 'EU' | 'NA' | 'SA' | 'AS' | 'AF' | 'OC' | countryCode
    limitBy: RouteLimitType;
    limitScope?: "total" | "sector";
    minLimitValue?: number; // Minutes or NM
    maxLimitValue?: number; // Minutes or NM
    sectorCount: number; // 1, 2, 3, or -1 for round-trip (2 sectors A->B->A)
    sectorDistanceLimit?: number; // Optional max NM per sector
    sectorDurationLimit?: number; // Optional max minutes per sector
    departureIcao?: string;
    arrivalIcao?: string;
    includeGroundTime: boolean;
    areaFilter?: GeographicAreaFilter;
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
    // Terrain & Corridor MSA parameters
    corridorMsaFt?: number;
    peakTerrainFt?: number;
    limitingCoord?: [number, number];
    isAltitudeTerrainClamped?: boolean;
    terrainWarning?: string;
    isMountainous?: boolean;
    maxTerrainVariation10Nm?: number;
    requiredMarginFt?: number;
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
    areaFilter?: GeographicAreaFilter;
}

export type SavedRouteStatus = "draft" | "flown";

export interface SavedRoute {
    id: string;
    name: string;
    aircraftName?: string;
    departureIcao: string;
    arrivalIcao: string;
    intermediateIcaos: string; // JSON string e.g. "[\"EDDM\"]"
    sectorCount?: number;
    aircraftCategory: AircraftCategory;
    sectorsJson: string; // JSON string of RouteSector[]
    sectors?: RouteSector[]; // Parsed convenience field
    totalDistanceNm: number;
    totalAirborneMinutes: number;
    totalGroundMinutes: number;
    totalDurationMinutes: number;
    includeGroundTime?: boolean;
    isRoundTrip?: boolean;
    recommendedAltitudeFt?: number | null;
    status: SavedRouteStatus;
    isFavorite: boolean;
    linkedFlightId?: string | null;
    createdAt: string;
    flownAt?: string | null;
}
