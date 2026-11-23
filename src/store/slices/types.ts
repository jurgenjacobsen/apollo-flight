import type {
    TelemetryData,
    FlightRecord,
    FlightStage,
    TouchdownEvent,
    VisitedAirport,
    VisitedCountry,
    ExportFormat,
    LogbookExportFormat,
    WeightUnit,
    LengthUnit,
    VisibilityUnit,
    WindSpeedUnit,
    TemperatureUnit,
    ApolloExportScope,
    ApolloExportBundle,
    Airport,
} from "../../types/flight";
import type { SavedRoute, GeneratedRoute } from "../../types/route";
import type { SimBriefOFP } from "../../types/simbrief";
import type { Checklist } from "../../types/checklist";
import type { DocFileContent } from "../../types/documentation";
import type { Update } from "@tauri-apps/plugin-updater";

export interface DeletedFlightRecord extends FlightRecord {
    deletedAt: string;
}

export interface TelemetrySlice {
    currentTelemetry: TelemetryData;
    latestTouchdown: TouchdownEvent | null;
    showTouchdownBanner: boolean;
    dismissTouchdownBanner: () => void;
    updateTelemetry: (telemetry: Partial<TelemetryData>) => void;
}

export interface FlightRecordingSlice {
    activeFlight: FlightRecord | null;
    flightStage: FlightStage;
    showEndFlightPrompt: boolean;
    setShowEndFlightPrompt: (show: boolean) => void;
    startManualFlight: (
        depIcao: string,
        arrIcao: string,
        aircraft: string,
    ) => void;
    endActiveFlight: () => Promise<void>;
}

export interface LogbookSlice {
    flights: FlightRecord[];
    recycleBin: DeletedFlightRecord[];
    selectedFlightId: string | null;
    scrubbedTelemetryIndex: number | null;
    pageSize: number;
    isLoadingFlightDetails: boolean;
    setSelectedFlightId: (id: string | null) => void;
    setScrubbedTelemetryIndex: (index: number | null) => void;
    setPageSize: (size: number) => Promise<void>;
    loadFlightDetails: (id: string) => Promise<FlightRecord | null>;
    deleteFlight: (id: string) => Promise<void>;
    moveToRecycleBin: (id: string) => Promise<void>;
    restoreFlightFromRecycleBin: (id: string) => Promise<void>;
    permanentlyDeleteFromRecycleBin: (id: string) => Promise<void>;
    emptyRecycleBin: () => Promise<void>;
    purgeExpiredRecycleBinItems: () => Promise<void>;
    exportFlight: (id: string, format: ExportFormat) => Promise<string | null>;
    exportLogbook: (
        format: LogbookExportFormat,
        flightsOverride?: FlightRecord[],
    ) => Promise<string | null>;
    exportDataBundle: (
        scope: ApolloExportScope,
        includeTelemetry?: boolean,
    ) => Promise<string | null>;
    importDataBundle: (
        bundle: ApolloExportBundle,
        strategy: "skip" | "overwrite" | "keep_both",
        settingsChoices?: Record<string, "current" | "imported">,
    ) => Promise<{
        importedFlights: number;
        importedRoutes: number;
        message: string;
    }>;
}

export interface RouteSlice {
    savedRoutes: SavedRoute[];
    currentGeneratedRoute: GeneratedRoute | null;
    simbriefUsername: string;
    latestOfp: SimBriefOFP | null;
    detectedMultiSectorRoute: {
        route: SavedRoute;
        currentAirportIcao: string;
        nextSectorArrivalIcao?: string;
    } | null;
    fetchSavedRoutes: () => Promise<SavedRoute[]>;
    setCurrentGeneratedRoute: (route: GeneratedRoute | null) => void;
    setSimbriefUsername: (username: string) => Promise<void>;
    setLatestOfp: (ofp: SimBriefOFP | null) => void;
    saveRoute: (
        route: Partial<SavedRoute> & {
            departureIcao: string;
            arrivalIcao: string;
        },
    ) => Promise<SavedRoute | null>;
    updateSavedRoute: (
        id: string,
        updates: Partial<SavedRoute>,
    ) => Promise<SavedRoute | null>;
    toggleRouteFavorite: (id: string) => Promise<boolean>;
    updateRouteStatus: (
        id: string,
        status: "draft" | "flown",
        linkedFlightId?: string,
    ) => Promise<void>;
    deleteSavedRoute: (id: string) => Promise<void>;
}

