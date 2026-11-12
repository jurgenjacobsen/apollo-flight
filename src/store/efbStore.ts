import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
    EfbStatus,
    EfbTab,
    EfbTheme,
    AtcScratchpadState,
    ChecklistGroup,
} from "../types/efb";
import {
    defaultEfbStatus,
    getEfbServerStatus,
    startEfbServer,
    stopEfbServer,
    syncRouteToEfb,
    isRunningInBrowser,
} from "../services/efbService";

export const defaultChecklists: ChecklistGroup[] = [
    {
        id: "preflight",
        title: "1. Pre-Flight & Cockpit Prep",
        items: [
            { id: "pf-1", label: "Parking Brake — SET", checked: false },
            { id: "pf-2", label: "Battery Master / Ground Power — ON", checked: false },
            { id: "pf-3", label: "Nav & Logo Lights — ON", checked: false },
            { id: "pf-4", label: "ATIS / Weather Briefing — OBTAINED", checked: false },
            { id: "pf-5", label: "Altimeters (QNH) — SET & CROSSCHECKED", checked: false },
            { id: "pf-6", label: "Flight Plan & Route — LOADED & VERIFIED", checked: false },
            { id: "pf-7", label: "Fuel Quantity & Gross Weight — CHECKED", checked: false },
        ],
    },
    {
        id: "engine-start",
        title: "2. Before Engine Start & Pushback",
        items: [
            { id: "es-1", label: "Doors & Hatches — CLOSED & ARMED", checked: false },
            { id: "es-2", label: "Beacon Light — ON", checked: false },
            { id: "es-3", label: "Fuel Pumps — ON", checked: false },
            { id: "es-4", label: "Throttle / Thrust Levers — IDLE", checked: false },
            { id: "es-5", label: "ATC Pushback & Start Clearance — RECEIVED", checked: false },
            { id: "es-6", label: "Engine Start Area — CLEAR", checked: false },
        ],
    },
    {
        id: "taxi",
        title: "3. Taxi",
        items: [
            { id: "tx-1", label: "Generators & Alternators — ONLINE", checked: false },
            { id: "tx-2", label: "Flaps — SET FOR TAKEOFF", checked: false },
            { id: "tx-3", label: "Flight Controls — FREE & CORRECT", checked: false },
            { id: "tx-4", label: "Taxi & Runway Turnoff Lights — ON", checked: false },
            { id: "tx-5", label: "Brakes & Steering — CHECKED", checked: false },
            { id: "tx-6", label: "Transponder (XPDR) — ALT / AUTO", checked: false },
        ],
    },
    {
        id: "takeoff",
        title: "4. Before Takeoff",
        items: [
            { id: "to-1", label: "Takeoff Clearance — RECEIVED", checked: false },
            { id: "to-2", label: "Landing Lights & Strobes — ON", checked: false },
            { id: "to-3", label: "Pitot Heat / Anti-Ice — AS REQUIRED", checked: false },
            { id: "to-4", label: "Runway Heading & Altimeter — CONFIRMED", checked: false },
            { id: "to-5", label: "Cabin Crew / Passengers — ADVISED", checked: false },
        ],
    },
    {
        id: "climb-cruise",
        title: "5. Climb & Cruise",
        items: [
            { id: "cc-1", label: "Landing Gear — UP & RETRACTED", checked: false },
            { id: "cc-2", label: "Flaps — RETRACTED ON SCHEDULE", checked: false },
            { id: "cc-3", label: "Altimeters — TRANSITION TO STD (29.92 / 1013)", checked: false },
            { id: "cc-4", label: "Cruise Thrust / Power — SET", checked: false },
            { id: "cc-5", label: "Fuel Balance & Consumption — MONITORED", checked: false },
        ],
    },
    {
        id: "descent-approach",
        title: "6. Descent & Approach",
        items: [
            { id: "da-1", label: "Arrival ATIS & Weather — RECEIVED", checked: false },
            { id: "da-2", label: "Approach Briefing & Frequencies — COMPLETED", checked: false },
            { id: "da-3", label: "Altimeters — LOCAL QNH RESET", checked: false },
            { id: "da-4", label: "Autobrakes & Speedbrakes — ARMED", checked: false },
            { id: "da-5", label: "Landing Lights — ON (< 10,000 FT)", checked: false },
        ],
    },
    {
        id: "landing",
        title: "7. Final & Landing",
        items: [
            { id: "ld-1", label: "Landing Gear — DOWN & 3 GREEN", checked: false },
            { id: "ld-2", label: "Flaps — FULL / LANDING POSITION", checked: false },
            { id: "ld-3", label: "Landing Clearance — RECEIVED", checked: false },
            { id: "ld-4", label: "Spoilers / Reversers — ARMED / READY", checked: false },
        ],
    },
    {
        id: "shutdown",
        title: "8. After Landing & Parking",
        items: [
            { id: "sd-1", label: "Strobe & Landing Lights — OFF", checked: false },
            { id: "sd-2", label: "Flaps & Spoilers — RETRACTED", checked: false },
            { id: "sd-3", label: "Parking Brake — SET", checked: false },
            { id: "sd-4", label: "Engines — SHUT DOWN (CUTOFF)", checked: false },
            { id: "sd-5", label: "Beacon Light — OFF", checked: false },
            { id: "sd-6", label: "Master Power / Batteries — OFF", checked: false },
        ],
    },
];

