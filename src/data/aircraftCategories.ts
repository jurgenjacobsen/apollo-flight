import { AircraftCategory, AircraftCategoryProfile } from '../types/route';
import { clampToSemiCircularRule } from '../services/terrainMora';

export const AIRCRAFT_CATEGORIES: Record<AircraftCategory, AircraftCategoryProfile> = {
  A: {
    category: 'A',
    name: 'Category A (< 91 kt)',
    speedRange: 'Vref < 91 kt',
    examples: ['Cessna 152', 'Cessna 172 Skyhawk', 'Piper PA-28', 'Diamond DA20', 'Super Cub'],
    cruiseSpeedTasKt: 115,
    typicalCruiseAltFt: 6500,
    climbRateFpm: 750,
    climbSpeedTasKt: 80,
    descentRateFpm: 600,
    descentSpeedTasKt: 105,
    taxiOutMinutes: 8,
    taxiInMinutes: 5,
    maxSectorRangeNm: 500,
    minRunwayFt: 1000,
    allowedAirportTypes: ['small_airport', 'medium_airport', 'large_airport'],
  },
  B: {
    category: 'B',
    name: 'Category B (91–120 kt)',
    speedRange: 'Vref 91–120 kt',
    examples: ['King Air 350', 'DHC-6 Twin Otter', 'Pilatus PC-12', 'Baron 58', 'TBM 930'],
    cruiseSpeedTasKt: 260,
    typicalCruiseAltFt: 22000,
    climbRateFpm: 1500,
    climbSpeedTasKt: 160,
    descentRateFpm: 1200,
    descentSpeedTasKt: 220,
    taxiOutMinutes: 10,
    taxiInMinutes: 6,
    maxSectorRangeNm: 1400,
    minRunwayFt: 2500,
    allowedAirportTypes: ['small_airport', 'medium_airport', 'large_airport'],
  },
  C: {
    category: 'C',
    name: 'Category C (121–140 kt)',
    speedRange: 'Vref 121–140 kt',
    examples: ['Airbus A320neo', 'Boeing 737-800', 'Embraer E190', 'CRJ-900', 'Boeing 757'],
    cruiseSpeedTasKt: 450,
    typicalCruiseAltFt: 35000,
    climbRateFpm: 2200,
    climbSpeedTasKt: 280,
    descentRateFpm: 1800,
    descentSpeedTasKt: 280,
    taxiOutMinutes: 12,
    taxiInMinutes: 8,
    maxSectorRangeNm: 3200,
    minRunwayFt: 5000,
    allowedAirportTypes: ['medium_airport', 'large_airport'],
  },
  D: {
    category: 'D',
    name: 'Category D (141–165 kt)',
    speedRange: 'Vref 141–165 kt',
    examples: ['Boeing 777-300ER', 'Boeing 787-9 Dreamliner', 'Airbus A350-900', 'Airbus A330', 'B747-400'],
    cruiseSpeedTasKt: 490,
    typicalCruiseAltFt: 38000,
    climbRateFpm: 2000,
    climbSpeedTasKt: 300,
    descentRateFpm: 1800,
    descentSpeedTasKt: 290,
    taxiOutMinutes: 15,
    taxiInMinutes: 10,
    maxSectorRangeNm: 7500,
    minRunwayFt: 6500,
    allowedAirportTypes: ['large_airport'],
  },
  E: {
    category: 'E',
    name: 'Category E (166–210 kt)',
    speedRange: 'Vref 166–210 kt',
    examples: ['Concorde', 'Military Jets (F/A-18, Eurofighter)', 'Tu-144'],
    cruiseSpeedTasKt: 540,
    typicalCruiseAltFt: 50000,
    climbRateFpm: 3500,
    climbSpeedTasKt: 350,
    descentRateFpm: 2500,
    descentSpeedTasKt: 320,
    taxiOutMinutes: 15,
    taxiInMinutes: 10,
    maxSectorRangeNm: 4000,
    minRunwayFt: 7500,
    allowedAirportTypes: ['large_airport'],
  },
  F: {
    category: 'F',
    name: 'Category F (Heavy / Super)',
    speedRange: 'Heavy Super / Code F',
    examples: ['Airbus A380-800', 'Antonov An-225 Mriya', 'Boeing 747-8 Intercontinental'],
    cruiseSpeedTasKt: 490,
    typicalCruiseAltFt: 37000,
    climbRateFpm: 1800,
    climbSpeedTasKt: 290,
    descentRateFpm: 1600,
    descentSpeedTasKt: 280,
    taxiOutMinutes: 18,
    taxiInMinutes: 12,
    maxSectorRangeNm: 8000,
    minRunwayFt: 8500,
    allowedAirportTypes: ['large_airport'],
  },
};

/**
 * Calculates sector duration with precision physics:
 * - Climb phase time & distance
 * - Descent phase time & distance
 * - Level-off altitude adjustment if sector is too short to reach standard FL
 * - Cruise phase at category TAS
 * - Optional taxi-out / taxi-in ground time
 */
