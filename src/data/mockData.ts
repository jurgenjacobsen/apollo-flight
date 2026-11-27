export interface AirportInfo {
    icao: string;
    name: string;
    city: string;
    country: string;
    countryCode: string;
    lat: number;
    lon: number;
    elevation: number;
    airportType: "large_airport" | "medium_airport" | "small_airport";
    continent: string;
    maxRunwayLengthFt?: number;
    hasPaved?: boolean;
    hasUnpaved?: boolean;
}

export function isHelipadOrHeliport(apt: {
    name?: string;
    airportType?: string;
}): boolean {
    const type = (apt.airportType || "").toLowerCase();
    const name = (apt.name || "").toLowerCase();
    return (
        type === "heliport" ||
        type === "helipad" ||
        type.includes("heli") ||
        type.includes("pad") ||
        type === "closed" ||
        type === "seaplane_base" ||
        type === "balloonport" ||
        name.includes("heliport") ||
        name.includes("helipad") ||
        name.includes("helistop")
    );
}

export { calculateDistanceNm } from "../services/terrainMora";

export function calculateInitialBearing(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
        Math.cos(φ1) * Math.sin(φ2) -
        Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (Math.round((θ * 180) / Math.PI) + 360) % 360;
}
