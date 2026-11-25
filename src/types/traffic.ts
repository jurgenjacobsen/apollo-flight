export type LiveTrafficSource = "vatsim" | "ivao" | "pilotedge";

export type LiveTrafficNetwork = "off" | LiveTrafficSource;

export interface LiveTrafficAircraft {
    id: string;
    network: LiveTrafficSource;
    callsign: string;
    aircraftType?: string;
    latitude: number;
    longitude: number;
    altitudeFt: number;
    groundSpeedKt: number;
    headingDeg: number;
    verticalSpeedFpm?: number;
    departureIcao?: string;
    arrivalIcao?: string;
    squawk?: string;
    onGround?: boolean;
    pilotName?: string;
    updatedAt: string;
}

export interface LiveTrafficFeedResult {
    network: LiveTrafficNetwork;
    fetchedAt: string;
    aircraft: LiveTrafficAircraft[];
}

export interface LiveTrafficProvider {
    readonly network: LiveTrafficSource;
    readonly displayName: string;
    readonly feedUrl: string;
    normalize(rawPayload: unknown): LiveTrafficAircraft[];
    fetchTraffic(options?: {
        signal?: AbortSignal;
        fetcher?: typeof fetch;
    }): Promise<LiveTrafficFeedResult>;
}

export const LIVE_TRAFFIC_NETWORK_OPTIONS: Array<{
    value: LiveTrafficNetwork;
    label: string;
}> = [
    { value: "off", label: "Off" },
    { value: "vatsim", label: "VATSIM" },
    { value: "ivao", label: "IVAO" },
    { value: "pilotedge", label: "PilotEdge" },
];
