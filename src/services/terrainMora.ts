/**
 * Corridor Terrain-Aware Minimum Safe Altitude (MSA / Grid MORA) Query Engine
 *
 * Implements ICAO/FAA terrain clearance rules:
 * - 1,000 ft clearance margin in non-mountainous terrain.
 * - 2,000 ft clearance margin in mountainous terrain.
 * - Mountainous terrain is defined when terrain elevation variation within 10 NM is >= 3,000 ft.
 * - Clamps cruising flight levels to comply with both obstacle clearance and semi-circular IFR rules.
 */

export interface CorridorMsaResult {
  msaFt: number;
  peakTerrainFt: number;
  limitingCoord: [number, number];
  isMountainous: boolean;
  maxTerrainVariation10Nm: number;
  requiredMarginFt: number;
}

interface MountainRegion {
  name: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  baseElevFt: number;
  peakElevFt: number;
  centers: Array<{ lat: number; lon: number; peakElevFt: number; radiusDeg: number }>;
}

// Global relief models with actual ground elevation peaks in feet MSL
const MOUNTAIN_REGIONS: MountainRegion[] = [
  {
    name: 'European Alps',
    minLat: 43.5,
    maxLat: 48.2,
    minLon: 5.0,
    maxLon: 16.5,
    baseElevFt: 2500,
    peakElevFt: 15800,
    centers: [
      { lat: 45.83, lon: 6.86, peakElevFt: 15800, radiusDeg: 1.2 }, // Mont Blanc massif (15,774 ft)
      { lat: 45.98, lon: 7.66, peakElevFt: 15200, radiusDeg: 1.1 }, // Matterhorn & Monte Rosa
      { lat: 46.54, lon: 8.00, peakElevFt: 13600, radiusDeg: 1.2 }, // Bernese Oberland (Jungfrau)
      { lat: 47.07, lon: 12.69, peakElevFt: 12460, radiusDeg: 1.4 }, // Grossglockner / Hohe Tauern
      { lat: 46.43, lon: 11.85, peakElevFt: 11000, radiusDeg: 1.3 }, // Dolomites / Marmolada
      { lat: 47.26, lon: 11.39, peakElevFt: 9800, radiusDeg: 1.2 }, // Innsbruck / Karwendel / Tirol
    ],
  },
  {
    name: 'Pyrenees',
    minLat: 42.0,
    maxLat: 43.5,
    minLon: -2.2,
    maxLon: 3.2,
    baseElevFt: 2000,
    peakElevFt: 11200,
    centers: [
      { lat: 42.63, lon: 0.66, peakElevFt: 11200, radiusDeg: 1.2 }, // Pico de Aneto (11,168 ft)
      { lat: 42.82, lon: -0.14, peakElevFt: 10800, radiusDeg: 1.1 }, // Vignemale
    ],
  },
  {
    name: 'Carpathians & High Tatras',
    minLat: 46.5,
    maxLat: 50.2,
    minLon: 18.5,
    maxLon: 26.5,
    baseElevFt: 1800,
    peakElevFt: 8711,
    centers: [
      { lat: 49.16, lon: 20.13, peakElevFt: 8711, radiusDeg: 0.9 }, // Gerlachovsky stit (Tatras)
      { lat: 45.60, lon: 24.74, peakElevFt: 8350, radiusDeg: 1.3 }, // Moldoveanu (Transylvanian Alps)
    ],
  },
  {
    name: 'Caucasus',
    minLat: 41.0,
    maxLat: 44.5,
    minLon: 38.0,
    maxLon: 49.0,
    baseElevFt: 3000,
    peakElevFt: 18510,
    centers: [
      { lat: 43.35, lon: 42.44, peakElevFt: 18510, radiusDeg: 1.5 }, // Mt Elbrus (18,510 ft)
      { lat: 42.70, lon: 44.50, peakElevFt: 16580, radiusDeg: 1.3 }, // Mt Kazbek
    ],
  },
  {
    name: 'Scandinavian Mountains',
    minLat: 58.5,
    maxLat: 69.5,
    minLon: 6.0,
    maxLon: 19.0,
    baseElevFt: 1500,
    peakElevFt: 8100,
    centers: [
      { lat: 61.64, lon: 8.31, peakElevFt: 8100, radiusDeg: 1.5 }, // Galdhopiggen
      { lat: 67.90, lon: 18.52, peakElevFt: 6880, radiusDeg: 1.5 }, // Kebnekaise
    ],
  },
  {
    name: 'Colorado & Central Rockies',
    minLat: 36.5,
    maxLat: 42.0,
    minLon: -109.5,
    maxLon: -104.5,
    baseElevFt: 5200,
    peakElevFt: 14440,
    centers: [
      { lat: 39.12, lon: -106.44, peakElevFt: 14440, radiusDeg: 1.4 }, // Mt Elbert / Sawatch / Aspen
      { lat: 38.84, lon: -105.04, peakElevFt: 14115, radiusDeg: 1.1 }, // Pikes Peak / Front Range
      { lat: 37.80, lon: -107.50, peakElevFt: 14300, radiusDeg: 1.3 }, // San Juan Mountains
    ],
  },
  {
    name: 'Northern Rockies & Tetons',
    minLat: 42.0,
    maxLat: 54.0,
    minLon: -117.0,
    maxLon: -108.0,
    baseElevFt: 4500,
    peakElevFt: 13800,
    centers: [
      { lat: 43.18, lon: -109.65, peakElevFt: 13800, radiusDeg: 1.2 }, // Gannett Peak / Wind River
      { lat: 43.74, lon: -110.80, peakElevFt: 13775, radiusDeg: 1.0 }, // Grand Teton
      { lat: 53.11, lon: -119.16, peakElevFt: 12970, radiusDeg: 1.5 }, // Mt Robson (Canadian Rockies)
    ],
  },
  {
    name: 'Sierra Nevada & Cascades',
    minLat: 35.5,
    maxLat: 49.5,
    minLon: -123.5,
    maxLon: -117.5,
    baseElevFt: 2500,
    peakElevFt: 14505,
    centers: [
      { lat: 36.58, lon: -118.29, peakElevFt: 14505, radiusDeg: 1.4 }, // Mt Whitney (Sierra Nevada)
      { lat: 46.85, lon: -121.76, peakElevFt: 14411, radiusDeg: 1.2 }, // Mt Rainier (Cascades)
      { lat: 41.41, lon: -122.19, peakElevFt: 14179, radiusDeg: 1.1 }, // Mt Shasta
    ],
  },
  {
    name: 'Alaska Range & Saint Elias',
    minLat: 58.0,
    maxLat: 65.0,
    minLon: -155.0,
    maxLon: -138.0,
    baseElevFt: 2000,
    peakElevFt: 20310,
    centers: [
      { lat: 63.07, lon: -151.01, peakElevFt: 20310, radiusDeg: 1.8 }, // Denali (20,310 ft)
      { lat: 60.29, lon: -140.93, peakElevFt: 18008, radiusDeg: 1.6 }, // Mt Saint Elias
    ],
  },
  {
    name: 'Appalachians',
    minLat: 34.0,
    maxLat: 45.5,
    minLon: -84.5,
    maxLon: -70.5,
    baseElevFt: 1200,
    peakElevFt: 6684,
    centers: [
      { lat: 35.76, lon: -82.26, peakElevFt: 6684, radiusDeg: 1.5 }, // Mt Mitchell (Blue Ridge)
      { lat: 44.27, lon: -71.30, peakElevFt: 6288, radiusDeg: 1.2 }, // Mt Washington
    ],
  },
  {
    name: 'Andes Cordillera',
    minLat: -55.0,
    maxLat: 11.0,
    minLon: -78.5,
    maxLon: -64.0,
    baseElevFt: 6000,
    peakElevFt: 22838,
    centers: [
      { lat: -32.65, lon: -70.01, peakElevFt: 22838, radiusDeg: 2.0 }, // Aconcagua (22,838 ft)
      { lat: -27.11, lon: -68.54, peakElevFt: 22615, radiusDeg: 1.8 }, // Ojos del Salado
      { lat: -9.12, lon: -77.60, peakElevFt: 22205, radiusDeg: 2.2 }, // Huascaran
      { lat: -1.47, lon: -78.82, peakElevFt: 20548, radiusDeg: 1.6 }, // Chimborazo
    ],
  },
  {
    name: 'Himalayas & Karakoram',
    minLat: 26.0,
    maxLat: 38.0,
    minLon: 69.0,
    maxLon: 99.0,
    baseElevFt: 8000,
    peakElevFt: 29032,
    centers: [
      { lat: 27.99, lon: 86.93, peakElevFt: 29032, radiusDeg: 2.5 }, // Mt Everest (29,032 ft)
      { lat: 35.88, lon: 76.51, peakElevFt: 28251, radiusDeg: 2.2 }, // K2 / Karakoram
      { lat: 28.55, lon: 83.82, peakElevFt: 26545, radiusDeg: 2.0 }, // Annapurna
      { lat: 32.00, lon: 85.00, peakElevFt: 16500, radiusDeg: 4.5 }, // Tibetan Plateau general floor
    ],
  },
  {
    name: 'Tian Shan & Pamir',
    minLat: 37.0,
    maxLat: 44.5,
    minLon: 69.0,
    maxLon: 84.0,
    baseElevFt: 5000,
    peakElevFt: 24406,
    centers: [
      { lat: 42.03, lon: 80.13, peakElevFt: 24406, radiusDeg: 2.0 }, // Jengish Chokusu
      { lat: 38.92, lon: 72.03, peakElevFt: 24590, radiusDeg: 1.8 }, // Ismoil Somoni Peak
    ],
  },
  {
    name: 'Atlas Mountains',
    minLat: 29.5,
    maxLat: 34.5,
    minLon: -10.0,
    maxLon: 0.5,
    baseElevFt: 2500,
    peakElevFt: 13671,
    centers: [
      { lat: 31.06, lon: -7.92, peakElevFt: 13671, radiusDeg: 1.5 }, // Jbel Toubkal (13,671 ft)
    ],
  },
  {
    name: 'East African Highlands & Kilimanjaro',
    minLat: -4.5,
    maxLat: 15.0,
    minLon: 34.5,
    maxLon: 41.5,
    baseElevFt: 3500,
    peakElevFt: 19341,
    centers: [
      { lat: -3.07, lon: 37.35, peakElevFt: 19341, radiusDeg: 1.2 }, // Mt Kilimanjaro (19,341 ft)
      { lat: -0.15, lon: 37.31, peakElevFt: 17057, radiusDeg: 1.0 }, // Mt Kenya
      { lat: 13.25, lon: 38.37, peakElevFt: 14930, radiusDeg: 1.8 }, // Ras Dashen
    ],
  },
  {
    name: 'Japan Alps & Mt Fuji',
    minLat: 34.5,
    maxLat: 37.5,
    minLon: 136.0,
    maxLon: 139.5,
    baseElevFt: 1000,
    peakElevFt: 12389,
    centers: [
      { lat: 35.36, lon: 138.73, peakElevFt: 12389, radiusDeg: 0.9 }, // Mt Fuji (12,389 ft)
      { lat: 36.29, lon: 137.65, peakElevFt: 10476, radiusDeg: 1.1 }, // Kita-dake
    ],
  },
  {
    name: 'New Zealand Southern Alps',
    minLat: -46.0,
    maxLat: -41.0,
    minLon: 167.5,
    maxLon: 173.5,
    baseElevFt: 800,
    peakElevFt: 12218,
    centers: [
      { lat: -43.60, lon: 170.14, peakElevFt: 12218, radiusDeg: 1.5 }, // Aoraki / Mount Cook
    ],
  },
  {
    name: 'Australian Snowy Mountains',
    minLat: -38.5,
    maxLat: -34.5,
    minLon: 147.0,
    maxLon: 150.5,
    baseElevFt: 1500,
    peakElevFt: 7310,
    centers: [
      { lat: -36.45, lon: 148.26, peakElevFt: 7310, radiusDeg: 1.2 }, // Mount Kosciuszko
    ],
  },
  {
    name: 'Mexican Trans-Volcanic Belt',
    minLat: 18.0,
    maxLat: 20.5,
    minLon: -104.5,
    maxLon: -96.5,
    baseElevFt: 4500,
    peakElevFt: 18491,
    centers: [
      { lat: 19.03, lon: -97.27, peakElevFt: 18491, radiusDeg: 1.1 }, // Pico de Orizaba
      { lat: 19.02, lon: -98.63, peakElevFt: 17802, radiusDeg: 1.0 }, // Popocatepetl
    ],
  },
];

