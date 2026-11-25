import { describe, it, expect } from 'vitest';
import {
  isValidIcaoCode,
  shuffleArray,
  isPointInPolygon,
  resolveAirport,
  computeRouteSector,
  generateRouteSuggestion,
} from './routeGenerator';
import { Airport } from '../types/flight';

const makeAirport = (overrides: Partial<Airport>): Airport => ({
  icao: 'TEST',
  name: 'Test Airport',
  countryCode: 'GB',
  countryName: 'Test Country',
  latitude: 0,
  longitude: 0,
  elevationFt: 100,
  airportType: 'large_airport',
  maxRunwayLengthFt: 10000,
  hasPaved: true,
  ...overrides,
});

describe('routeGenerator', () => {
  describe('isValidIcaoCode', () => {
    it('accepts 4-letter ICAO codes regardless of case or surrounding whitespace', () => {
      expect(isValidIcaoCode('KJFK')).toBe(true);
      expect(isValidIcaoCode(' egll ')).toBe(true);
    });

    it('rejects non-4-letter or numeric codes', () => {
      expect(isValidIcaoCode('JFK')).toBe(false);
      expect(isValidIcaoCode('K123')).toBe(false);
      expect(isValidIcaoCode('KJFK1')).toBe(false);
      expect(isValidIcaoCode('')).toBe(false);
    });
  });

  describe('shuffleArray', () => {
    it('returns a new array with the same elements without mutating the input', () => {
      const input = [1, 2, 3, 4, 5, 6];
      const snapshot = [...input];
      const shuffled = shuffleArray(input);

      expect(input).toEqual(snapshot);
      expect(shuffled).not.toBe(input);
      expect(shuffled).toHaveLength(input.length);
      expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
    });
  });

  describe('isPointInPolygon', () => {
    const square: [number, number][] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ];

    it('detects points inside and outside a polygon', () => {
      expect(isPointInPolygon(5, 5, square)).toBe(true);
      expect(isPointInPolygon(15, 5, square)).toBe(false);
      expect(isPointInPolygon(-1, -1, square)).toBe(false);
    });

    it('returns true when polygon has fewer than 3 vertices', () => {
      expect(isPointInPolygon(5, 5, [[0, 0], [1, 1]])).toBe(true);
    });
  });

  describe('resolveAirport', () => {
    it('resolves known fallback airports outside Tauri', async () => {
      const apt = await resolveAirport('kjfk');
      expect(apt).not.toBeNull();
      expect(apt?.icao).toBe('KJFK');
    });

    it('returns null for invalid or unknown ICAO codes', async () => {
      expect(await resolveAirport('BAD')).toBeNull();
      expect(await resolveAirport('ZZZZ')).toBeNull();
    });
  });

  describe('computeRouteSector', () => {
    it('calculates great circle distance and sector duration with and without ground time', () => {
      const dep = makeAirport({ icao: 'EGLL', latitude: 51.47, longitude: -0.4543 });
      const arr = makeAirport({ icao: 'LFPG', latitude: 49.0097, longitude: 2.5479 });

      const withGround = computeRouteSector(dep, arr, 'C', true, 1);
      const withoutGround = computeRouteSector(dep, arr, 'C', false, 1);

      // EGLL -> LFPG is roughly 185-195 NM
      expect(withGround.distanceNm).toBeGreaterThan(175);
      expect(withGround.distanceNm).toBeLessThan(205);
      expect(withGround.groundMinutes).toBe(20); // Cat C: 12 taxiOut + 8 taxiIn
      expect(withoutGround.groundMinutes).toBe(0);
      expect(withGround.totalMinutes).toBe(withGround.airborneMinutes + 20);
      expect(withoutGround.totalMinutes).toBe(withoutGround.airborneMinutes);
    });

    it('flags mountainous terrain and provides a terrain warning across the Alps', () => {
      const zrh = makeAirport({ icao: 'LSZH', latitude: 47.4647, longitude: 8.5492, elevationFt: 1416 });
      const mxp = makeAirport({ icao: 'LIMC', latitude: 45.6306, longitude: 8.7281, elevationFt: 767 });

      const sector = computeRouteSector(zrh, mxp, 'A', false, 1);
      expect(sector.isMountainous).toBe(true);
      expect(sector.requiredMarginFt).toBe(2000);
      expect(sector.terrainWarning).toContain('Mountainous Terrain Advisory');
      expect(sector.isAltitudeTerrainClamped).toBe(true);
      expect(sector.cruiseAltitudeFt).toBeGreaterThan(6500);
    });
  });

  describe('generateRouteSuggestion', () => {
    it('generates a single-sector route in Europe using fallback airports', async () => {
      const route = await generateRouteSuggestion({
        category: 'C',
        limitBy: 'distance',
        limitScope: 'total',
        minLimitValue: 100,
        maxLimitValue: 600,
        includeGroundTime: true,
        sectorCount: 1,
        region: 'EU',
        airportType: 'all',
      });

      expect(route.sectors).toHaveLength(1);
      expect(route.sectors[0].departure.icao).not.toBe(route.sectors[0].arrival.icao);
      expect(route.totalDistanceNm).toBeGreaterThan(0);
      expect(route.totalDurationMinutes).toBeGreaterThan(0);
    });

    it('generates a round-trip route returning to the origin when sectorCount is -1', async () => {
      const route = await generateRouteSuggestion({
        category: 'C',
        limitBy: 'distance',
        limitScope: 'sector',
        minLimitValue: 100,
        maxLimitValue: 600,
        includeGroundTime: false,
        sectorCount: -1,
        region: 'EU',
        airportType: 'all',
        departureIcao: 'EGLL',
      });

      expect(route.sectors).toHaveLength(2);
      expect(route.sectors[0].departure.icao).toBe('EGLL');
      expect(route.sectors[1].arrival.icao).toBe('EGLL');
      expect(route.sectors[0].arrival.icao).toBe(route.sectors[1].departure.icao);
    });
  });
});