export const defaultScratchpad: AtcScratchpadState = {
    atis: "",
    runway: "",
    squawk: "",
    altimeter: "",
    assignedAltitude: "",
    departureFreq: "",
    clearanceRoute: "",
    notes: "",
};

interface EfbStoreState {
    status: EfbStatus;
    activeTab: EfbTab;
    theme: EfbTheme;
    isWakeLockActive: boolean;
    wakeLockSentinel: any;
    isWsConnected: boolean;
    scratchpad: AtcScratchpadState;
    checklists: ChecklistGroup[];
    customPort: string;
    autoStartEfb: boolean;
    serverMode: "off" | "on" | "auto";
    previewInDesktop: boolean;

    // Actions
    setActiveTab: (tab: EfbTab) => void;
    setTheme: (theme: EfbTheme) => void;
    toggleTheme: () => void;
    setCustomPort: (port: string) => void;
    setAutoStartEfb: (autoStart: boolean) => void;
    setServerMode: (mode: "off" | "on" | "auto", portOverride?: number) => Promise<void>;
    setPreviewInDesktop: (preview: boolean) => void;
    setIsWsConnected: (connected: boolean) => void;
    updateScratchpad: (fields: Partial<AtcScratchpadState>) => void;
    clearScratchpad: () => void;
    toggleChecklistItem: (groupId: string, itemId: string) => void;
    resetChecklistGroup: (groupId: string) => void;
    resetAllChecklists: () => void;
    requestWakeLock: () => Promise<boolean>;
    releaseWakeLock: () => void;
    fetchStatus: () => Promise<EfbStatus>;
    startServer: (port?: number) => Promise<EfbStatus>;
    stopServer: () => Promise<void>;
    syncRoute: (route: any) => Promise<void>;
}