/**
 * Returns baseline land elevation (in feet MSL) for major world continental masses
 */
export function getBaselineLandElevation(lat: number, lon: number): number {
  const isEurope = lat >= 35 && lat <= 71 && lon >= -10 && lon <= 45;
  const isNorthAmerica = lat >= 15 && lat <= 72 && lon >= -168 && lon <= -52;
  const isSouthAmerica = lat >= -56 && lat <= 13 && lon >= -82 && lon <= -34;
  const isAsia = lat >= 10 && lat <= 75 && lon >= 45 && lon <= 180;
  const isAfrica = lat >= -35 && lat <= 37 && lon >= -18 && lon <= 52;
  const isAustralia = lat >= -44 && lat <= -10 && lon >= 112 && lon <= 154;

  if (isEurope || isNorthAmerica || isSouthAmerica || isAsia || isAfrica || isAustralia) {
    // Continental interior high plains vs coastal lowlands
    if (isNorthAmerica && lon >= -104 && lon <= -98 && lat >= 30 && lat <= 48) {
      return 2800; // Great Plains plateau
    }
    if (isEurope && lat >= 40 && lat <= 42 && lon >= -6 && lon <= -2) {
      return 2200; // Spanish Central Meseta
    }
    return 600; // Typical continental plains
  }
  return 0; // Sea level / Oceanic waters
}

