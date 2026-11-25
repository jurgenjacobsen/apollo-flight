import { describe, it, expect } from 'vitest';
import {
  getBaselineLandElevation,
  queryTerrainElevation,
  calculateDistanceNm,
  interpolateGreatCircle,
  destinationPoint,
  getCorridorMsa,
  clampToSemiCircularRule,
  formatFlightLevelOrAltitude,
} from './terrainMora';

describe('terrainMora', () => {
  describe('getBaselineLandElevation', () => {
    it('returns 0 ft for oceanic coordinates and continental baselines for landmasses', () => {
      expect(getBaselineLandElevation(0, -30)).toBe(0); // Mid-Atlantic
      expect(getBaselineLandElevation(51.5, -0.1)).toBe(600); // Europe plains
      expect(getBaselineLandElevation(39.0, -101.0)).toBe(2800); // US Great Plains
      expect(getBaselineLandElevation(41.0, -4.0)).toBe(2200); // Spanish Central Meseta
    });
  });

  describe('queryTerrainElevation', () => {
    it('returns elevated terrain near major mountain peaks', () => {
      const montBlanc = queryTerrainElevation(45.83, 6.86);
      const everest = queryTerrainElevation(27.99, 86.93);
      const denali = queryTerrainElevation(63.07, -151.01);
      const plains = queryTerrainElevation(52.0, 4.5);

      expect(montBlanc).toBeGreaterThan(8000);
      expect(everest).toBeGreaterThan(15000);
      expect(denali).toBeGreaterThan(10000);
      expect(plains).toBe(600);
    });
  });

  describe('geodesic helpers', () => {
    it('calculates distance in nautical miles accurately', () => {
      expect(calculateDistanceNm(50, 0, 50, 0)).toBe(0);
      // 1 degree of latitude is ~60 NM
      const oneDegLat = calculateDistanceNm(0, 0, 1, 0);
      expect(oneDegLat).toBeCloseTo(60.04, 1);

      // EGLL to KJFK is ~2999 NM
      const transatlantic = calculateDistanceNm(51.47, -0.4543, 40.6413, -73.7781);
      expect(transatlantic).toBeGreaterThan(2950);
      expect(transatlantic).toBeLessThan(3050);
    });

    it('interpolates great circle endpoints and midpoints', () => {
      expect(interpolateGreatCircle(10, 20, 30, 40, 0)).toEqual([10, 20]);
      expect(interpolateGreatCircle(10, 20, 30, 40, 1)).toEqual([30, 40]);

      const [midLat, midLon] = interpolateGreatCircle(0, 0, 0, 20, 0.5);
      expect(midLat).toBeCloseTo(0, 4);
      expect(midLon).toBeCloseTo(10, 4);
    });

    it('computes destination point from bearing and distance', () => {
      const [lat, lon] = destinationPoint(0, 0, 0, 60.04);
      expect(lat).toBeCloseTo(1, 1);
      expect(lon).toBeCloseTo(0, 4);
    });
  });

  describe('getCorridorMsa', () => {
    it('applies a 1,000 ft clearance margin over non-mountainous corridors', () => {
      // Flat European plains: Amsterdam to Brussels
      const res = getCorridorMsa(52.31, 4.76, 50.9, 4.48, 10);
      expect(res.isMountainous).toBe(false);
      expect(res.requiredMarginFt).toBe(1000);
      expect(res.msaFt).toBeGreaterThanOrEqual(res.peakTerrainFt + 1000);
      expect(res.msaFt % 100).toBe(0);
    });

    it('detects mountainous terrain and enforces a 2,000 ft clearance margin', () => {
      // Across the Mont Blanc / Matterhorn massif in the European Alps
      const res = getCorridorMsa(45.5, 6.2, 46.3, 8.2, 10);
      expect(res.isMountainous).toBe(true);
      expect(res.maxTerrainVariation10Nm).toBeGreaterThanOrEqual(3000);
      expect(res.requiredMarginFt).toBe(2000);
      expect(res.msaFt).toBeGreaterThanOrEqual(res.peakTerrainFt + 2000);
      expect(res.msaFt % 100).toBe(0);
    });
  });

  describe('clampToSemiCircularRule', () => {
    it('enforces a 3,000 ft minimum IFR floor', () => {
      expect(clampToSemiCircularRule(1200, 90)).toBe(3000);
      expect(clampToSemiCircularRule(1200, 270)).toBe(4000);
    });

    it('assigns odd thousands eastbound (000-179) and even thousands westbound (180-359)', () => {
      expect(clampToSemiCircularRule(5200, 90)).toBe(7000);
      expect(clampToSemiCircularRule(5200, 270)).toBe(6000);
      expect(clampToSemiCircularRule(30000, 45)).toBe(31000);
      expect(clampToSemiCircularRule(31000, 225)).toBe(32000);
    });
  });

  describe('formatFlightLevelOrAltitude', () => {
    it('formats altitudes <= 3,000 ft in feet and above 3,000 ft as flight levels', () => {
      expect(formatFlightLevelOrAltitude(2500)).toBe('2,500 ft');
      expect(formatFlightLevelOrAltitude(3000)).toBe('3,000 ft');
      expect(formatFlightLevelOrAltitude(6000)).toBe('FL060');
      expect(formatFlightLevelOrAltitude(35000)).toBe('FL350');
    });
  });
});