export function calculateSectorFlightProfile(
  distanceNm: number,
  category: AircraftCategory,
  includeGroundTime: boolean,
  originElevationFt: number = 0,
  destElevationFt: number = 0,
  corridorMsaFt: number = 1500,
  initialBearingDeg: number = 0,
  peakTerrainFt: number = 0,
  requiredMarginFt: number = 1000
) {
  const profile = AIRCRAFT_CATEGORIES[category];

  // Base altitudes
  const baseCruiseAlt = profile.typicalCruiseAltFt;
  const netClimbFt = Math.max(1000, baseCruiseAlt - originElevationFt);
  const netDescentFt = Math.max(1000, baseCruiseAlt - destElevationFt);

  // Unconstrained climb & descent estimates
  const climbMinutes = netClimbFt / profile.climbRateFpm;
  const climbDistanceNm = (climbMinutes / 60) * profile.climbSpeedTasKt;

  const descentMinutes = netDescentFt / profile.descentRateFpm;
  const descentDistanceNm = (descentMinutes / 60) * profile.descentSpeedTasKt;

  const minTripDistance = climbDistanceNm + descentDistanceNm;

  let computedCruiseAlt = baseCruiseAlt;

  if (distanceNm < minTripDistance) {
    // Short hop: Scale altitude parabolically
    const scale = Math.max(0.25, Math.min(0.95, distanceNm / minTripDistance));
    computedCruiseAlt = Math.round((baseCruiseAlt * scale) / 1000) * 1000;
  }

  // Terrain-Aware Clamping & Semi-Circular Rule Alignment:
  // Must ensure altitude margin between cruise altitude and terrain is at least requiredMarginFt
  // (1,000 ft in non-mountainous, 2,000 ft in mountainous where variation within 10 NM >= 3,000 ft)
  const minSafeAlt = Math.max(corridorMsaFt, peakTerrainFt + requiredMarginFt);
  const targetAlt = Math.max(computedCruiseAlt, minSafeAlt);
  const clampedCruiseAlt = clampToSemiCircularRule(targetAlt, initialBearingDeg);
  const isAltitudeTerrainClamped = clampedCruiseAlt > computedCruiseAlt;

  // Recalculate climb and descent phases for actual assigned cruising altitude
  const actualClimbFt = Math.max(1000, clampedCruiseAlt - originElevationFt);
  const actualDescentFt = Math.max(1000, clampedCruiseAlt - destElevationFt);

  let finalClimbMinutes = actualClimbFt / profile.climbRateFpm;
  let finalDescentMinutes = actualDescentFt / profile.descentRateFpm;

  const actualClimbDistNm = (finalClimbMinutes / 60) * profile.climbSpeedTasKt;
  const actualDescentDistNm = (finalDescentMinutes / 60) * profile.descentSpeedTasKt;
  const totalClimbDescentDist = actualClimbDistNm + actualDescentDistNm;

  let cruiseDistanceNm = 0;
  let cruiseMinutes = 0;

  if (distanceNm >= totalClimbDescentDist) {
    cruiseDistanceNm = distanceNm - totalClimbDescentDist;
    cruiseMinutes = (cruiseDistanceNm / profile.cruiseSpeedTasKt) * 60;
  } else {
    // High mountain crossing on a short sector:
    // Scale climb and descent phases to fit the distance
    const distScale = Math.max(0.5, distanceNm / totalClimbDescentDist);
    finalClimbMinutes *= distScale;
    finalDescentMinutes *= distScale;
    cruiseDistanceNm = 0;
    cruiseMinutes = 0;
  }

  const airborneMinutes = Math.round(finalClimbMinutes + cruiseMinutes + finalDescentMinutes);
  const groundMinutes = includeGroundTime ? (profile.taxiOutMinutes + profile.taxiInMinutes) : 0;
  const totalMinutes = airborneMinutes + groundMinutes;

  return {
    distanceNm: Math.round(distanceNm * 10) / 10,
    airborneMinutes: Math.max(5, airborneMinutes),
    groundMinutes,
    totalMinutes: Math.max(5, totalMinutes),
    climbMinutes: Math.round(finalClimbMinutes),
    cruiseMinutes: Math.round(cruiseMinutes),
    descentMinutes: Math.round(finalDescentMinutes),
    cruiseAltitudeFt: clampedCruiseAlt,
    cruiseSpeedKt: profile.cruiseSpeedTasKt,
    isAltitudeTerrainClamped,
  };
}

export function formatDurationHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/**
 * Formats an altitude according to aviation standard:
 * - 3,000 ft or lower: shown in feet (e.g. "3,000 ft", "2,500 ft")
 * - Above 3,000 ft: shown as 3-digit zero-padded Flight Level (e.g. "FL060" for 6,000 ft, "FL600" for 60,000 ft)
 */
export function formatFlightLevelOrAltitude(altitudeFt: number): string {
  if (altitudeFt <= 3000) {
    return `${Math.round(altitudeFt).toLocaleString()} ft`;
  }
  const fl = Math.round(altitudeFt / 100);
  return `FL${String(fl).padStart(3, '0')}`;
}
