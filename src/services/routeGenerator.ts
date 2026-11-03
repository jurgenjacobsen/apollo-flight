import { Airport } from '../types/flight';
import { RouteSearchParams, GeneratedRoute, RouteSector, GeographicAreaFilter } from '../types/route';
import { AIRCRAFT_CATEGORIES, calculateSectorFlightProfile, formatFlightLevelOrAltitude } from '../data/aircraftCategories';
import { calculateDistanceNm, calculateInitialBearing, isHelipadOrHeliport } from '../data/mockData';
import { FALLBACK_AIRPORTS } from '../data/fallbackAirports';
import { getCorridorMsa, interpolateGreatCircle } from './terrainMora';

// Dynamic safe invoke helper for Tauri v2
async function safeInvoke<T>(cmd: string, args: Record<string, any> = {}): Promise<T | null> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (err) {
      console.warn(`[Tauri IPC] ${cmd} failed:`, err);
      return null;
    }
  }
  return null;
}

export function isValidIcaoCode(code: string): boolean {
  return /^[A-Z]{4}$/i.test(code.trim());
}

/**
 * Fisher-Yates array shuffler for high-entropy candidate randomization
 */
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Resolves an airport by its ICAO code from SQLite DB, with in-memory seed fallback
 */
export async function resolveAirport(icao: string): Promise<Airport | null> {
  const cleanIcao = icao.trim().toUpperCase();
  if (!isValidIcaoCode(cleanIcao)) return null;

  const dbApt = await safeInvoke<Airport>('get_airport', { icao: cleanIcao });
  if (dbApt && dbApt.icao && isValidIcaoCode(dbApt.icao) && !isHelipadOrHeliport(dbApt)) {
    return dbApt;
  }

  // Fallback to in-memory seed dataset if DB returns null or running outside Tauri
  const fallback = FALLBACK_AIRPORTS.find((a) => a.icao === cleanIcao);
  if (fallback) {
    return fallback;
  }

  return null;
}

/**
 * Ray-casting algorithm to test if a geographical point (lat, lon) is inside a polygon
 */