/**
 * Queries terrain elevation (in feet MSL) for a given geographical coordinate.
 */
export function queryTerrainElevation(lat: number, lon: number): number {
  let elevation = getBaselineLandElevation(lat, lon);

  for (const region of MOUNTAIN_REGIONS) {
    if (
      lat >= region.minLat &&
      lat <= region.maxLat &&
      lon >= region.minLon &&
      lon <= region.maxLon
    ) {
      let regionElev = region.baseElevFt;

      for (const center of region.centers) {
        const dLat = lat - center.lat;
        const dLon = (lon - center.lon) * Math.cos((lat * Math.PI) / 180);
        const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);

        if (distDeg < center.radiusDeg) {
          const t = 1 - distDeg / center.radiusDeg;
          // Alpine and rocky mountain relief: valleys drop towards baseline while crests reach peak
          const ridgeRelief = 0.40 + 0.60 * Math.pow(Math.cos(lat * 35.0 + lon * 22.0), 2);
          const peakContribution = (center.peakElevFt - region.baseElevFt) * Math.pow(t, 1.8) * ridgeRelief;
          const computedPeak = region.baseElevFt + peakContribution;
          if (computedPeak > regionElev) {
            regionElev = computedPeak;
          }
        }
      }

      if (regionElev > elevation) {
        elevation = regionElev;
      }
    }
  }

  return Math.round(elevation);
}

