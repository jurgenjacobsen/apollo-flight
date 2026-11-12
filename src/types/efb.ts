import { TelemetryData } from "./flight";
import { GeneratedRoute, SavedRoute } from "./route";

export interface EfbStatus {
    isRunning: boolean;
    port: number;
    localIp: string;
    url: string;
    activeClients: number;
    simConnected: boolean;
}

export type EfbTab = "hud" | "route" | "ifr" | "scratchpad" | "checklists";

export type EfbTheme = "dark" | "night-red" | "night-amber";

export interface AtcScratchpadState {
    atis: string;
    runway: string;
    squawk: string;
    altimeter: string;
    assignedAltitude: string;
    departureFreq: string;
    clearanceRoute: string;
    notes: string;
}

export interface ChecklistItem {
    id: string;
    label: string;
    checked: boolean;
}

export interface ChecklistGroup {
    id: string;
    title: string;
    items: ChecklistItem[];
}
