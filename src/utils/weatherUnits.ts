import { VisibilityUnit, WindSpeedUnit, TemperatureUnit } from "../types/flight";

/**
 * Formats visibility in Statute Miles (SM) or Meters / Kilometers (m / km).
 * @param miles Distance in Statute Miles
 * @param unit User preference ("sm" | "metric")
 */
export function formatVisibility(
    miles: number | undefined,
    unit: VisibilityUnit = "sm",
): string {
    if (miles === undefined || miles === null || isNaN(miles)) {
        return "N/A";
    }

    if (unit === "metric") {
        const meters = miles * 1609.344;
        if (meters >= 10000) {
            const km = Math.round(meters / 1000);
            return `${km}+ km`;
        } else if (meters >= 5000) {
            const km = (meters / 1000).toFixed(1);
            return `${km} km`;
        } else {
            const m = Math.round(meters / 50) * 50;
            return `${m} m`;
        }
    }

    // Default "sm"
    return miles >= 10 ? "10+ SM" : `${Number(miles.toFixed(1))} SM`;
}

/**
 * Formats wind speed in Knots (kt) or Meters per second (m/s).
 * @param knots Wind velocity in knots
 * @param unit User preference ("kt" | "mps")
 */
export function formatWindSpeed(
    knots: number | undefined,
    unit: WindSpeedUnit = "kt",
    includeUnit: boolean = true,
): string {
    if (knots === undefined || knots === null || isNaN(knots)) {
        return "N/A";
    }

    if (unit === "mps") {
        const mps = knots * 0.514444;
        const formatted = mps.toFixed(1);
        return includeUnit ? `${formatted} m/s` : formatted;
    }

    const formatted = Math.round(knots).toString();
    return includeUnit ? `${formatted} kt` : formatted;
}

/**
 * Formats full wind vector with direction degrees and speed: e.g. "270° @ 14 kt" or "270° @ 7.2 m/s"
 */
export function formatWindVector(
    directionDeg: number | undefined,
    speedKt: number | undefined,
    unit: WindSpeedUnit = "kt",
): string {
    if (speedKt === undefined || speedKt === null) return "N/A";

    const spdStr = formatWindSpeed(speedKt, unit);
    if (directionDeg !== undefined && directionDeg !== null) {
        const dirStr = String(Math.round(directionDeg)).padStart(3, "0");
        return `${dirStr}° @ ${spdStr}`;
    }
    return spdStr;
}

/**
 * Formats temperature in Celsius (°C) or Fahrenheit (°F).
 * @param celsius Temperature value in Celsius
 * @param unit User preference ("c" | "f")
 * @param options optional formatting options (e.g., decimals, includeSign)
 */
export function formatTemperature(
    celsius: number | undefined | null,
    unit: TemperatureUnit = "c",
    options?: { decimals?: number; includeSign?: boolean },
): string {
    if (celsius === undefined || celsius === null || isNaN(celsius)) {
        return "--";
    }

    const { decimals = 0, includeSign = true } = options || {};

    const rawVal = unit === "f" ? (celsius * 9) / 5 + 32 : celsius;
    const num = Number(rawVal.toFixed(decimals));
    const sign = includeSign && num > 0 ? "+" : "";
    const unitLabel = unit === "f" ? "°F" : "°C";

    return `${sign}${decimals > 0 ? num.toFixed(decimals) : num.toString()}${unitLabel}`;
}