/**
 * Distance in Nautical Miles between two coordinates using spherical law of haversines
 */
export function calculateDistanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * 3440.065;
}

/**
 * Great-circle waypoint interpolation at fraction f between [0, 1]
 */
export function interpolateGreatCircle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  fraction: number
): [number, number] {
  if (fraction <= 0) return [lat1, lon1];
  if (fraction >= 1) return [lat2, lon2];

  const rad = Math.PI / 180;
  const phi1 = lat1 * rad;
  const lam1 = lon1 * rad;
  const phi2 = lat2 * rad;
  const lam2 = lon2 * rad;

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.pow(Math.sin((phi2 - phi1) / 2), 2) +
          Math.cos(phi1) * Math.cos(phi2) * Math.pow(Math.sin((lam2 - lam1) / 2), 2)
      )
    );

  if (d === 0) return [lat1, lon1];

  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);

  const x = a * Math.cos(phi1) * Math.cos(lam1) + b * Math.cos(phi2) * Math.cos(lam2);
  const y = a * Math.cos(phi1) * Math.sin(lam1) + b * Math.cos(phi2) * Math.sin(lam2);
  const z = a * Math.sin(phi1) + b * Math.sin(phi2);

  const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lam = Math.atan2(y, x);

  return [phi / rad, lam / rad];
}

