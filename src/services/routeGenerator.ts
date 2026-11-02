import { Airport } from '../types/flight';
import { RouteSearchParams, GeneratedRoute, RouteSector } from '../types/route';
import { AIRCRAFT_CATEGORIES, calculateSectorFlightProfile } from '../data/aircraftCategories';
import { calculateDistanceNm, calculateInitialBearing, isHelipadOrHeliport } from '../data/mockData';
import { FALLBACK_AIRPORTS } from '../data/fallbackAirports';

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
    return true;
  };

  // 1. Try querying SQLite
  const filter = {
    continent: params.region !== 'random' && params.region.length === 2 && ['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(params.region.toUpperCase())
      ? params.region.toUpperCase()
      : undefined,
    countryCode: params.region !== 'random' && params.region.length === 2 && !['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(params.region.toUpperCase())
      ? params.region.toUpperCase()
      : undefined,
    airportType: allowedTypes.length === 1 ? allowedTypes[0] : undefined,
    surface: surfacePref,
    minRunwayFt: minRequiredRunway,
    maxRunwayFt: maxAllowedRunway,
    fromLat: params.fromLat,
    fromLon: params.fromLon,
    minDistNm: params.minDistNm,
    maxDistNm: params.maxDistNm,
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
      if (params.region && params.region !== 'random') {
        const regUpper = params.region.toUpperCase();
        if (['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(regUpper)) {
          if ((a.continent || '').toUpperCase() !== regUpper) return false;
        } else {
          if ((a.countryCode || '').toUpperCase() !== regUpper) return false;
        }
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
    if (params.region && params.region !== 'random') {
      const regUpper = params.region.toUpperCase();
      if (['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(regUpper)) {
        if ((a.continent || '').toUpperCase() !== regUpper) return false;
      } else {
        if ((a.countryCode || '').toUpperCase() !== regUpper) return false;
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
  customMaxRunway?: number
): Promise<Airport[]> {
  const profile = AIRCRAFT_CATEGORIES[category] || AIRCRAFT_CATEGORIES['C'];
  const minRequiredRunway = customMinRunway ?? profile.minRunwayFt;
  const maxAllowedRunway = customMaxRunway && customMaxRunway > 0 ? customMaxRunway : undefined;

  const filter: any = {
    minRunwayFt: minRequiredRunway,
    maxRunwayFt: maxAllowedRunway,
    surface: surfacePref !== 'any' ? surfacePref : undefined,
    limit: 100,
  };

  if (region && region !== 'random') {
    const regUpper = region.toUpperCase();
    if (['EU', 'NA', 'SA', 'AS', 'AF', 'OC'].includes(regUpper)) {
      filter.continent = regUpper;
    } else {
      filter.countryCode = regUpper;
    }
  }

  const dbAirports = await safeInvoke<Airport[]>('search_route_airports', { filter });
  if (dbAirports && Array.isArray(dbAirports) && dbAirports.length > 0) {
    const unvisited = dbAirports.filter((a) => {
      if (excludedIcaos.has(a.icao) || isHelipadOrHeliport(a)) return false;
      if (maxAllowedRunway && a.maxRunwayLengthFt && a.maxRunwayLengthFt > maxAllowedRunway) return false;
      return true;
    });
    if (unvisited.length > 0) return shuffleArray(unvisited);
    return shuffleArray(dbAirports);
  }

  // Fallback to relaxed airfield query from SQLite
  const relaxed = await safeInvoke<Airport[]>('search_route_airports', { filter: { limit: 50 } });
  if (relaxed && Array.isArray(relaxed) && relaxed.length > 0) {
    const unvisited = relaxed.filter((a) => !excludedIcaos.has(a.icao) && !isHelipadOrHeliport(a));
    if (unvisited.length > 0) return shuffleArray(unvisited);
    return shuffleArray(relaxed);
  }

  // In-memory fallback dataset filtering
  let pool = FALLBACK_AIRPORTS.filter((a) => !excludedIcaos.has(a.icao) && !isHelipadOrHeliport(a));
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

  if (pool.length > 0) {
    return shuffleArray(pool);
  }

  // Ultimate fallback guarantee: non-excluded or full fallback list
  const nonExcluded = FALLBACK_AIRPORTS.filter((a) => !excludedIcaos.has(a.icao));
  if (nonExcluded.length > 0) {
    return shuffleArray(nonExcluded);
  }

  return shuffleArray(FALLBACK_AIRPORTS);
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
    // Convert duration (minutes) to distance (NM) estimate
    const avgSpeed = profile.cruiseSpeedTasKt * 0.9;
    if (params.minLimitValue && params.minLimitValue > 0) {
      minSectorDist = Math.max(15, ((params.minLimitValue / 60) * avgSpeed) / divisor);
    }
    if (params.maxLimitValue && params.maxLimitValue > 0) {
      maxSectorDist = Math.min(profile.maxSectorRangeNm, ((params.maxLimitValue / 60) * avgSpeed) / divisor);
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

  // If no departure specified, pick a random candidate in region
  if (!departureAirport) {
    const startCandidates = await getCandidateAirports({
      category: params.category,
      airportTypePreference: params.airportType,
      runwaySurface: params.runwaySurface,
      minRunwayFt: minRequiredRunway,
      maxRunwayFt: maxAllowedRunway,
      region: params.region,
      limit: 100,
    });

    const excluded = lastGeneratedDepartureIcao ? new Set([lastGeneratedDepartureIcao]) : new Set<string>();
    const fallbackList = await getFallbackAirportsForRegion(
      params.region,
      excluded,
      params.category,
      params.runwaySurface,
      params.customMinRunwayFt,
      maxAllowedRunway
    );

    departureAirport = pickSafeAirport(startCandidates, fallbackList, excluded);
    lastGeneratedDepartureIcao = departureAirport.icao;
  }

  // Step 3: Build the waypoints array [Departure, ...Intermediates, Arrival]
  const waypoints: Airport[] = [departureAirport];

  if (isRoundTrip) {
    // Round trip: A -> B -> A
    // Find destination B
    let turnaroundAirport: Airport | null = arrivalAirport;
    if (!turnaroundAirport || turnaroundAirport.icao === departureAirport.icao) {
      const candidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        fromLat: departureAirport.latitude,
        fromLon: departureAirport.longitude,
        minDistNm: Math.max(15, minSectorDist),
        maxDistNm: maxSectorDist,
        limit: 50,
      });

      const excluded = new Set([departureAirport.icao]);
      const fallbacks = await getFallbackAirportsForRegion(
        params.region,
        excluded,
        params.category,
        params.runwaySurface,
        params.customMinRunwayFt,
        maxAllowedRunway
      );

      turnaroundAirport = pickSafeAirport(candidates, fallbacks, excluded);
    }
    waypoints.push(turnaroundAirport);
    waypoints.push(departureAirport);
  } else if (numSectors === 1) {
    // Single Sector: A -> B
    if (!arrivalAirport || arrivalAirport.icao === departureAirport.icao) {
      const candidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        fromLat: departureAirport.latitude,
        fromLon: departureAirport.longitude,
        minDistNm: Math.max(15, minSectorDist),
        maxDistNm: maxSectorDist,
        limit: 50,
      });

      const excluded = new Set([departureAirport.icao]);
      const fallbacks = await getFallbackAirportsForRegion(
        params.region,
        excluded,
        params.category,
        params.runwaySurface,
        params.customMinRunwayFt,
        maxAllowedRunway
      );

      arrivalAirport = pickSafeAirport(candidates, fallbacks, excluded);
    }
    waypoints.push(arrivalAirport);
  } else {
    // Multi-Sector: 2 or 3 Sectors
    let currentOrigin = departureAirport;

    for (let i = 1; i < numSectors; i++) {
      // Find intermediate stop
      const candidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        fromLat: currentOrigin.latitude,
        fromLon: currentOrigin.longitude,
        minDistNm: Math.max(15, minSectorDist),
        maxDistNm: maxSectorDist,
        limit: 50,
      });

      const prevIcaos = new Set(waypoints.map((w) => w.icao));
      if (arrivalAirport) prevIcaos.add(arrivalAirport.icao);

      const fallbacks = await getFallbackAirportsForRegion(
        params.region,
        prevIcaos,
        params.category,
        params.runwaySurface,
        params.customMinRunwayFt,
        maxAllowedRunway
      );

      const nextHop = pickSafeAirport(candidates, fallbacks, prevIcaos);
      waypoints.push(nextHop);
      currentOrigin = nextHop;
    }

    // Final Arrival
    if (!arrivalAirport || waypoints.some((w) => w.icao === arrivalAirport?.icao)) {
      const finalCandidates = await getCandidateAirports({
        category: params.category,
        airportTypePreference: params.airportType,
        runwaySurface: params.runwaySurface,
        minRunwayFt: minRequiredRunway,
        maxRunwayFt: maxAllowedRunway,
        region: params.region,
        fromLat: currentOrigin.latitude,
        fromLon: currentOrigin.longitude,
        minDistNm: Math.max(15, minSectorDist),
        maxDistNm: maxSectorDist,
        limit: 50,
      });

      const prevIcaos = new Set(waypoints.map((w) => w.icao));
      const fallbacks = await getFallbackAirportsForRegion(
        params.region,
        prevIcaos,
        params.category,
        params.runwaySurface,
        params.customMinRunwayFt,
        maxAllowedRunway
      );

      arrivalAirport = pickSafeAirport(finalCandidates, fallbacks, prevIcaos);
    }
    waypoints.push(arrivalAirport);
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

    const profileMetrics = calculateSectorFlightProfile(
      dist,
      params.category,
      params.includeGroundTime,
      dep.elevationFt || 0,
      arr.elevationFt || 0
    );

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
  };
}
