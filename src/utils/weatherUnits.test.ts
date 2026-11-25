import { describe, it, expect } from 'vitest';
import {
  formatVisibility,
  formatWindSpeed,
  formatWindVector,
  formatTemperature,
} from './weatherUnits';
import { formatWeight, convertWeight } from './flightFormatters';

describe('weatherUnits', () => {
  describe('formatVisibility', () => {
    it('returns N/A for undefined or NaN values', () => {
      expect(formatVisibility(undefined)).toBe('N/A');
      expect(formatVisibility(Number.NaN)).toBe('N/A');
    });

    it('formats statute miles (sm) with 10+ SM cap', () => {
      expect(formatVisibility(4.25, 'sm')).toBe('4.3 SM');
      expect(formatVisibility(10, 'sm')).toBe('10+ SM');
      expect(formatVisibility(15, 'sm')).toBe('10+ SM');
    });

    it('converts statute miles to metric (m and km)', () => {
      expect(formatVisibility(10, 'metric')).toBe('16+ km');
      expect(formatVisibility(4, 'metric')).toBe('6.4 km');
      // 1 SM = 1609.344 m -> rounded to nearest 50 m = 1600 m
      expect(formatVisibility(1, 'metric')).toBe('1600 m');
    });
  });

  describe('formatWindSpeed', () => {
    it('returns N/A for undefined or NaN values', () => {
      expect(formatWindSpeed(undefined)).toBe('N/A');
      expect(formatWindSpeed(Number.NaN)).toBe('N/A');
    });

    it('formats wind speed in knots and meters per second', () => {
      expect(formatWindSpeed(14.6, 'kt')).toBe('15 kt');
      expect(formatWindSpeed(14.6, 'kt', false)).toBe('15');
      // 10 kt * 0.514444 = 5.14444 -> 5.1 m/s
      expect(formatWindSpeed(10, 'mps')).toBe('5.1 m/s');
      expect(formatWindSpeed(10, 'mps', false)).toBe('5.1');
    });
  });

  describe('formatWindVector', () => {
    it('returns N/A when speed is missing', () => {
      expect(formatWindVector(270, undefined)).toBe('N/A');
    });

    it('formats zero-padded wind direction and speed', () => {
      expect(formatWindVector(5, 12, 'kt')).toBe('005° @ 12 kt');
      expect(formatWindVector(270, 10, 'mps')).toBe('270° @ 5.1 m/s');
    });

    it('formats speed only when direction is omitted', () => {
      expect(formatWindVector(undefined, 18, 'kt')).toBe('18 kt');
    });
  });

  describe('formatTemperature', () => {
    it('returns -- for missing or NaN values', () => {
      expect(formatTemperature(undefined)).toBe('--');
      expect(formatTemperature(null)).toBe('--');
      expect(formatTemperature(Number.NaN)).toBe('--');
    });

    it('formats Celsius temperatures with sign handling', () => {
      expect(formatTemperature(15, 'c')).toBe('+15°C');
      expect(formatTemperature(0, 'c')).toBe('0°C');
      expect(formatTemperature(-12, 'c')).toBe('-12°C');
      expect(formatTemperature(15, 'c', { includeSign: false })).toBe('15°C');
    });

    it('converts Celsius to Fahrenheit accurately', () => {
      expect(formatTemperature(0, 'f')).toBe('+32°F');
      expect(formatTemperature(100, 'f')).toBe('+212°F');
      expect(formatTemperature(-40, 'f')).toBe('-40°F');
      expect(formatTemperature(20.5, 'f', { decimals: 1 })).toBe('+68.9°F');
    });
  });

  describe('weight conversions (lbs <-> kg)', () => {
    it('handles invalid or non-positive weights', () => {
      expect(formatWeight(undefined)).toBe('—');
      expect(formatWeight(0)).toBe('—');
      expect(convertWeight(null, 'kg')).toEqual({
        value: null,
        unit: 'kg',
        formatted: '—',
      });
    });

    it('converts pounds to kilograms and formats both units', () => {
      // 10000 lbs * 0.45359237 = 4536 kg
      const kg = convertWeight(10000, 'kg');
      expect(kg.value).toBe(4536);
      expect(kg.unit).toBe('kg');
      expect(formatWeight(10000, 'kg')).toBe(kg.formatted);

      const lbs = convertWeight(10000, 'lbs');
      expect(lbs.value).toBe(10000);
      expect(lbs.unit).toBe('lbs');
      expect(formatWeight(10000, 'lbs')).toBe(lbs.formatted);
    });
  });
});