/**
 * Computes destination point given start point, bearing, and distance in Nautical Miles
 */
export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distNm: number
): [number, number] {
  const rad = Math.PI / 180;
  const earthRadiusNm = 3440.065;
  const angularDist = distNm / earthRadiusNm;

  const phi1 = lat * rad;
  const lam1 = lon * rad;
  const brg = bearingDeg * rad;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(angularDist) +
      Math.cos(phi1) * Math.sin(angularDist) * Math.cos(brg)
  );

  const lam2 =
    lam1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(angularDist) * Math.cos(phi1),
      Math.cos(angularDist) - Math.sin(phi1) * Math.sin(phi2)
    );

  return [phi2 / rad, lam2 / rad];
}

interface CorridorPointSample {
  lat: number;
  lon: number;
  elevationFt: number;
}

/**
 * Evaluates the terrain corridor between departure and arrival points.
 *
 * Rules:
 * - Mountainous terrain is defined when terrain elevation variation within 10 NM is >= 3,000 ft.
 * - Required clearance margin is 2,000 ft in mountainous terrain, and 1,000 ft in non-mountainous terrain.
 *
 * @param depLat Departure latitude
 * @param depLon Departure longitude
 * @param arrLat Arrival latitude
 * @param arrLon Arrival longitude
 * @param corridorWidthNm Flight corridor buffer half-width (default: 10 NM)
 */
export function getCorridorMsa(
  depLat: number,
  depLon: number,
  arrLat: number,
  arrLon: number,
  corridorWidthNm: number = 10
): CorridorMsaResult {
  const distanceNm = calculateDistanceNm(depLat, depLon, arrLat, arrLon);

  const rad = Math.PI / 180;
  const dLon = (arrLon - depLon) * rad;
  const lat1 = depLat * rad;
  const lat2 = arrLat * rad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const initialBearingDeg = ((Math.atan2(y, x) / rad) + 360) % 360;

  const leftBearing = (initialBearingDeg - 90 + 360) % 360;
  const rightBearing = (initialBearingDeg + 90) % 360;

  // Step every ~4 to 5 NM along track so any 10 NM moving window contains multiple samples
  const steps = Math.max(6, Math.ceil(distanceNm / 4));
  const samples: CorridorPointSample[] = [];

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const [cLat, cLon] = interpolateGreatCircle(depLat, depLon, arrLat, arrLon, fraction);

    // Centerline, mid-offsets (5 NM), and corridor edges (10 NM)
    const [l10Lat, l10Lon] = destinationPoint(cLat, cLon, leftBearing, corridorWidthNm);
    const [l5Lat, l5Lon] = destinationPoint(cLat, cLon, leftBearing, corridorWidthNm / 2);
    const [r5Lat, r5Lon] = destinationPoint(cLat, cLon, rightBearing, corridorWidthNm / 2);
    const [r10Lat, r10Lon] = destinationPoint(cLat, cLon, rightBearing, corridorWidthNm);

    const coords = [
      [cLat, cLon],
      [l10Lat, l10Lon],
      [l5Lat, l5Lon],
      [r5Lat, r5Lon],
      [r10Lat, r10Lon],
    ] as const;

    for (const [lat, lon] of coords) {
      samples.push({
        lat,
        lon,
        elevationFt: queryTerrainElevation(lat, lon),
      });
    }
  }

  // Evaluate terrain variation within 10 NM for each sample point
  let maxVariation10Nm = 0;
  let highestPeakTerrainFt = 0;
  let limitingCoord: [number, number] = [depLat, depLon];
  let highestRequiredAlt = 0;

  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    let localMinElev = p.elevationFt;
    let localMaxElev = p.elevationFt;

    if (p.elevationFt > highestPeakTerrainFt) {
      highestPeakTerrainFt = p.elevationFt;
    }

    // Inspect all points within 10 NM of p
    for (let j = 0; j < samples.length; j++) {
      const q = samples[j];
      const dNm = calculateDistanceNm(p.lat, p.lon, q.lat, q.lon);
      if (dNm <= 10.0) {
        if (q.elevationFt < localMinElev) localMinElev = q.elevationFt;
        if (q.elevationFt > localMaxElev) localMaxElev = q.elevationFt;
      }
    }

    const localVariation = localMaxElev - localMinElev;
    if (localVariation > maxVariation10Nm) {
      maxVariation10Nm = localVariation;
    }

    // Point-specific mountainous classification:
    // Mountainous if variation within 10 NM is >= 3,000 ft
    const isPointMountainous = localVariation >= 3000;
    const pointMargin = isPointMountainous ? 2000 : 1000;
    const pointRequiredAlt = p.elevationFt + pointMargin;

    if (pointRequiredAlt > highestRequiredAlt) {
      highestRequiredAlt = pointRequiredAlt;
      limitingCoord = [p.lat, p.lon];
    }
  }

  const isCorridorMountainous = maxVariation10Nm >= 3000;
  const requiredMarginFt = isCorridorMountainous ? 2000 : 1000;

  // Ensure overall corridor MSA guarantees required clearance margin above corridor peak terrain
  const finalRequiredAlt = Math.max(highestRequiredAlt, highestPeakTerrainFt + requiredMarginFt);

  // Round up to nearest 100 ft (standard aviation MSA / MORA formatting)
  const msaFt = Math.ceil(finalRequiredAlt / 100) * 100;

  return {
    msaFt,
    peakTerrainFt: highestPeakTerrainFt,
    limitingCoord,
    isMountainous: isCorridorMountainous,
    maxTerrainVariation10Nm: Math.round(maxVariation10Nm),
    requiredMarginFt,
  };
}