export interface SettingsSlice {
    activeView:
        | "dashboard"
        | "new-route"
        | "saved-routes"
        | "logbook"
        | "flight-detail"
        | "visited"
        | "ifr-trainer"
        | "hold-trainer"
        | "checklists"
        | "settings"
        | "feedback"
        | "recycle-bin"
        | "documentation";
    settingsActiveTab: string;
    theme: "light" | "dark";
    weightUnit: WeightUnit;
    lengthUnit: LengthUnit;
    visibilityUnit: VisibilityUnit;
    windSpeedUnit: WindSpeedUnit;
    temperatureUnit: TemperatureUnit;
    touchdownNotificationMode: "in-app" | "overlay" | "both";
    touchdownOverlayPosition: "top-right" | "top-center" | "bottom-right";
    touchdownOverlayDuration: number;
    dbInitialized: boolean;
    airportsCount: number;
    isSyncingAirports: boolean;
    syncProgress: { stage: string; percent: number; message: string } | null;
    lastSyncMessage: string | null;
    nearestAirport: Airport | null;
    visitedAirports: VisitedAirport[];
    visitedCountries: VisitedCountry[];
    closeToTray: boolean;
    autoStartRecording: boolean;
    recordDetailedTelemetry: boolean;
    autoCheckUpdates: boolean;
    availableUpdate: Update | null;
    isCheckingUpdate: boolean;
    isInstallingUpdate: boolean;
    downloadProgress: number | null;
    updateMessage: string | null;
    updateDismissed: boolean;
    docCustomDirs: string[];
    docLiveUpdate: boolean;
    docActiveFilePath: string | null;
    docContentCache: Record<string, DocFileContent>;
    checklists: Checklist[];
    activeChecklistId: string | null;
    isSidebarCollapsed: boolean;
    showOnboarding: boolean;
    setShowOnboarding: (show: boolean) => void;
    completeOnboarding: () => Promise<void>;
    initFromDatabase: () => Promise<void>;
    fetchAirportsCount: () => Promise<void>;
    fetchNearestAirport: (
        lat: number,
        lon: number,
        radiusNm?: number,
    ) => Promise<Airport | null>;
    syncOurAirports: () => Promise<any>;
    setTheme: (theme: "light" | "dark") => void;
    toggleTheme: () => void;
    setWeightUnit: (unit: WeightUnit) => Promise<void>;
    setLengthUnit: (unit: LengthUnit) => Promise<void>;
    setVisibilityUnit: (unit: VisibilityUnit) => Promise<void>;
    setWindSpeedUnit: (unit: WindSpeedUnit) => Promise<void>;
    setTemperatureUnit: (unit: TemperatureUnit) => Promise<void>;
    setActiveView: (view: SettingsSlice["activeView"]) => void;
    setSettingsActiveTab: (tab: string) => void;
    setCloseToTray: (enabled: boolean) => Promise<void>;
    setDocCustomDirs: (dirs: string[]) => Promise<void>;
    setDocLiveUpdate: (enabled: boolean) => Promise<void>;
    setDocActiveFilePath: (path: string | null) => void;
    setDocCachedContent: (path: string, content: DocFileContent) => void;
    clearDocCache: () => void;
    setAutoStartRecording: (enabled: boolean) => void;
    setRecordDetailedTelemetry: (enabled: boolean) => void;
    setAutoCheckUpdates: (enabled: boolean) => void;
    dismissUpdate: () => void;
    checkForUpdates: (silent?: boolean) => Promise<Update | null>;
    installUpdate: () => Promise<void>;
    addVisitedAirport: (airport: VisitedAirport) => void;
    toggleSidebar: () => void;
    setActiveChecklistId: (id: string | null) => void;
    setChecklists: (checklists: Checklist[]) => void;
    addChecklist: (
        checklist: Omit<Checklist, "id" | "createdAt" | "updatedAt"> & { id?: string },
    ) => Checklist;
    updateChecklist: (id: string, updates: Partial<Checklist>) => void;
    deleteChecklist: (id: string) => void;
    duplicateChecklist: (id: string) => void;
    toggleChecklistItem: (
        checklistId: string,
        sectionId: string,
        itemId: string,
    ) => void;
    resetChecklist: (checklistId: string) => void;
    resetChecklistSection: (checklistId: string, sectionId: string) => void;
    setTouchdownNotificationMode: (mode: "in-app" | "overlay" | "both") => Promise<void>;
    setTouchdownOverlayPosition: (pos: "top-right" | "top-center" | "bottom-right") => Promise<void>;
    setTouchdownOverlayDuration: (duration: number) => Promise<void>;
    triggerTouchdownNotification: (touchdown: TouchdownEvent, preview?: boolean) => Promise<void>;
    wipeAllUserData: () => Promise<void>;
}

export type FlightState = TelemetrySlice &
    FlightRecordingSlice &
    LogbookSlice &
    RouteSlice &
    SettingsSlice;
