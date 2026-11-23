import { safeInvoke } from "../store/flightStore";
import {
    DeviceAuthInitResult,
    NavigraphAuthState,
    NavigraphPollStatus,
    AiracStatusInfo,
    AiracPackageInfo,
    AirportProceduresResult,
    AirwayRouteResult,
} from "../types/navigraph";

/**
 * Initiates the Navigraph OAuth 2.0 PKCE Device Authorization Flow.
 * Generates cryptographic PKCE pair in Rust and launches system browser.
 */
export async function startNavigraphAuth(
    clientId?: string,
    clientSecret?: string,
): Promise<DeviceAuthInitResult> {
    const res = await safeInvoke<DeviceAuthInitResult>(
        "navigraph_start_device_auth",
        {
            clientId: clientId || null,
            clientSecret: clientSecret || null,
        },
    );
    if (!res) {
        throw new Error("Failed to initialize Navigraph device authentication.");
    }
    return res;
}

/**
 * Polls the Navigraph token endpoint during a pending device authorization.
 */
export async function pollNavigraphToken(): Promise<NavigraphPollStatus> {
    const res = await safeInvoke<NavigraphPollStatus>(
        "navigraph_poll_device_token",
    );
    if (!res) {
        throw new Error("No response from Navigraph token poller.");
    }
    return res;
}

/**
 * Fetches the current Navigraph authentication status, performing silent refresh if needed.
 */
export async function getNavigraphAuthStatus(): Promise<NavigraphAuthState> {
    const res = await safeInvoke<NavigraphAuthState>(
        "navigraph_get_auth_status",
    );
    return res || { isAuthenticated: false };
}

/**
 * Logs out the Navigraph account and clears local session tokens.
 */
export async function logoutNavigraph(): Promise<void> {
    await safeInvoke("navigraph_logout");
}

/**
 * Returns whether the Navigraph DFD v2 SQLite AIRAC database is currently installed locally.
 */
export async function getAiracStatus(): Promise<AiracStatusInfo> {
    const res = await safeInvoke<AiracStatusInfo>("navigraph_get_airac_status");
    return res || { isInstalled: false };
}

/**
 * Queries Navigraph API for the latest available AIRAC package for this user.
 */
export async function checkAiracPackages(): Promise<AiracPackageInfo> {
    const res = await safeInvoke<AiracPackageInfo>(
        "navigraph_check_airac_packages",
    );
    if (!res) {
        throw new Error("No response checking AIRAC packages.");
    }
    return res;
}

/**
 * Downloads and installs the specified AIRAC package into local app data.
 */
export async function downloadAirac(
    fileUrl: string,
    cycle: string,
    expectedSha256?: string,
): Promise<void> {
    await safeInvoke("navigraph_download_airac", {
        fileUrl,
        cycle,
        expectedSha256: expectedSha256 || null,
    });
}

/**
 * Queries available SIDs, STARs, and IAPs for a given airport from the local AIRAC database.
 */
export async function getAirportProcedures(
    airportIcao: string,
): Promise<AirportProceduresResult> {
    const res = await safeInvoke<AirportProceduresResult>(
        "navigraph_get_airport_procedures",
        { airportIcao },
    );
    return (
        res || {
            icao: airportIcao.toUpperCase(),
            hasAirac: false,
            sids: [],
            stars: [],
            iaps: [],
        }
    );
}

/**
 * Calculates a connected airway route between departure and arrival airports using A* pathfinding
 * over tbl_enroute_airways with optional SID exit and STAR entry waypoint anchoring.
 */
export async function calculateAirwayRoute(
    departureIcao: string,
    arrivalIcao: string,
    cruiseAltFt?: number,
    sidIdent?: string,
    starIdent?: string,
): Promise<AirwayRouteResult> {
    const res = await safeInvoke<AirwayRouteResult>(
        "navigraph_calculate_airway_route",
        {
            departureIcao,
            arrivalIcao,
            cruiseAltFt: cruiseAltFt || null,
            sidIdent: sidIdent || null,
            starIdent: starIdent || null,
        },
    );
    if (!res) {
        throw new Error("Failed to calculate airway route.");
    }
    return res;
}
