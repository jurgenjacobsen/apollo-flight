import { useEffect, useRef, useState } from "react";
import { TelemetryData } from "../types/flight";

function lerp(current: number, target: number, alpha: number): number {
    return current + (target - current) * alpha;
}

function lerpAngleDeg(current: number, target: number, alpha: number): number {
    const diff = ((target - current + 540) % 360) - 180;
    return (((current + diff * alpha) % 360) + 360) % 360;
}

/**
 * Smooths live telemetry numeric values for display using frame-rate-independent
 * exponential interpolation so rapidly updating flight figures transition fluidly
 * without horizontal or numeric jitter.
 */
export function useSmoothedTelemetry(target: TelemetryData): TelemetryData {
    const [smoothed, setSmoothed] = useState<TelemetryData>(target);
    const targetRef = useRef<TelemetryData>(target);
    const currentRef = useRef<TelemetryData>(target);
    targetRef.current = target;

    useEffect(() => {
        if (!target.simConnected || target.isInMenu) {
            currentRef.current = target;
            setSmoothed(target);
            return;
        }
    }, [target.simConnected, target.isInMenu, target]);

    useEffect(() => {
        let rafId = 0;
        let lastTime = performance.now();

        const tick = (now: number) => {
            const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
            lastTime = now;

            const tgt = targetRef.current;
            const cur = currentRef.current;

            if (!tgt.simConnected || tgt.isInMenu) {
                rafId = requestAnimationFrame(tick);
                return;
            }

            // Exponential smoothing factor (~180ms time constant)
            const alpha = 1 - Math.exp(-dt * 6.5);

            const nextAltMsl = lerp(cur.altitudeMsl, tgt.altitudeMsl, alpha);
            const nextAltAgl = lerp(cur.altitudeAgl, tgt.altitudeAgl, alpha);
            const nextGs = lerp(cur.groundSpeed, tgt.groundSpeed, alpha);
            const nextIas = lerp(cur.indicatedAirspeed, tgt.indicatedAirspeed, alpha);
            const nextTas = lerp(cur.trueAirspeed, tgt.trueAirspeed, alpha);
            const nextVs = lerp(cur.verticalSpeed, tgt.verticalSpeed, alpha);
            const nextHdg = lerpAngleDeg(cur.heading, tgt.heading, alpha);
            const nextPitch = lerp(cur.pitch, tgt.pitch, alpha);
            const nextBank = lerp(cur.bank, tgt.bank, alpha);

            const next: TelemetryData = {
                ...tgt,
                altitudeMsl: Math.round(nextAltMsl),
                altitudeAgl: Math.round(nextAltAgl),
                groundSpeed: Math.round(nextGs),
                indicatedAirspeed: Math.round(nextIas),
                trueAirspeed: Math.round(nextTas),
                verticalSpeed: Math.round(nextVs),
                heading: Math.round(nextHdg) % 360,
                pitch: Number(nextPitch.toFixed(1)),
                bank: Number(nextBank.toFixed(1)),
            };

            // Keep unrounded floats in currentRef so sub-unit interpolation remains continuous
            currentRef.current = {
                ...tgt,
                altitudeMsl: nextAltMsl,
                altitudeAgl: nextAltAgl,
                groundSpeed: nextGs,
                indicatedAirspeed: nextIas,
                trueAirspeed: nextTas,
                verticalSpeed: nextVs,
                heading: nextHdg,
                pitch: nextPitch,
                bank: nextBank,
            };

            setSmoothed(next);
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return smoothed;
}
