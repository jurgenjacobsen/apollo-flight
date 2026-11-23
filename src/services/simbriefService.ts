import { SimBriefOFP, SimBriefFix } from "../types/simbrief";
import { GeneratedRoute, RouteSector, RouteWaypoint, SimBriefSummary } from "../types/route";
import { Airport } from "../types/flight";

/**
 * Calculates initial great-circle bearing from point 1 to point 2 in degrees (0-359).
 */
export function calculateBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return Math.round((toDeg(θ) + 360) % 360);
}

/**
 * Fetches the latest generated Operational Flight Plan (OFP) from SimBrief API.
 * Supports either username / alias or numeric pilot ID.
 */
export async function fetchLatestSimBriefOFP(usernameOrPilotId: string): Promise<SimBriefOFP> {
    const trimmed = usernameOrPilotId.trim();
    if (!trimmed) {
        throw new Error("SimBrief username or Pilot ID is required.");
    }

    const isNumeric = /^\d+$/.test(trimmed);
    const queryParam = isNumeric
        ? `userid=${encodeURIComponent(trimmed)}`
        : `username=${encodeURIComponent(trimmed)}`;

    const url = `https://www.simbrief.com/api/xml.fetcher.php?${queryParam}&json=1`;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch SimBrief plan (HTTP ${res.status}: ${res.statusText})`);
    }

    const data: SimBriefOFP = await res.json();

    if (!data || data.fetch?.status !== "Success") {
        const errorMsg =
            data?.fetch?.status && data.fetch.status !== "Success"
                ? data.fetch.status
                : "No active SimBrief Operational Flight Plan found for this user.";
        throw new Error(`SimBrief Error: ${errorMsg}`);
    }

    return data;
}

/**
 * Converts a raw SimBrief OFP into Apollo Flight's canonical GeneratedRoute.
 */
export function normalizeSimBriefToRoute(ofp: SimBriefOFP): GeneratedRoute {
    const originLat = parseFloat(ofp.origin.pos_lat) || 0;
    const originLon = parseFloat(ofp.origin.pos_long) || 0;
    const originElev = parseFloat(ofp.origin.elevation) || 0;

    const destLat = parseFloat(ofp.destination.pos_lat) || 0;
    const destLon = parseFloat(ofp.destination.pos_long) || 0;
    const destElev = parseFloat(ofp.destination.elevation) || 0;

    const departure: Airport = {
        icao: ofp.origin.icao_code.toUpperCase(),
        name: ofp.origin.name || ofp.origin.icao_code,
        latitude: originLat,
        longitude: originLon,
        elevationFt: originElev,
        countryCode: "",
        countryName: "",
    };

    const arrival: Airport = {
        icao: ofp.destination.icao_code.toUpperCase(),
        name: ofp.destination.name || ofp.destination.icao_code,
        latitude: destLat,
        longitude: destLon,
        elevationFt: destElev,
        countryCode: "",
        countryName: "",
    };

    // Extract waypoints from SimBrief navlog
    const waypoints: RouteWaypoint[] = [];
    if (ofp.navlog?.fix) {
        const fixes: SimBriefFix[] = Array.isArray(ofp.navlog.fix)
            ? ofp.navlog.fix
            : [ofp.navlog.fix];

        for (const f of fixes) {
            const wLat = parseFloat(f.pos_lat);
            const wLon = parseFloat(f.pos_long);
            if (!isNaN(wLat) && !isNaN(wLon)) {
                waypoints.push({
                    ident: f.ident,
                    name: f.name || f.ident,
                    latitude: wLat,
                    longitude: wLon,
                    altitudeFt: parseInt(f.altitude_feet, 10) || undefined,
                    airway: f.via_airway || undefined,
                    stage: f.stage,
                    isSidStar: f.is_sid_star === "1",
                });
            }
        }
    }

    const distNm =
        parseFloat(ofp.general.gc_distance) ||
        parseFloat(ofp.general.air_distance) ||
        0;

    // Enroute time in minutes
    const airborneMinutes = Math.max(
        1,
        Math.round((parseInt(ofp.times.est_time_enroute, 10) || 0) / 60)
    );

    const cruiseAltFt = parseInt(ofp.general.initial_altitude, 10) || 30000;
    const climbMinutes = Math.min(25, Math.max(5, Math.round(airborneMinutes * 0.2)));
    const descentMinutes = Math.min(25, Math.max(5, Math.round(airborneMinutes * 0.2)));
    const cruiseMinutes = Math.max(0, airborneMinutes - climbMinutes - descentMinutes);

    const simbriefSummary: SimBriefSummary = {
        flightNumber: ofp.general.flight_number
            ? `${ofp.general.icao_airline || ""}${ofp.general.flight_number}`
            : undefined,
        routeString: ofp.general.route,
        plannedRampFuel: parseFloat(ofp.fuel.plan_ramp) || undefined,
        plannedBurn: parseFloat(ofp.fuel.enroute_burn) || undefined,
        estZfw: parseFloat(ofp.weights.est_zfw) || undefined,
        estTow: parseFloat(ofp.weights.est_tow) || undefined,
        costIndex: ofp.general.costindex,
        originRunway: ofp.origin.plan_rwy,
        destRunway: ofp.destination.plan_rwy,
        airacCycle: ofp.params.airac,
    };

    const sector: RouteSector = {
        sectorIndex: 0,
        departure,
        arrival,
        distanceNm: distNm,
        initialBearingDeg: calculateBearingDeg(originLat, originLon, destLat, destLon),
        airborneMinutes,
        groundMinutes: 20,
        totalMinutes: airborneMinutes + 20,
        climbMinutes,
        cruiseMinutes,
        descentMinutes,
        cruiseAltitudeFt: cruiseAltFt,
        cruiseSpeedKt: 420,
        waypoints,
        simbriefSummary,
    };

    const flightTitle = simbriefSummary.flightNumber
        ? `${simbriefSummary.flightNumber} (${departure.icao} ➔ ${arrival.icao})`
        : `SimBrief: ${departure.icao} ➔ ${arrival.icao}`;

    return {
        id: `simbrief-${Date.now()}`,
        createdAt: new Date().toISOString(),
        aircraftCategory: "D",
        aircraftName: flightTitle,
        sectors: [sector],
        totalDistanceNm: distNm,
        totalAirborneMinutes: airborneMinutes,
        totalGroundMinutes: 20,
        totalDurationMinutes: airborneMinutes + 20,
        includeGroundTime: true,
        isRoundTrip: false,
        simbriefOfp: ofp,
        waypoints,
        simbriefSummary,
    };
}
