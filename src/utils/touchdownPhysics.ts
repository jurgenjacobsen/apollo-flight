/**
 * Oleo-pneumatic strut deceleration physics model:
 *
 * Impact velocity in ft/s:
 *   v_fps = |V_vertical_fpm| / 60
 *
 * Deceleration over stroke s (feet) with efficiency eta:
 *   a_z = v_fps^2 / (2 * s * eta)
 *
 * Peak normal load factor:
 *   G_z = 1.0 + (a_z / g)
 *
 * Where:
 *   g = 32.174 ft/s^2 (standard gravitational acceleration)
 *   s = oleo strut stroke in feet (typically 8" - 18" depending on aircraft category)
 *   eta = shock absorber efficiency (0.60 - 0.85, nominal 0.78 for oleo-pneumatic struts)
 */

export interface StrutPreset {
  id: string;
  name: string;
  description: string;
  strokeInches: number;
  efficiency: number;
}

export const STRUT_PRESETS: StrutPreset[] = [
  {
    id: 'airliner',
    name: 'Narrowbody Jet',
    description: 'A320, B737, E190 (13.5" oleo stroke, 0.78 efficiency)',
    strokeInches: 13.5,
    efficiency: 0.78,
  },
  {
    id: 'widebody',
    name: 'Widebody Jet',
    description: 'B777, B787, A350 (18.0" bogie/oleo stroke, 0.82 efficiency)',
    strokeInches: 18.0,
    efficiency: 0.82,
  },
  {
    id: 'turboprop',
    name: 'Turboprop / Regional',
    description: 'ATR 72, Dash 8, King Air (11.0" oleo stroke, 0.75 efficiency)',
    strokeInches: 11.0,
    efficiency: 0.75,
  },
  {
    id: 'light_ga',
    name: 'Light GA',
    description: 'C172, PA-28 (8.0" spring/strut stroke, 0.65 efficiency)',
    strokeInches: 8.0,
    efficiency: 0.65,
  },
  {
    id: 'bizjet',
    name: 'Business Jet',
    description: 'Citation, Challenger, Global (12.0" oleo stroke, 0.78 efficiency)',
    strokeInches: 12.0,
    efficiency: 0.78,
  },
];

export interface GForceEvaluation {
  gForce: number;
  severity: 'soft' | 'normal' | 'firm' | 'hard' | 'severe';
  title: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  description: string;
  requiresInspection: boolean;
  sinkRateFps: number;
  sinkRateMps: number;
}

export function calculateTouchdownGForce(
  verticalSpeedFpm: number,
  strokeInches: number = 13.5,
  efficiency: number = 0.78
): number {
  const absFpm = Math.abs(verticalSpeedFpm);
  if (absFpm < 15) return 1.0;

  const vFps = absFpm / 60.0;
  const strokeFt = Math.max(2, strokeInches) / 12.0;
  const eta = Math.min(0.95, Math.max(0.4, efficiency));
  const g = 32.174;

  const dynamicDecel = (vFps * vFps) / (2.0 * strokeFt * eta);
  const impactG = 1.0 + dynamicDecel / g;

  return Number(impactG.toFixed(2));
}

export function evaluateTouchdownGForce(
  verticalSpeedFpm: number,
  strokeInches: number = 13.5,
  efficiency: number = 0.78
): GForceEvaluation {
  const absFpm = Math.abs(verticalSpeedFpm);
  const vFps = absFpm / 60.0;
  const vMps = vFps * 0.3048;
  const g = calculateTouchdownGForce(verticalSpeedFpm, strokeInches, efficiency);

  if (g <= 1.15) {
    return {
      gForce: g,
      severity: 'soft',
      title: 'Soft Landing',
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      badgeText: 'text-emerald-700 dark:text-emerald-300',
      badgeBorder: 'border-emerald-200 dark:border-emerald-800',
      description: 'Negligible impact deceleration. Gentle wheel spin-up with minimal airframe stress.',
      requiresInspection: false,
      sinkRateFps: Number(vFps.toFixed(2)),
      sinkRateMps: Number(vMps.toFixed(2)),
    };
  } else if (g <= 1.40) {
    return {
      gForce: g,
      severity: 'normal',
      title: 'Normal Touchdown',
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/30',
      badgeText: 'text-emerald-600 dark:text-emerald-400',
      badgeBorder: 'border-emerald-200 dark:border-emerald-800',
      description: 'Standard positive touchdown well within design limit. Preferred technique in crosswinds.',
      requiresInspection: false,
      sinkRateFps: Number(vFps.toFixed(2)),
      sinkRateMps: Number(vMps.toFixed(2)),
    };
  } else if (g <= 1.75) {
    return {
      gForce: g,
      severity: 'firm',
      title: 'Firm Touchdown',
      badgeBg: 'bg-amber-50 dark:bg-amber-950/30',
      badgeText: 'text-amber-700 dark:text-amber-400',
      badgeBorder: 'border-amber-200 dark:border-amber-800',
      description: 'Noticeable vertical shock. Standard for short runways or contaminated surfaces.',
      requiresInspection: false,
      sinkRateFps: Number(vFps.toFixed(2)),
      sinkRateMps: Number(vMps.toFixed(2)),
    };
  } else if (g <= 2.10) {
    return {
      gForce: g,
      severity: 'hard',
      title: 'Hard Landing',
      badgeBg: 'bg-rose-50 dark:bg-rose-950/30',
      badgeText: 'text-rose-700 dark:text-rose-400',
      badgeBorder: 'border-rose-200 dark:border-rose-800',
      description: 'High deceleration near the CS/FAR 25.473 limit load (typically 2.0 - 2.5G). Pilot should monitor gear.',
      requiresInspection: false,
      sinkRateFps: Number(vFps.toFixed(2)),
      sinkRateMps: Number(vMps.toFixed(2)),
    };
  } else {
    return {
      gForce: g,
      severity: 'severe',
      title: 'Severe Hard Landing',
      badgeBg: 'bg-red-100 dark:bg-red-950/60',
      badgeText: 'text-red-800 dark:text-red-300',
      badgeBorder: 'border-red-300 dark:border-red-700',
      description: 'Exceeds standard maintenance threshold. AMM Chapter 05 Phase 1 / Phase 2 structural inspection required.',
      requiresInspection: true,
      sinkRateFps: Number(vFps.toFixed(2)),
      sinkRateMps: Number(vMps.toFixed(2)),
    };
  }
}
