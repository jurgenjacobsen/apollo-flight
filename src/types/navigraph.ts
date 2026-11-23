export interface NavigraphAuthState {
    isAuthenticated: boolean;
    userId?: string;
    userName?: string;
    preferredUsername?: string;
    expiresAt?: number;
}

export interface DeviceAuthInitResult {
    userCode: string;
    verificationUri: string;
    verificationUriComplete?: string;
    expiresIn: number;
    interval: number;
}

export interface NavigraphPollStatus {
    status: "pending" | "slow_down" | "success" | "error";
    message?: string;
    user?: NavigraphAuthState;
}

export interface AiracStatusInfo {
    isInstalled: boolean;
    currentCycle?: string;
    status?: string;
    fileSizeMb?: number;
    updatedAt?: string;
    databasePath?: string;
}

export interface AiracPackageInfo {
    cycle: string;
    status: string;
    format?: string;
    fileUrl: string;
    fileSha256?: string;
    fileSize: number;
}

export interface AiracProgressPayload {
    percent: number;
    downloadedBytes: number;
    totalBytes: number;
    stage: string;
    message: string;
}

export interface ProcedureWaypoint {
    ident: string;
    latitude: number;
    longitude: number;
    altitudeDesc?: string;
    altitude1?: number;
    speedLimit?: number;
}

export interface ProcedureItem {
    ident: string;
    transition?: string;
    runway?: string;
    waypoints: ProcedureWaypoint[];
}

export interface AirportProceduresResult {
    icao: string;
    hasAirac: boolean;
    sids: ProcedureItem[];
    stars: ProcedureItem[];
    iaps: ProcedureItem[];
}

export interface AirwayWaypointResult {
    ident: string;
    latitude: number;
    longitude: number;
    airway?: string;
    sequence: number;
    distanceNm: number;
}

export interface AirwayRouteResult {
    departureIcao: string;
    arrivalIcao: string;
    sidUsed?: string;
    starUsed?: string;
    totalDistanceNm: number;
    waypoints: AirwayWaypointResult[];
}