export function isPointInPolygon(pointLat: number, pointLon: number, polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const latI = polygon[i][0];
    const lonI = polygon[i][1];
    const latJ = polygon[j][0];
    const lonJ = polygon[j][1];

    const intersect =
      lonI > pointLon !== lonJ > pointLon &&
      pointLat < ((latJ - latI) * (pointLon - lonI)) / (lonJ - lonI) + latI;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Returns candidate airports matching category compatibility, region, runway length, surface, and airport type
 */
export async function getCandidateAirports(params: {
  category: RouteSearchParams['category'];
  airportTypePreference: RouteSearchParams['airportType'];
  runwaySurface?: RouteSearchParams['runwaySurface'];
  minRunwayFt?: number;
  maxRunwayFt?: number;
  region: string;
  fromLat?: number;
  fromLon?: number;
  minDistNm?: number;
  maxDistNm?: number;
  limit?: number;
  areaFilter?: GeographicAreaFilter;
}): Promise<Airport[]> {
  const profile = AIRCRAFT_CATEGORIES[params.category];
  const minRequiredRunway = params.minRunwayFt ?? profile.minRunwayFt;
  const maxAllowedRunway = params.maxRunwayFt && params.maxRunwayFt > 0 ? params.maxRunwayFt : undefined;
  const surfacePref = params.runwaySurface ?? 'any';

  // Enforce Category Airframe Compatibility (No A380 at local grass strips)
  let allowedTypes = profile.allowedAirportTypes;
  if (params.airportTypePreference !== 'all') {
    if (allowedTypes.includes(params.airportTypePreference as any)) {
      allowedTypes = [params.airportTypePreference as any];
    }
  }

  const isEligibleIcaoAirfield = (a: Airport): boolean => {
    if (!isValidIcaoCode(a.icao)) return false;
    // Strictly exclude helipads, heliports, and other non-standard aviation facilities
    if (isHelipadOrHeliport(a)) {
      return false;
    }
    // Verify runway length if registered
    if (typeof a.maxRunwayLengthFt === 'number' && a.maxRunwayLengthFt > 0) {
      if (a.maxRunwayLengthFt < minRequiredRunway) {
        return false;
      }
      if (maxAllowedRunway && a.maxRunwayLengthFt > maxAllowedRunway) {
        return false;
      }
    }
    // Verify runway surface preference
    if (surfacePref === 'paved' && a.hasPaved === false) {
      return false;
    }
    if (surfacePref === 'unpaved' && a.hasUnpaved === false) {
      return false;
    }
    // Custom Geographic Area (Circle / Polygon)
    if (params.areaFilter && params.areaFilter.type !== 'preset') {
      if (params.areaFilter.type === 'circle' && params.areaFilter.circleCenter) {
        const [cLat, cLon] = params.areaFilter.circleCenter;
        const rad = params.areaFilter.circleRadiusNm || 150;
        const d = calculateDistanceNm(cLat, cLon, a.latitude, a.longitude);
        if (d > rad) return false;
      } else if (
        params.areaFilter.type === 'polygon' &&
        params.areaFilter.polygonCoords &&
        params.areaFilter.polygonCoords.length >= 3
      ) {
        if (!isPointInPolygon(a.latitude, a.longitude, params.areaFilter.polygonCoords)) {
          return false;
        }
      }
    }
    return true;
  };

  let queryFromLat = params.fromLat;
  let queryFromLon = params.fromLon;
  let queryMaxDistNm = params.maxDistNm;

  if (typeof queryFromLat !== 'number' && params.areaFilter && params.areaFilter.type !== 'preset') {
    if (params.areaFilter.type === 'circle' && params.areaFilter.circleCenter) {
      queryFromLat = params.areaFilter.circleCenter[0];
      queryFromLon = params.areaFilter.circleCenter[1];
      queryMaxDistNm = params.areaFilter.circleRadiusNm || 150;
    } else if (
      params.areaFilter.type === 'polygon' &&
      params.areaFilter.polygonCoords &&
      params.areaFilter.polygonCoords.length >= 3
    ) {
      const poly = params.areaFilter.polygonCoords;
      const minLat = Math.min(...poly.map((p) => p[0]));
      const maxLat = Math.max(...poly.map((p) => p[0]));
      const minLon = Math.min(...poly.map((p) => p[1]));
      const maxLon = Math.max(...poly.map((p) => p[1]));
      const centerLat = (minLat + maxLat) / 2;
      const centerLon = (minLon + maxLon) / 2;
      const maxRad = Math.max(...poly.map((p) => calculateDistanceNm(centerLat, centerLon, p[0], p[1])));
      queryFromLat = centerLat;
      queryFromLon = centerLon;
      queryMaxDistNm = Math.ceil(maxRad * 1.15);
    }
  }

  // 1. Try querying SQLite
  const filter = {
    continent:
      params.areaFilter && params.areaFilter.type !== 'preset'
        ? undefined
        : params.region !== 'random' &&
            params.region.length === 2 &&
            ['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(params.region.toUpperCase())
          ? params.region.toUpperCase()
          : undefined,
    countryCode:
      params.areaFilter && params.areaFilter.type !== 'preset'
        ? undefined
        : params.region !== 'random' &&
            params.region.length === 2 &&
            !['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(params.region.toUpperCase())
          ? params.region.toUpperCase()
          : undefined,
    airportType: allowedTypes.length === 1 ? allowedTypes[0] : undefined,
    surface: surfacePref,
    minRunwayFt: minRequiredRunway,
    maxRunwayFt: maxAllowedRunway,
    fromLat: queryFromLat,
    fromLon: queryFromLon,
    minDistNm: params.minDistNm,
    maxDistNm: queryMaxDistNm,
    limit: params.limit || 120,
  };

  const dbAirports = await safeInvoke<Airport[]>('search_route_airports', { filter });
  if (dbAirports && Array.isArray(dbAirports) && dbAirports.length > 0) {
    const filtered = dbAirports.filter((a) => {
      if (!isEligibleIcaoAirfield(a)) return false;
      if (a.airportType && !allowedTypes.includes(a.airportType as any)) {
        return false;
      }
      // Strict client-side region and continent enforcement
      if (!params.areaFilter || params.areaFilter.type === 'preset') {
        if (params.region && params.region !== 'random') {
          const regUpper = params.region.toUpperCase();
          if (['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(regUpper)) {
            if ((a.continent || '').toUpperCase() !== regUpper) return false;
          } else {
            if ((a.countryCode || '').toUpperCase() !== regUpper) return false;
          }
        }
      }
      if (typeof params.fromLat === 'number' && typeof params.fromLon === 'number') {
        const dist = calculateDistanceNm(params.fromLat, params.fromLon, a.latitude, a.longitude);
        if (typeof params.minDistNm === 'number' && dist < params.minDistNm) return false;
        if (typeof params.maxDistNm === 'number' && dist > params.maxDistNm) return false;
      }
      return true;
    });
    if (filtered.length > 0) {
      return shuffleArray(filtered);
    }
  }

  // 2. Fallback to in-memory seed dataset if DB returns empty or running in web mode
  const fallbackCandidates = FALLBACK_AIRPORTS.filter((a) => {
    if (!isEligibleIcaoAirfield(a)) return false;
    if (a.airportType && !allowedTypes.includes(a.airportType as any)) {
      return false;
    }
    if (!params.areaFilter || params.areaFilter.type === 'preset') {
      if (params.region && params.region !== 'random') {
        const regUpper = params.region.toUpperCase();
        if (['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(regUpper)) {
          if ((a.continent || '').toUpperCase() !== regUpper) return false;
        } else {
          if ((a.countryCode || '').toUpperCase() !== regUpper) return false;
        }
      }
    }
    if (typeof params.fromLat === 'number' && typeof params.fromLon === 'number') {
      const dist = calculateDistanceNm(params.fromLat, params.fromLon, a.latitude, a.longitude);
      if (typeof params.minDistNm === 'number' && dist < params.minDistNm) return false;
      if (typeof params.maxDistNm === 'number' && dist > params.maxDistNm) return false;
    }
    return true;
  });

  if (fallbackCandidates.length > 0) {
    return shuffleArray(fallbackCandidates);
  }

  return [];
}

let lastGeneratedDepartureIcao: string | null = null;

async function getFallbackAirportsForRegion(
  region?: string,
  excludedIcaos: Set<string> = new Set(),
  category: RouteSearchParams['category'] = 'C',
  surfacePref: RouteSearchParams['runwaySurface'] = 'any',
  customMinRunway?: number,
  customMaxRunway?: number,
  areaFilter?: GeographicAreaFilter
): Promise<Airport[]> {
  const profile = AIRCRAFT_CATEGORIES[category] || AIRCRAFT_CATEGORIES['C'];
  const minRequiredRunway = customMinRunway ?? profile.minRunwayFt;
  const maxAllowedRunway = customMaxRunway && customMaxRunway > 0 ? customMaxRunway : undefined;

  let queryFromLat: number | undefined = undefined;
  let queryFromLon: number | undefined = undefined;
  let queryMaxDistNm: number | undefined = undefined;

  if (areaFilter && areaFilter.type !== 'preset') {
    if (areaFilter.type === 'circle' && areaFilter.circleCenter) {
      queryFromLat = areaFilter.circleCenter[0];
      queryFromLon = areaFilter.circleCenter[1];
      queryMaxDistNm = areaFilter.circleRadiusNm || 150;
    } else if (areaFilter.type === 'polygon' && areaFilter.polygonCoords && areaFilter.polygonCoords.length >= 3) {
      const poly = areaFilter.polygonCoords;
      const minLat = Math.min(...poly.map((p) => p[0]));
      const maxLat = Math.max(...poly.map((p) => p[0]));
      const minLon = Math.min(...poly.map((p) => p[1]));
      const maxLon = Math.max(...poly.map((p) => p[1]));
      const centerLat = (minLat + maxLat) / 2;
      const centerLon = (minLon + maxLon) / 2;
      const maxRad = Math.max(...poly.map((p) => calculateDistanceNm(centerLat, centerLon, p[0], p[1])));
      queryFromLat = centerLat;
      queryFromLon = centerLon;
      queryMaxDistNm = Math.ceil(maxRad * 1.15);
    }
  }

  const filter: any = {
    minRunwayFt: minRequiredRunway,
    maxRunwayFt: maxAllowedRunway,
    surface: surfacePref !== 'any' ? surfacePref : undefined,
    fromLat: queryFromLat,
    fromLon: queryFromLon,
    maxDistNm: queryMaxDistNm,
    limit: 100,
  };

  if (!areaFilter || areaFilter.type === 'preset') {
    if (region && region !== 'random') {
      const regUpper = region.toUpperCase();
      if (['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(regUpper)) {
        filter.continent = regUpper;
      } else {
        filter.countryCode = regUpper;
      }
    }
  }

  const matchesArea = (a: Airport): boolean => {
    if (areaFilter && areaFilter.type !== 'preset') {
      if (areaFilter.type === 'circle' && areaFilter.circleCenter) {
        const d = calculateDistanceNm(areaFilter.circleCenter[0], areaFilter.circleCenter[1], a.latitude, a.longitude);
        if (d > (areaFilter.circleRadiusNm || 150)) return false;
      } else if (areaFilter.type === 'polygon' && areaFilter.polygonCoords && areaFilter.polygonCoords.length >= 3) {
        if (!isPointInPolygon(a.latitude, a.longitude, areaFilter.polygonCoords)) return false;
      }
    }
    return true;
  };

  const dbAirports = await safeInvoke<Airport[]>('search_route_airports', { filter });
  if (dbAirports && Array.isArray(dbAirports) && dbAirports.length > 0) {
    const unvisited = dbAirports.filter((a) => {
      if (excludedIcaos.has(a.icao) || isHelipadOrHeliport(a)) return false;
      if (maxAllowedRunway && a.maxRunwayLengthFt && a.maxRunwayLengthFt > maxAllowedRunway) return false;
      if (!matchesArea(a)) return false;
      return true;
    });
    if (unvisited.length > 0) return shuffleArray(unvisited);
    return shuffleArray(dbAirports.filter(matchesArea));
  }

  // Fallback to relaxed airfield query from SQLite
  const relaxed = await safeInvoke<Airport[]>('search_route_airports', {
    filter: { fromLat: queryFromLat, fromLon: queryFromLon, maxDistNm: queryMaxDistNm, limit: 50 },
  });
  if (relaxed && Array.isArray(relaxed) && relaxed.length > 0) {
    const unvisited = relaxed.filter((a) => !excludedIcaos.has(a.icao) && !isHelipadOrHeliport(a) && matchesArea(a));
    if (unvisited.length > 0) return shuffleArray(unvisited);
    return shuffleArray(relaxed.filter(matchesArea));
  }

  // In-memory fallback dataset filtering
  let pool = FALLBACK_AIRPORTS.filter((a) => !excludedIcaos.has(a.icao) && !isHelipadOrHeliport(a) && matchesArea(a));
  if (!areaFilter || areaFilter.type === 'preset') {
    if (region && region !== 'random') {
      const regUpper = region.toUpperCase();
      const regionMatches = pool.filter((a) =>
        ['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(regUpper)
          ? (a.continent || '').toUpperCase() === regUpper
          : (a.countryCode || '').toUpperCase() === regUpper
      );
      if (regionMatches.length > 0) {
        pool = regionMatches;
      }
    }
  }

  if (pool.length > 0) {
    return shuffleArray(pool);
  }

  return FALLBACK_AIRPORTS.filter(matchesArea);
}

/**
 * Safely selects an airport from candidate or fallback lists, guaranteeing a valid Airport object
 */
function pickSafeAirport(
  candidates: Airport[],
  fallbackList: Airport[],
  excludeIcaos: Set<string> = new Set()
): Airport {
  const filteredCandidates = candidates.filter((a) => a && a.icao && !excludeIcaos.has(a.icao));
  if (filteredCandidates.length > 0) {
    return filteredCandidates[Math.floor(Math.random() * filteredCandidates.length)];
  }

  const filteredFallbacks = fallbackList.filter((a) => a && a.icao && !excludeIcaos.has(a.icao));
  if (filteredFallbacks.length > 0) {
    return filteredFallbacks[Math.floor(Math.random() * filteredFallbacks.length)];
  }

  if (fallbackList.length > 0 && fallbackList[0]) {
    return fallbackList[Math.floor(Math.random() * fallbackList.length)];
  }

  const filteredDefault = FALLBACK_AIRPORTS.filter((a) => a && a.icao && !excludeIcaos.has(a.icao));
  if (filteredDefault.length > 0) {
    return filteredDefault[Math.floor(Math.random() * filteredDefault.length)];
  }

  return FALLBACK_AIRPORTS[0];
}

/**
 * Main route generation algorithm
 */
export async function generateRouteSuggestion(params: RouteSearchParams): Promise<GeneratedRoute> {
  const profile = AIRCRAFT_CATEGORIES[params.category];
  const isRoundTrip = params.sectorCount === -1;
  const numSectors = isRoundTrip ? 2 : Math.max(1, params.sectorCount || 1);
  const minRequiredRunway = params.customMinRunwayFt ?? profile.minRunwayFt;
  const maxAllowedRunway = params.customMaxRunwayFt && params.customMaxRunwayFt > 0 ? params.customMaxRunwayFt : undefined;

  // Calculate sector distance range bounds based on user limits and aircraft envelope
  let minSectorDist = 40;
  let maxSectorDist = profile.maxSectorRangeNm;

  const isSectorScope = params.limitScope === 'sector';
  const divisor = isSectorScope ? 1 : numSectors;

  if (params.limitBy === 'distance') {
    if (params.minLimitValue && params.minLimitValue > 0) {
      minSectorDist = Math.max(15, params.minLimitValue / divisor);
    }
    if (params.maxLimitValue && params.maxLimitValue > 0) {
      maxSectorDist = Math.min(profile.maxSectorRangeNm, params.maxLimitValue / divisor);
    }
  } else if (params.limitBy === 'time') {
    // If ground time is included, subtract taxi time per sector to enforce realistic airborne time
    const taxiTimePerSector = params.includeGroundTime ? (profile.taxiOutMinutes + profile.taxiInMinutes) : 0;
    const avgSpeed = profile.cruiseSpeedTasKt * 0.9;

    if (params.minLimitValue && params.minLimitValue > 0) {
      const budgetMin = Math.max(5, (params.minLimitValue / divisor) - taxiTimePerSector);
      minSectorDist = Math.max(10, (budgetMin / 60) * avgSpeed);
    }
    if (params.maxLimitValue && params.maxLimitValue > 0) {
      const budgetMax = Math.max(12, (params.maxLimitValue / divisor) - taxiTimePerSector);
      maxSectorDist = Math.min(profile.maxSectorRangeNm, (budgetMax / 60) * avgSpeed);
    }
  }

  if (params.sectorDistanceLimit && params.sectorDistanceLimit > 0) {
    maxSectorDist = Math.min(maxSectorDist, params.sectorDistanceLimit);
  }

  // Step 1: Resolve Departure Airport
  let departureAirport: Airport | null = null;
  if (params.departureIcao) {
    departureAirport = await resolveAirport(params.departureIcao);
    if (!departureAirport) {
      throw new Error(`Departure airport "${params.departureIcao}" could not be found. Please enter a valid 4-letter ICAO code.`);
    }
  }

  // Step 2: Resolve Final Arrival Airport
  let arrivalAirport: Airport | null = null;
  if (params.arrivalIcao) {
    arrivalAirport = await resolveAirport(params.arrivalIcao);
    if (!arrivalAirport) {
      throw new Error(`Arrival airport "${params.arrivalIcao}" could not be found. Please enter a valid 4-letter ICAO code.`);
    }
  }

  // Step 3: Build the waypoints array [Departure, ...Intermediates, Arrival]
  let waypoints: Airport[] = [];

  if (isRoundTrip) {
    // Round trip: A -> B -> A
    if (!departureAirport) {
      const startCandidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        limit: 100,
        areaFilter: params.areaFilter,
      });

      const excluded = lastGeneratedDepartureIcao ? new Set([lastGeneratedDepartureIcao]) : new Set<string>();
      const fallbackList = await getFallbackAirportsForRegion(
        params.region,
        excluded,
        params.category,
        params.runwaySurface,
        params.customMinRunwayFt,
        maxAllowedRunway,
        params.areaFilter
      );

      departureAirport = pickSafeAirport(startCandidates, fallbackList, excluded);
      lastGeneratedDepartureIcao = departureAirport.icao;
    }

    let turnaroundAirport: Airport | null = arrivalAirport && arrivalAirport.icao !== departureAirport.icao ? arrivalAirport : null;
    if (!turnaroundAirport) {
      let candidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        fromLat: departureAirport.latitude,
        fromLon: departureAirport.longitude,
        minDistNm: minSectorDist,
        maxDistNm: maxSectorDist,
        limit: 50,
        areaFilter: params.areaFilter,
      });

      const excluded = new Set([departureAirport.icao]);
      candidates = candidates.filter((a) => !excluded.has(a.icao));

      if (candidates.length === 0) {
        candidates = await getCandidateAirports({
          category: params.category,
          airportTypePreference: params.airportType,
          runwaySurface: params.runwaySurface,
          minRunwayFt: minRequiredRunway,
          maxRunwayFt: maxAllowedRunway,
          region: params.region,
          fromLat: departureAirport.latitude,
          fromLon: departureAirport.longitude,
          minDistNm: Math.max(10, minSectorDist * 0.7),
          maxDistNm: maxSectorDist * 1.3,
          limit: 50,
          areaFilter: params.areaFilter,
        });
        candidates = candidates.filter((a) => !excluded.has(a.icao));
      }

      const fallbacks = await getFallbackAirportsForRegion(
        params.region,
        excluded,
        params.category,
        params.runwaySurface,
        params.customMinRunwayFt,
        maxAllowedRunway,
        params.areaFilter
      );

      turnaroundAirport = pickSafeAirport(candidates, fallbacks, excluded);
    }

    waypoints = [departureAirport, turnaroundAirport, departureAirport];
  } else if (departureAirport && arrivalAirport) {
    // Case 1: Both Departure and Arrival are specified by user
    const directDist = calculateDistanceNm(
      departureAirport.latitude,
      departureAirport.longitude,
      arrivalAirport.latitude,
      arrivalAirport.longitude
    );

    if (numSectors === 1) {
      if (directDist > maxSectorDist * 1.25) {
        throw new Error(
          `Direct distance between ${departureAirport.icao} and ${arrivalAirport.icao} (${Math.round(directDist)} NM) exceeds your maximum sector limit (${Math.round(maxSectorDist)} NM). Try adding more sectors or increasing the leg limit.`
        );
      }
      waypoints = [departureAirport, arrivalAirport];
    } else {
      if (directDist > numSectors * maxSectorDist * 1.15) {
        throw new Error(
          `The distance between ${departureAirport.icao} and ${arrivalAirport.icao} (${Math.round(directDist)} NM) exceeds the maximum reachable distance for ${numSectors} sectors (${Math.round(numSectors * maxSectorDist)} NM). Try increasing the number of sectors or increasing the limit.`
        );
      }

      waypoints = [departureAirport];
      let currentOrigin = departureAirport;
      const visited = new Set<string>([departureAirport.icao, arrivalAirport.icao]);

      for (let leg = 1; leg < numSectors; leg++) {
        const remSectors = numSectors - leg;
        const fraction = leg / numSectors;
        const [idealLat, idealLon] = interpolateGreatCircle(
          departureAirport.latitude,
          departureAirport.longitude,
          arrivalAirport.latitude,
          arrivalAirport.longitude,
          fraction
        );

        let candidates = await getCandidateAirports({
          category: params.category,
          airportTypePreference: params.airportType,
          runwaySurface: params.runwaySurface,
          minRunwayFt: minRequiredRunway,
          maxRunwayFt: maxAllowedRunway,
          region: params.region,
          fromLat: currentOrigin.latitude,
          fromLon: currentOrigin.longitude,
          minDistNm: Math.max(10, minSectorDist * 0.7),
          maxDistNm: maxSectorDist * 1.15,
          limit: 80,
          areaFilter: params.areaFilter,
        });

        candidates = candidates.filter((a) => {
          if (visited.has(a.icao)) return false;
          const distToArr = calculateDistanceNm(a.latitude, a.longitude, arrivalAirport.latitude, arrivalAirport.longitude);
          return distToArr <= remSectors * maxSectorDist * 1.25;
        });

        if (candidates.length === 0) {
          candidates = await getCandidateAirports({
            category: params.category,
            airportTypePreference: params.airportType,
            runwaySurface: params.runwaySurface,
            minRunwayFt: minRequiredRunway,
            maxRunwayFt: maxAllowedRunway,
            region: params.region,
            fromLat: idealLat,
            fromLon: idealLon,
            maxDistNm: maxSectorDist * 0.8,
            limit: 50,
            areaFilter: params.areaFilter,
          });
          candidates = candidates.filter((a) => !visited.has(a.icao));
        }

        if (candidates.length === 0) {
          throw new Error(
            `Unable to find intermediate connecting aerodromes between ${departureAirport.icao} and ${arrivalAirport.icao} within the sector limits. Try adjusting runway or sector constraints.`
          );
        }

        candidates.sort((a, b) => {
          const distA = calculateDistanceNm(a.latitude, a.longitude, idealLat, idealLon);
          const distB = calculateDistanceNm(b.latitude, b.longitude, idealLat, idealLon);
          return distA - distB;
        });

        const nextHop = candidates[0];
        visited.add(nextHop.icao);
        waypoints.push(nextHop);
        currentOrigin = nextHop;
      }

      const finalDist = calculateDistanceNm(
        currentOrigin.latitude,
        currentOrigin.longitude,
        arrivalAirport.latitude,
        arrivalAirport.longitude
      );
      if (finalDist > maxSectorDist * 1.25) {
        throw new Error(
          `Unable to construct a valid corridor between ${departureAirport.icao} and ${arrivalAirport.icao} where each leg is under ${Math.round(maxSectorDist)} NM. Try adding more sectors.`
        );
      }
      waypoints.push(arrivalAirport);
    }
  } else if (!departureAirport && arrivalAirport) {
    // Case 2: Only Arrival is specified -> Generate BACKWARDS from arrivalAirport!
    const reversedWaypoints: Airport[] = [arrivalAirport];
    let currentHead = arrivalAirport;
    const visited = new Set<string>([arrivalAirport.icao]);

    for (let step = 0; step < numSectors; step++) {
      let candidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        fromLat: currentHead.latitude,
        fromLon: currentHead.longitude,
        minDistNm: minSectorDist,
        maxDistNm: maxSectorDist,
        limit: 80,
        areaFilter: params.areaFilter,
      });

      candidates = candidates.filter((a) => !visited.has(a.icao));

      if (candidates.length === 0) {
        candidates = await getCandidateAirports({
          category: params.category,
          airportTypePreference: params.airportType,
          runwaySurface: params.runwaySurface,
          minRunwayFt: minRequiredRunway,
          maxRunwayFt: maxAllowedRunway,
          region: params.region,
          fromLat: currentHead.latitude,
          fromLon: currentHead.longitude,
          minDistNm: Math.max(10, minSectorDist * 0.7),
          maxDistNm: maxSectorDist * 1.3,
          limit: 80,
          areaFilter: params.areaFilter,
        });
        candidates = candidates.filter((a) => !visited.has(a.icao));
      }

      if (candidates.length === 0) {
        const fallbacks = await getFallbackAirportsForRegion(
          params.region,
          visited,
          params.category,
          params.runwaySurface,
          params.customMinRunwayFt,
          maxAllowedRunway,
          params.areaFilter
        );
        const nearbyFallbacks = fallbacks.filter((a) => {
          const d = calculateDistanceNm(currentHead.latitude, currentHead.longitude, a.latitude, a.longitude);
          return d >= Math.max(10, minSectorDist * 0.6) && d <= maxSectorDist * 1.4;
        });
        if (nearbyFallbacks.length > 0) {
          candidates = nearbyFallbacks;
        }
      }

      if (candidates.length === 0) {
        throw new Error(
          `Unable to find suitable connecting aerodromes within the sector limit (${Math.round(maxSectorDist)} NM) leading to ${arrivalAirport.icao}. Try relaxing the runway or sector limits.`
        );
      }

      const prevHop = candidates[0];
      visited.add(prevHop.icao);
      reversedWaypoints.push(prevHop);
      currentHead = prevHop;
    }

    waypoints = reversedWaypoints.reverse();
  } else {
    // Case 3: Departure is specified (or random), Arrival is procedural -> Forward Generation
    if (!departureAirport) {
      const startCandidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        limit: 100,
        areaFilter: params.areaFilter,
      });

      const excluded = lastGeneratedDepartureIcao ? new Set([lastGeneratedDepartureIcao]) : new Set<string>();
      const fallbackList = await getFallbackAirportsForRegion(
        params.region,
        excluded,
        params.category,
        params.runwaySurface,
        params.customMinRunwayFt,
        maxAllowedRunway,
        params.areaFilter
      );

      departureAirport = pickSafeAirport(startCandidates, fallbackList, excluded);
      lastGeneratedDepartureIcao = departureAirport.icao;
    }

    waypoints = [departureAirport];
    let currentOrigin = departureAirport;
    const visited = new Set<string>([departureAirport.icao]);

    for (let step = 1; step <= numSectors; step++) {
      let candidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        fromLat: currentOrigin.latitude,
        fromLon: currentOrigin.longitude,
        minDistNm: minSectorDist,
        maxDistNm: maxSectorDist,
        limit: 80,
        areaFilter: params.areaFilter,
      });

      candidates = candidates.filter((a) => !visited.has(a.icao));

      if (candidates.length === 0) {
        candidates = await getCandidateAirports({
          category: params.category,
          airportTypePreference: params.airportType,
          runwaySurface: params.runwaySurface,
          minRunwayFt: minRequiredRunway,
          maxRunwayFt: maxAllowedRunway,
          region: params.region,
          fromLat: currentOrigin.latitude,
          fromLon: currentOrigin.longitude,
          minDistNm: Math.max(10, minSectorDist * 0.7),
          maxDistNm: maxSectorDist * 1.3,
          limit: 80,
          areaFilter: params.areaFilter,
        });
        candidates = candidates.filter((a) => !visited.has(a.icao));
      }

      if (candidates.length === 0) {
        const fallbacks = await getFallbackAirportsForRegion(
          params.region,
          visited,
          params.category,
          params.runwaySurface,
          params.customMinRunwayFt,
          maxAllowedRunway,
          params.areaFilter
        );
        const nearbyFallbacks = fallbacks.filter((a) => {
          const d = calculateDistanceNm(currentOrigin.latitude, currentOrigin.longitude, a.latitude, a.longitude);
          return d >= Math.max(10, minSectorDist * 0.6) && d <= maxSectorDist * 1.4;
        });
        if (nearbyFallbacks.length > 0) {
          candidates = nearbyFallbacks;
        }
      }

      if (candidates.length === 0) {
        throw new Error(
          `Unable to find connecting aerodromes within the sector limit (${Math.round(maxSectorDist)} NM) after ${currentOrigin.icao}. Try adjusting constraints.`
        );
      }

      const nextHop = candidates[0];
      visited.add(nextHop.icao);
      waypoints.push(nextHop);
      currentOrigin = nextHop;
    }
  }

  // Verify all waypoints are valid Airport objects with icao, latitude, and longitude
  const validWaypoints = waypoints.filter((w): w is Airport => Boolean(w && w.icao && typeof w.latitude === 'number' && typeof w.longitude === 'number'));
  if (validWaypoints.length < 2) {
    throw new Error('Unable to construct a valid route path with the selected constraints. Try adjusting the departure, arrival, or region filters.');
  }

  // Step 4: Compute individual sectors and overall route metrics
  const sectors: RouteSector[] = [];
  let totalDistanceNm = 0;
  let totalAirborneMinutes = 0;
  let totalGroundMinutes = 0;

  for (let i = 0; i < validWaypoints.length - 1; i++) {
    const dep = validWaypoints[i];
    const arr = validWaypoints[i + 1];

    const dist = calculateDistanceNm(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
    const bearing = calculateInitialBearing(dep.latitude, dep.longitude, arr.latitude, arr.longitude);

    // Query terrain-aware corridor minimum safe altitude (MSA / Grid MORA)
    const corridorMsaResult = getCorridorMsa(dep.latitude, dep.longitude, arr.latitude, arr.longitude, 10);

    const profileMetrics = calculateSectorFlightProfile(
      dist,
      params.category,
      params.includeGroundTime,
      dep.elevationFt || 0,
      arr.elevationFt || 0,
      corridorMsaResult.msaFt,
      bearing,
      corridorMsaResult.peakTerrainFt,
      corridorMsaResult.requiredMarginFt
    );

    let terrainWarning: string | undefined = undefined;
    if (corridorMsaResult.isMountainous) {
      terrainWarning = `Mountainous Terrain Advisory: This sector traverses mountainous terrain (elevation variation ≥ 3,000 ft within 10 NM). Recommended altitude is cleared with a 2,000 ft margin above peak terrain (~${corridorMsaResult.peakTerrainFt.toLocaleString()} ft MSL).`;
    }

    sectors.push({
      sectorIndex: i + 1,
      departure: dep,
      arrival: arr,
      distanceNm: profileMetrics.distanceNm,
      initialBearingDeg: bearing,
      airborneMinutes: profileMetrics.airborneMinutes,
      groundMinutes: profileMetrics.groundMinutes,
      totalMinutes: profileMetrics.totalMinutes,
      climbMinutes: profileMetrics.climbMinutes,
      cruiseMinutes: profileMetrics.cruiseMinutes,
      descentMinutes: profileMetrics.descentMinutes,
      cruiseAltitudeFt: profileMetrics.cruiseAltitudeFt,
      cruiseSpeedKt: profileMetrics.cruiseSpeedKt,
      corridorMsaFt: corridorMsaResult.msaFt,
      peakTerrainFt: corridorMsaResult.peakTerrainFt,
      limitingCoord: corridorMsaResult.limitingCoord,
      isAltitudeTerrainClamped: profileMetrics.isAltitudeTerrainClamped,
      terrainWarning,
      isMountainous: corridorMsaResult.isMountainous,
      maxTerrainVariation10Nm: corridorMsaResult.maxTerrainVariation10Nm,
      requiredMarginFt: corridorMsaResult.requiredMarginFt,
    });

    totalDistanceNm += profileMetrics.distanceNm;
    totalAirborneMinutes += profileMetrics.airborneMinutes;
    totalGroundMinutes += profileMetrics.groundMinutes;
  }

  const aircraftExample = profile.examples[0] || 'Aircraft';

  return {
    id: `route-${Date.now()}`,
    createdAt: new Date().toISOString(),
    aircraftCategory: params.category,
    aircraftName: aircraftExample,
    sectors,
    totalDistanceNm: Math.round(totalDistanceNm * 10) / 10,
    totalAirborneMinutes,
    totalGroundMinutes,
    totalDurationMinutes: totalAirborneMinutes + totalGroundMinutes,
    includeGroundTime: params.includeGroundTime,
    isRoundTrip,
    areaFilter: params.areaFilter,
  };
}
