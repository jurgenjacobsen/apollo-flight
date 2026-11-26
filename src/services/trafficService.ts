import {
    LiveTrafficAircraft,
    LiveTrafficFeedResult,
    LiveTrafficNetwork,
    LiveTrafficProvider,
    LiveTrafficSource,
} from "../types/traffic";
import { calculateDistanceNm } from "./terrainMora";

function toFiniteNumber(value: unknown, fallback: number = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function isValidLatLon(lat: unknown, lon: unknown): boolean {
    const la = toFiniteNumber(lat, Number.NaN);
    const lo = toFiniteNumber(lon, Number.NaN);
    return (
        Number.isFinite(la) &&
        Number.isFinite(lo) &&
        la >= -90 &&
        la <= 90 &&
        lo >= -180 &&
        lo <= 180
    );
}

abstract class BaseJsonTrafficProvider implements LiveTrafficProvider {
    abstract readonly network: LiveTrafficSource;
    abstract readonly displayName: string;
    abstract readonly feedUrl: string;

    abstract normalize(rawPayload: unknown): LiveTrafficAircraft[];

    async fetchTraffic(options?: {
        signal?: AbortSignal;
        fetcher?: typeof fetch;
    }): Promise<LiveTrafficFeedResult> {
        const fetchFn = options?.fetcher ?? fetch;
        const response = await fetchFn(this.feedUrl, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: options?.signal,
        });

        if (!response.ok) {
            throw new Error(
                `${this.displayName} traffic feed failed (HTTP ${response.status}: ${response.statusText})`,
            );
        }

        const payload: unknown = await response.json();
        return {
            network: this.network,
            fetchedAt: new Date().toISOString(),
            aircraft: this.normalize(payload),
        };
    }
}

export class VatsimTrafficProvider extends BaseJsonTrafficProvider {
    readonly network = "vatsim" as const;
    readonly displayName = "VATSIM";
    readonly feedUrl = "https://data.vatsim.net/v3/vatsim-data.json";

    normalize(rawPayload: unknown): LiveTrafficAircraft[] {
        const pilots = (rawPayload as { pilots?: unknown[] } | null)?.pilots;
        if (!Array.isArray(pilots)) return [];

        const nowIso = new Date().toISOString();
        const result: LiveTrafficAircraft[] = [];

        for (const raw of pilots) {
            if (!raw || typeof raw !== "object") continue;
            const p = raw as Record<string, any>;
            const callsign = toOptionalString(p.callsign);
            if (!callsign || !isValidLatLon(p.latitude, p.longitude)) continue;

            const fp =
                p.flight_plan && typeof p.flight_plan === "object"
                    ? (p.flight_plan as Record<string, any>)
                    : undefined;

            result.push({
                id: `vatsim:${p.cid ?? callsign}:${callsign}`,
                network: "vatsim",
                callsign,
                aircraftType: toOptionalString(
                    fp?.aircraft_short ?? fp?.aircraft_faa ?? fp?.aircraft,
                ),
                latitude: toFiniteNumber(p.latitude),
                longitude: toFiniteNumber(p.longitude),
                altitudeFt: Math.round(toFiniteNumber(p.altitude)),
                groundSpeedKt: Math.round(toFiniteNumber(p.groundspeed)),
                headingDeg: Math.round(toFiniteNumber(p.heading)) % 360,
                departureIcao: toOptionalString(fp?.departure)?.toUpperCase(),
                arrivalIcao: toOptionalString(fp?.arrival)?.toUpperCase(),
                squawk: toOptionalString(p.transponder),
                pilotName: toOptionalString(p.name),
                updatedAt: toOptionalString(p.last_updated) ?? nowIso,
            });
        }

        return result;
    }
}

export class IvaoTrafficProvider extends BaseJsonTrafficProvider {
    readonly network = "ivao" as const;
    readonly displayName = "IVAO";
    readonly feedUrl = "https://api.ivao.aero/v2/tracker/whazzup";

    normalize(rawPayload: unknown): LiveTrafficAircraft[] {
        const root = rawPayload as
            | { clients?: { pilots?: unknown[] }; pilots?: unknown[] }
            | null;
        const pilots = root?.clients?.pilots ?? root?.pilots;
        if (!Array.isArray(pilots)) return [];

        const nowIso = new Date().toISOString();
        const result: LiveTrafficAircraft[] = [];

        for (const raw of pilots) {
            if (!raw || typeof raw !== "object") continue;
            const p = raw as Record<string, any>;
            const callsign = toOptionalString(p.callsign);
            const track =
                p.lastTrack && typeof p.lastTrack === "object"
                    ? (p.lastTrack as Record<string, any>)
                    : p;

            if (!callsign || !isValidLatLon(track.latitude, track.longitude)) {
                continue;
            }

            const fp =
                p.flightPlan && typeof p.flightPlan === "object"
                    ? (p.flightPlan as Record<string, any>)
                    : undefined;

            result.push({
                id: `ivao:${p.userId ?? callsign}:${callsign}`,
                network: "ivao",
                callsign,
                aircraftType: toOptionalString(
                    fp?.aircraftId ?? fp?.aircraft?.icaoCode,
                ),
                latitude: toFiniteNumber(track.latitude),
                longitude: toFiniteNumber(track.longitude),
                altitudeFt: Math.round(toFiniteNumber(track.altitude)),
                groundSpeedKt: Math.round(toFiniteNumber(track.groundSpeed)),
                headingDeg: Math.round(toFiniteNumber(track.heading)) % 360,
                departureIcao: toOptionalString(fp?.departureId)?.toUpperCase(),
                arrivalIcao: toOptionalString(fp?.arrivalId)?.toUpperCase(),
                squawk:
                    track.transponder !== undefined && track.transponder !== null
                        ? String(track.transponder)
                        : toOptionalString(p.squawk),
                onGround:
                    typeof track.onGround === "boolean"
                        ? track.onGround
                        : undefined,
                updatedAt: toOptionalString(track.timestamp) ?? nowIso,
            });
        }

        return result;
    }
}

const providerRegistry: Record<LiveTrafficSource, LiveTrafficProvider> = {
    vatsim: new VatsimTrafficProvider(),
    ivao: new IvaoTrafficProvider(),
};

export function registerTrafficProvider(provider: LiveTrafficProvider): void {
    providerRegistry[provider.network] = provider;
}

export function getTrafficProvider(
    network: LiveTrafficSource,
): LiveTrafficProvider {
    return providerRegistry[network];
}

export async function fetchLiveTraffic(
    network: LiveTrafficNetwork,
    options?: {
        signal?: AbortSignal;
        fetcher?: typeof fetch;
    },
): Promise<LiveTrafficFeedResult> {
    if (network === "off") {
        return {
            network: "off",
            fetchedAt: new Date().toISOString(),
            aircraft: [],
        };
    }
    return getTrafficProvider(network).fetchTraffic(options);
}

export function filterTrafficWithinRadius(
    aircraft: LiveTrafficAircraft[],
    centerLat: number,
    centerLon: number,
    radiusNm: number,
): LiveTrafficAircraft[] {
    if (radiusNm <= 0) return [];
    return aircraft.filter(
        (ac) =>
            calculateDistanceNm(centerLat, centerLon, ac.latitude, ac.longitude) <=
            radiusNm,
    );
}
