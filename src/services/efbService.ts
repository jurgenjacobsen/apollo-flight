import { EfbStatus } from "../types/efb";
import { TelemetryData } from "../types/flight";
import { safeInvoke } from "../store/flightStore";

// Fallback status when offline or in browser
export const defaultEfbStatus: EfbStatus = {
    isRunning: false,
    port: 0,
    localIp: "127.0.0.1",
    url: "",
    activeClients: 0,
    simConnected: false,
};

/**
 * Checks whether the application is running in desktop Tauri or inside a mobile/web browser
 */
export function isRunningInBrowser(): boolean {
    if (typeof window === "undefined") return false;
    // Tauri v2 injects __TAURI_INTERNALS__ on window
    return !(window as any).__TAURI_INTERNALS__ && !(window as any).__TAURI__;
}

/**
 * Checks whether current URL is in EFB Companion mode
 */
export function isEfbMode(): boolean {
    if (typeof window === "undefined") return false;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("mode") === "efb") return true;
    if (window.location.pathname.startsWith("/efb")) return true;
    // If opened in external browser on non-dev port (or any external browser), assume EFB mode
    return isRunningInBrowser();
}

/**
 * Fetches EFB status from Rust backend (when in Tauri) or HTTP endpoint (when in browser)
 */
export async function getEfbServerStatus(): Promise<EfbStatus> {
    if (isRunningInBrowser()) {
        try {
            const res = await fetch("/api/status");
            if (res.ok) {
                const data = await res.json();
                return {
                    isRunning: true,
                    port: data.port || 0,
                    localIp: window.location.hostname,
                    url: window.location.origin,
                    activeClients: data.activeClients || 1,
                    simConnected: data.simConnected || false,
                };
            }
        } catch {}
        return defaultEfbStatus;
    }

    try {
        const status = await safeInvoke<EfbStatus>("get_efb_status");
        return status || defaultEfbStatus;
    } catch (e) {
        console.warn("Failed to get EFB status:", e);
        return defaultEfbStatus;
    }
}

/**
 * Starts the EFB HTTP & WebSocket server
 */
export async function startEfbServer(port?: number): Promise<EfbStatus> {
    try {
        const status = await safeInvoke<EfbStatus>("start_efb", { port: port || null });
        return status || defaultEfbStatus;
    } catch (e) {
        console.error("Failed to start EFB server:", e);
        throw e;
    }
}

/**
 * Stops the EFB HTTP & WebSocket server
 */
export async function stopEfbServer(): Promise<void> {
    try {
        await safeInvoke("stop_efb");
    } catch (e) {
        console.error("Failed to stop EFB server:", e);
        throw e;
    }
}

/**
 * Syncs the active planned route to the EFB server so mobile companions can render the OFP
 */
export async function syncRouteToEfb(route: any): Promise<void> {
    try {
        await safeInvoke("set_efb_route", { route: route || null });
    } catch (e) {
        console.warn("Failed to sync route to EFB:", e);
    }
}

/**
 * WebSocket manager for browser clients connecting to the EFB telemetry stream
 */
export class EfbWebSocketClient {
    private ws: WebSocket | null = null;
    private reconnectTimer: any = null;
    private onTelemetryCallback: ((data: TelemetryData) => void) | null = null;
    private onStatusCallback: ((connected: boolean) => void) | null = null;
    private isManuallyClosed = false;

    constructor(
        onTelemetry: (data: TelemetryData) => void,
        onStatus: (connected: boolean) => void,
    ) {
        this.onTelemetryCallback = onTelemetry;
        this.onStatusCallback = onStatus;
    }

    public connect(customUrl?: string) {
        this.isManuallyClosed = false;
        if (typeof window === "undefined") return;

        let wsUrl = customUrl;
        if (!wsUrl) {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            wsUrl = `${protocol}//${window.location.host}/ws`;
        }

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.onStatusCallback?.(true);
            };

            this.ws.onmessage = (event) => {
                try {
                    const raw = JSON.parse(event.data);
                    // Map raw TelemetryPacket to frontend TelemetryData
                    const mapped: TelemetryData = {
                        simConnected: raw.simConnected ?? false,
                        isInMenu: raw.isInMenu ?? false,
                        flightLoadCount: raw.flightLoadCount ?? 0,
                        latitude: raw.latitude ?? 0,
                        longitude: raw.longitude ?? 0,
                        altitudeMsl: raw.altitudeMsl ?? 0,
                        altitudeAgl: raw.altitudeAgl ?? 0,
                        indicatedAirspeed: raw.indicatedAirspeed ?? 0,
                        trueAirspeed: raw.trueAirspeed ?? 0,
                        groundSpeed: raw.groundSpeed ?? 0,
                        verticalSpeed: raw.verticalSpeed ?? 0,
                        pitch: raw.pitch ?? 0,
                        bank: raw.bank ?? 0,
                        heading: raw.heading ?? 0,
                        aircraftTitle: raw.aircraftTitle ?? "Simulator Aircraft",
                        isOnGround: raw.isOnGround ?? true,
                        isEngineRunning: raw.isEngineRunning ?? false,
                        nav1Obs: raw.nav1Obs ?? 0,
                        nav1Radial: raw.nav1Radial ?? 0,
                        nav1RelativeBearing: raw.nav1RelativeBearing ?? 0,
                        nav1DmeDistance: raw.nav1DmeDistance ?? 0,
                        nav1DmeSpeed: raw.nav1DmeSpeed ?? 0,
                        nav2Obs: raw.nav2Obs ?? 0,
                        nav2Radial: raw.nav2Radial ?? 0,
                        nav2RelativeBearing: raw.nav2RelativeBearing ?? 0,
                        nav2DmeDistance: raw.nav2DmeDistance ?? 0,
                        nav2DmeSpeed: raw.nav2DmeSpeed ?? 0,
                        adf1RelativeBearing: raw.adf1RelativeBearing ?? 0,
                        windSpeed: raw.windSpeed ?? 0,
                        windDirection: raw.windDirection ?? 0,
                        oat: raw.oat ?? 15,
                        tat: raw.tat ?? 15,
                        visibility: raw.visibility ?? 10,
                        totalWeight: raw.totalWeight ?? 0,
                        timestamp: raw.timestamp ?? new Date().toISOString(),
                    };
                    this.onTelemetryCallback?.(mapped);
                } catch (e) {
                    console.error("Error parsing EFB telemetry JSON:", e);
                }
            };

            this.ws.onclose = () => {
                this.onStatusCallback?.(false);
                if (!this.isManuallyClosed) {
                    this.reconnectTimer = setTimeout(() => {
                        this.connect(customUrl);
                    }, 2000);
                }
            };

            this.ws.onerror = () => {
                this.ws?.close();
            };
        } catch (e) {
            console.error("WebSocket init error:", e);
            this.reconnectTimer = setTimeout(() => {
                this.connect(customUrl);
            }, 3000);
        }
    }

    public disconnect() {
        this.isManuallyClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
