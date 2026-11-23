import { WeightUnit } from "../types/flight";

/**
 * Formats flight duration in seconds for live telemetry ribbons and active recording displays.
 * When flight duration reaches 60 minutes (>= 3600 seconds), formats as '0h 00min 00s'.
 * Otherwise formats as '0m 00s'.
 */
export function formatFlightDuration(totalSeconds: number): string {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "0m 00s";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
        const padMin = String(minutes).padStart(2, "0");
        const padSec = String(seconds).padStart(2, "0");
        return `${hours}h ${padMin}min ${padSec}s`;
    }

    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Formats flight duration for logbook tables and detail views.
 * When flight duration reaches 60 minutes (>= 3600 seconds or totalMins >= 60),
 * formats as '0h 00min' (e.g. '1h 05min', '2h 00min').
 * Otherwise formats as '0min' (e.g. '45min').
 */
export function formatLogbookDuration(totalSeconds: number): string {
    if (isNaN(totalSeconds) || totalSeconds <= 0) return "0min";
    const totalMins = Math.round(totalSeconds / 60);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (hours > 0) {
        return `${hours}h ${String(mins).padStart(2, "0")}min`;
    }

    return `${mins}min`;
}

/**
 * Formats aircraft weight in pounds into the target unit string (kilograms 'kg' or pounds 'lbs').
 * Default unit is 'kg'.
 */
export function formatWeight(
    weightLbs: number | undefined | null,
    unit: WeightUnit = "kg",
): string {
    if (
        weightLbs === undefined ||
        weightLbs === null ||
        isNaN(weightLbs) ||
        weightLbs <= 0
    ) {
        return "—";
    }
    if (unit === "kg") {
        const kg = Math.round(weightLbs * 0.45359237);
        return `${kg.toLocaleString()} kg`;
    }
    return `${Math.round(weightLbs).toLocaleString()} lbs`;
}

/**
 * Converts aircraft weight in pounds to the target unit and returns the numeric value and unit label.
 */
export function convertWeight(
    weightLbs: number | undefined | null,
    unit: WeightUnit = "kg",
): { value: number | null; unit: WeightUnit; formatted: string } {
    if (
        weightLbs === undefined ||
        weightLbs === null ||
        isNaN(weightLbs) ||
        weightLbs <= 0
    ) {
        return { value: null, unit, formatted: "—" };
    }
    if (unit === "kg") {
        const value = Math.round(weightLbs * 0.45359237);
        return { value, unit: "kg", formatted: `${value.toLocaleString()} kg` };
    }
    const value = Math.round(weightLbs);
    return { value, unit: "lbs", formatted: `${value.toLocaleString()} lbs` };
}
