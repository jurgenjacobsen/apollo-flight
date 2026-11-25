import { describe, it, expect } from 'vitest';
import {
  STRUT_PRESETS,
  calculateTouchdownGForce,
  evaluateTouchdownGForce,
} from './touchdownPhysics';

describe('touchdownPhysics', () => {
  describe('STRUT_PRESETS', () => {
    it('defines all expected aircraft strut presets', () => {
      const ids = STRUT_PRESETS.map((p) => p.id);
      expect(ids).toEqual(['airliner', 'widebody', 'turboprop', 'light_ga', 'bizjet']);
    });
  });

  describe('calculateTouchdownGForce', () => {
    it('returns 1.0G for negligible sink rates below 15 fpm', () => {
      expect(calculateTouchdownGForce(0)).toBe(1.0);
      expect(calculateTouchdownGForce(-14)).toBe(1.0);
      expect(calculateTouchdownGForce(14.9)).toBe(1.0);
    });

    it('matches the oleo-pneumatic deceleration formula for standard narrowbody defaults', () => {
      // v_fps = 180 / 60 = 3.0 ft/s; s = 13.5 / 12 = 1.125 ft; eta = 0.78
      // a_z = 9 / (2 * 1.125 * 0.78) = 5.1282 ft/s^2; G = 1 + 5.1282 / 32.174 = 1.1594 -> 1.16
      expect(calculateTouchdownGForce(-180)).toBe(1.16);

      // v_fps = 600 / 60 = 10.0 ft/s; a_z = 100 / 1.755 = 56.9801 ft/s^2; G = 1 + 56.9801 / 32.174 = 2.77
      expect(calculateTouchdownGForce(-600)).toBe(2.77);
    });

    it('treats positive and negative vertical speeds identically via magnitude', () => {
      expect(calculateTouchdownGForce(300)).toBe(calculateTouchdownGForce(-300));
    });

    it('clamps extreme stroke and efficiency inputs', () => {
      // strokeInches < 2 clamps to 2"; efficiency < 0.4 clamps to 0.4; > 0.95 clamps to 0.95
      expect(calculateTouchdownGForce(-300, 0.5, 0.1)).toBe(
        calculateTouchdownGForce(-300, 2, 0.4),
      );
      expect(calculateTouchdownGForce(-300, 12, 1.5)).toBe(
        calculateTouchdownGForce(-300, 12, 0.95),
      );
    });

    it('produces lower peak G on widebody struts than light GA struts for the same sink rate', () => {
      const widebody = STRUT_PRESETS.find((p) => p.id === 'widebody')!;
      const lightGa = STRUT_PRESETS.find((p) => p.id === 'light_ga')!;

      const widebodyG = calculateTouchdownGForce(-300, widebody.strokeInches, widebody.efficiency);
      const lightGaG = calculateTouchdownGForce(-300, lightGa.strokeInches, lightGa.efficiency);

      expect(widebodyG).toBeLessThan(lightGaG);
    });
  });

  describe('evaluateTouchdownGForce', () => {
    it('classifies soft, normal, firm, hard, and severe touchdowns accurately', () => {
      const soft = evaluateTouchdownGForce(-100);
      expect(soft.severity).toBe('soft');
      expect(soft.requiresInspection).toBe(false);
      expect(soft.gForce).toBeLessThanOrEqual(1.15);

      const normal = evaluateTouchdownGForce(-240);
      expect(normal.severity).toBe('normal');
      expect(normal.requiresInspection).toBe(false);
      expect(normal.gForce).toBeGreaterThan(1.15);
      expect(normal.gForce).toBeLessThanOrEqual(1.4);

      const firm = evaluateTouchdownGForce(-360);
      expect(firm.severity).toBe('firm');
      expect(firm.requiresInspection).toBe(false);
      expect(firm.gForce).toBeGreaterThan(1.4);
      expect(firm.gForce).toBeLessThanOrEqual(1.75);

      const hard = evaluateTouchdownGForce(-450);
      expect(hard.severity).toBe('hard');
      expect(hard.requiresInspection).toBe(false);
      expect(hard.gForce).toBeGreaterThan(1.75);
      expect(hard.gForce).toBeLessThanOrEqual(2.1);

      const severe = evaluateTouchdownGForce(-600);
      expect(severe.severity).toBe('severe');
      expect(severe.requiresInspection).toBe(true);
      expect(severe.gForce).toBeGreaterThan(2.1);
    });

    it('computes sinkRateFps and sinkRateMps accurately', () => {
      const res = evaluateTouchdownGForce(-300);
      // 300 fpm = 5.00 ft/s; 5 * 0.3048 = 1.524 -> 1.52 m/s
      expect(res.sinkRateFps).toBe(5);
      expect(res.sinkRateMps).toBe(1.52);
    });
  });
});