export const useEfbStore = create<EfbStoreState>()(
    persist(
        (set, get) => ({
            status: defaultEfbStatus,
            activeTab: "hud",
            theme: "dark",
            isWakeLockActive: false,
            wakeLockSentinel: null,
            isWsConnected: false,
            scratchpad: defaultScratchpad,
            checklists: defaultChecklists,
            customPort: "",
            autoStartEfb: false,
            serverMode: "off",
            previewInDesktop: false,

            setActiveTab: (tab) => set({ activeTab: tab }),

            setTheme: (theme) => set({ theme }),

            toggleTheme: () => {
                const current = get().theme;
                const next: EfbTheme =
                    current === "dark"
                        ? "night-red"
                        : current === "night-red"
                          ? "night-amber"
                          : "dark";
                set({ theme: next });
            },

            setCustomPort: (port) => set({ customPort: port }),

            setAutoStartEfb: (autoStart) => set({ autoStartEfb: autoStart }),

            setServerMode: async (mode, portOverride) => {
                set({ serverMode: mode });
                const targetPort =
                    portOverride ||
                    (get().customPort
                        ? parseInt(get().customPort, 10)
                        : undefined);

                if (mode === "off") {
                    set({ autoStartEfb: false });
                    await get().stopServer();
                } else if (mode === "on") {
                    set({ autoStartEfb: false });
                    await get().startServer(targetPort);
                } else if (mode === "auto") {
                    set({ autoStartEfb: true });
                    await get().startServer(targetPort);
                }
            },

            setPreviewInDesktop: (preview) => set({ previewInDesktop: preview }),

            setIsWsConnected: (connected) => set({ isWsConnected: connected }),

            updateScratchpad: (fields) =>
                set((state) => ({
                    scratchpad: { ...state.scratchpad, ...fields },
                })),

            clearScratchpad: () => set({ scratchpad: defaultScratchpad }),

            toggleChecklistItem: (groupId, itemId) =>
                set((state) => ({
                    checklists: state.checklists.map((group) =>
                        group.id === groupId
                            ? {
                                  ...group,
                                  items: group.items.map((item) =>
                                      item.id === itemId
                                          ? { ...item, checked: !item.checked }
                                          : item,
                                  ),
                              }
                            : group,
                    ),
                })),

            resetChecklistGroup: (groupId) =>
                set((state) => ({
                    checklists: state.checklists.map((group) =>
                        group.id === groupId
                            ? {
                                  ...group,
                                  items: group.items.map((item) => ({
                                      ...item,
                                      checked: false,
                                  })),
                              }
                            : group,
                    ),
                })),

            resetAllChecklists: () => set({ checklists: defaultChecklists }),

            requestWakeLock: async () => {
                if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
                    try {
                        const sentinel = await (navigator as any).wakeLock.request(
                            "screen",
                        );
                        sentinel.addEventListener("release", () => {
                            set({ isWakeLockActive: false, wakeLockSentinel: null });
                        });
                        set({ isWakeLockActive: true, wakeLockSentinel: sentinel });
                        return true;
                    } catch (err) {
                        console.warn("Wake lock request failed:", err);
                    }
                }
                return false;
            },

            releaseWakeLock: () => {
                const sentinel = get().wakeLockSentinel;
                if (sentinel) {
                    sentinel.release?.();
                    set({ isWakeLockActive: false, wakeLockSentinel: null });
                }
            },

            fetchStatus: async () => {
                const status = await getEfbServerStatus();
                set({ status });
                return status;
            },

            startServer: async (port) => {
                const targetPort =
                    port ||
                    (get().customPort
                        ? parseInt(get().customPort, 10)
                        : undefined);
                let status = await startEfbServer(targetPort);

                // Browser/mock environment fallback so status works even outside Tauri IPC
                if (!status || !status.isRunning) {
                    if (
                        typeof window !== "undefined" &&
                        !("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
                    ) {
                        status = {
                            isRunning: true,
                            port: targetPort || 24820,
                            localIp: "127.0.0.1",
                            url: `http://localhost:${targetPort || 24820}`,
                            activeClients: 0,
                            simConnected: false,
                        };
                    }
                }

                set({ status });
                return status;
            },

            stopServer: async () => {
                await stopEfbServer();
                set((state) => ({
                    status: {
                        ...state.status,
                        isRunning: false,
                        activeClients: 0,
                    },
                }));
            },

            syncRoute: async (route) => {
                await syncRouteToEfb(route);
            },
        }),
        {
            name: "apollo-efb-storage",
            partialize: (state) => ({
                scratchpad: state.scratchpad,
                checklists: state.checklists,
                theme: state.theme,
                customPort: state.customPort,
                autoStartEfb: state.autoStartEfb,
                serverMode: state.serverMode,
            }),
        },
    ),
);