/**
 * Clamps an altitude to the standard ICAO/FAA Semi-Circular Rule (Hemispheric Rule):
 * - Eastbound (000° - 179° track): Odd thousands (e.g. FL050, FL070, FL090, FL110, FL130, FL150...)
 * - Westbound (180° - 359° track): Even thousands (e.g. FL060, FL080, FL100, FL120, FL140, FL160...)
 * - RVSM airspace (FL290 - FL410):
 *     Eastbound: FL290, FL310, FL330, FL350, FL370, FL390, FL410
 *     Westbound: FL300, FL320, FL340, FL360, FL380, FL400
 *
 * Guarantees that the returned cruising altitude is >= minAltitudeFt.
 */
export function clampToSemiCircularRule(
  minAltitudeFt: number,
  trackBearingDeg: number,
  isIfr: boolean = true
): number {
  const normBearing = ((trackBearingDeg % 360) + 360) % 360;
  const isEastbound = normBearing >= 0 && normBearing < 180;

  // Minimum flight level floor: at least 3,000 ft for IFR cruising levels
  const target = Math.max(3000, minAltitudeFt);

  // If in high-altitude RVSM band (FL290 to FL410)
  if (target >= 29000 && target <= 41000) {
    let fl = Math.ceil(target / 1000);
    // Eastbound: FL290, 310, 330, 350, 370, 390, 410 (odd)
    // Westbound: FL300, 320, 340, 360, 380, 400 (even)
    if (isEastbound && fl % 2 === 0) {
      fl += 1;
    } else if (!isEastbound && fl % 2 !== 0) {
      fl += 1;
    }
    return fl * 1000;
  }

  // Standard semi-circular altitudes up to FL280
  let altThousands = Math.ceil(target / 1000);

  if (isEastbound && altThousands % 2 === 0) {
    altThousands += 1;
  } else if (!isEastbound && altThousands % 2 !== 0) {
    altThousands += 1;
  }

  return altThousands * 1000;
}

/**
 * Formats an altitude according to aviation standards:
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
