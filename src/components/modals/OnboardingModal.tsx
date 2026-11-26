import React, { useState } from "react";
import { useFlightStore } from "../../store/flightStore";
import { useEfbStore } from "../../store/efbStore";
import {
    Activity,
    Scale,
    Database,
    Tablet,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    ArrowLeft,
    Check,
    RefreshCw,
    ExternalLink,
    Plane,
    Sparkles,
    Route,
    Bookmark,
    ListChecks,
    FileText,
    Mic,
} from "lucide-react";
import { QrCodeView } from "../ui/QrCodeView";
import type {
    WeightUnit,
    LengthUnit,
    VisibilityUnit,
    WindSpeedUnit,
    TemperatureUnit,
} from "../../types/flight";

interface OnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
    isOpen,
    onClose,
}) => {
    const [currentStep, setCurrentStep] = useState<number>(1);
    const totalSteps = 6;

    const {
        currentTelemetry,
        airportsCount,
        isSyncingAirports,
        syncProgress,
        syncOurAirports,
        weightUnit,
        setWeightUnit,
        lengthUnit,
        setLengthUnit,
        visibilityUnit,
        setVisibilityUnit,
        windSpeedUnit,
        setWindSpeedUnit,
        temperatureUnit,
        setTemperatureUnit,
        completeOnboarding,
    } = useFlightStore();

    const { status: efbStatus, startServer } = useEfbStore();
    const [isStartingServer, setIsStartingServer] = useState(false);

    if (!isOpen) return null;

    const handleFinish = async () => {
        await completeOnboarding();
        onClose();
    };

    const handleSkip = async () => {
        await completeOnboarding();
        onClose();
    };

    const efbUrl = efbStatus?.url || `http://127.0.0.1:${efbStatus?.port || 8080}`;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
        >
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] font-sans">
                {/* Header */}
                <div className="px-5 py-4 border-b border-neutral-200 dark:border-geist-hairline flex items-center justify-between bg-neutral-50/60 dark:bg-[#0c0c0c]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline text-neutral-700 dark:text-neutral-300">
                            <Plane className="w-4 h-4" />
                        </div>
                        <div>
                            <h2
                                id="onboarding-modal-title"
                                className="text-sm sm:text-base font-semibold tracking-tight text-neutral-900 dark:text-white"
                            >
                                Welcome to Apollo Flight
                            </h2>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted tabular-nums">
                                Step {currentStep} of {totalSteps} · Initial Setup
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleSkip}
                        className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors px-2.5 py-1 rounded-xs hover:bg-neutral-100 dark:hover:bg-geist-cardHover"
                    >
                        Skip Tour
                    </button>
                </div>

                {/* Stepper Progress Indicator */}
                <div className="px-5 pt-4 pb-2 border-b border-neutral-100 dark:border-geist-hairline">
                    <div className="flex items-center justify-between">
                        {[
                            { num: 1, label: "Sim Bridge", icon: Activity },
                            { num: 2, label: "Units", icon: Scale },
                            { num: 3, label: "Aerodromes", icon: Database },
                            { num: 4, label: "Routes", icon: Route },
                            { num: 5, label: "Checklists & Docs", icon: ListChecks },
                            { num: 6, label: "EFB Companion", icon: Tablet },
                        ].map((s) => {
                            const Icon = s.icon;
                            const isActive = currentStep === s.num;
                            const isDone = currentStep > s.num;

                            return (
                                <button
                                    key={s.num}
                                    type="button"
                                    onClick={() => setCurrentStep(s.num)}
                                    className="flex flex-col items-center flex-1 relative group cursor-pointer"
                                >
                                    <div
                                        className={`w-8 h-8 rounded-sm flex items-center justify-center text-xs font-semibold transition-colors border ${
                                            isDone
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                : isActive
                                                ? "bg-neutral-900 dark:bg-white text-white dark:text-black border-transparent shadow-xs"
                                                : "bg-neutral-100 dark:bg-geist-card text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-geist-hairline group-hover:text-neutral-700 dark:group-hover:text-neutral-300"
                                        }`}
                                    >
                                        {isDone ? (
                                            <Check className="w-4 h-4" />
                                        ) : (
                                            <Icon className="w-4 h-4" />
                                        )}
                                    </div>
                                    <span
                                        className={`text-[11px] mt-1.5 font-medium ${
                                            isActive
                                                ? "text-neutral-900 dark:text-white"
                                                : "text-neutral-400 dark:text-neutral-500"
                                        }`}
                                    >
                                        {s.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Step Body */}
                <div className="p-5 sm:p-6 overflow-y-auto flex-1">
                    {/* STEP 1: Sim Bridge Diagnostics */}
                    {currentStep === 1 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                                    SimConnect & FSUIPC7 Status
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
                                    Apollo Flight streams real-time flight and weather data via FSUIPC7.
                                </p>
                            </div>

                            <div
                                className={`p-4 rounded-sm border flex items-center justify-between ${
                                    currentTelemetry.simConnected
                                        ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300"
                                        : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300"
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-2.5 h-2.5 rounded-full ${
                                            currentTelemetry.simConnected
                                                ? "bg-emerald-500"
                                                : "bg-amber-500"
                                        }`}
                                    />
                                    <div>
                                        <div className="font-semibold text-xs sm:text-sm">
                                            {currentTelemetry.simConnected
                                                ? "Bridge Connected (Ready to Fly)"
                                                : "Waiting for FSUIPC7 / MSFS"}
                                        </div>
                                        <div className="text-xs opacity-80">
                                            {currentTelemetry.simConnected
                                                ? `Connected to ${
                                                      currentTelemetry.aircraftTitle ||
                                                      "Simulator"
                                                  }`
                                                : "Launch Microsoft Flight Simulator 2020/2024 with FSUIPC7"}
                                        </div>
                                    </div>
                                </div>
                                {currentTelemetry.simConnected && (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                )}
                            </div>

                            <div className="bg-neutral-50 dark:bg-geist-card/50 border border-neutral-200 dark:border-geist-hairline rounded-sm p-4 text-xs space-y-2 text-neutral-600 dark:text-neutral-400">
                                <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                                    <span>First Time Checklist</span>
                                </div>
                                <ul className="list-disc list-inside space-y-1 pl-1">
                                    <li>Ensure FSUIPC7 is installed (free edition works out-of-the-box).</li>
                                    <li>FSUIPC7 can be configured to auto-start when MSFS boots.</li>
                                    <li>Apollo Flight will automatically detect your flight once you taxi or start engines.</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Preferred Measurement Units */}
                    {currentStep === 2 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                                    Measurement Units & Preferences
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
                                    Configure your cockpit units. You can update these anytime in Settings.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[
                                    {
                                        title: "Aircraft Weight",
                                        value: weightUnit,
                                        onChange: (v: string) => setWeightUnit(v as WeightUnit),
                                        options: [
                                            { id: "kg", label: "Kilograms (kg)" },
                                            { id: "lbs", label: "Pounds (lbs)" },
                                        ],
                                    },
                                    {
                                        title: "Wind Speed",
                                        value: windSpeedUnit,
                                        onChange: (v: string) => setWindSpeedUnit(v as WindSpeedUnit),
                                        options: [
                                            { id: "kt", label: "Knots (kt)" },
                                            { id: "mps", label: "Meters / sec (m/s)" },
                                        ],
                                    },
                                    {
                                        title: "Altitude & Runways",
                                        value: lengthUnit,
                                        onChange: (v: string) => setLengthUnit(v as LengthUnit),
                                        options: [
                                            { id: "ft", label: "Feet (ft)" },
                                            { id: "m", label: "Meters (m)" },
                                        ],
                                    },
                                    {
                                        title: "Temperature",
                                        value: temperatureUnit,
                                        onChange: (v: string) => setTemperatureUnit(v as TemperatureUnit),
                                        options: [
                                            { id: "c", label: "Celsius (°C)" },
                                            { id: "f", label: "Fahrenheit (°F)" },
                                        ],
                                    },
                                    {
                                        title: "Atmospheric Visibility",
                                        value: visibilityUnit,
                                        onChange: (v: string) => setVisibilityUnit(v as VisibilityUnit),
                                        spanTwo: true,
                                        options: [
                                            { id: "sm", label: "Statute Miles (SM)" },
                                            { id: "metric", label: "Metric (m / km)" },
                                        ],
                                    },
                                ].map((group) => (
                                    <div
                                        key={group.title}
                                        className={`p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-card/50 space-y-2 ${
                                            group.spanTwo ? "sm:col-span-2" : ""
                                        }`}
                                    >
                                        <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                                            {group.title}
                                        </div>
                                        <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-[#181818] p-1 rounded-sm border border-neutral-200 dark:border-geist-hairline">
                                            {group.options.map((opt) => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => group.onChange(opt.id)}
                                                    className={`py-1 text-xs rounded-xs transition-colors ${
                                                        group.value === opt.id
                                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs font-semibold"
                                                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white font-medium"
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: OurAirports Database Hydration */}
                    {currentStep === 3 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                                    Global Aerodromes Database
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
                                    Apollo Flight includes offline search and nearest-aerodrome lookup for over 75,000 global runways.
                                </p>
                            </div>

                            <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-card/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                    <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                                        Indexed Airports
                                    </div>
                                    <div className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums tracking-tight">
                                        {airportsCount > 0
                                            ? airportsCount.toLocaleString()
                                            : "0"}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {airportsCount >= 1000 ? (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Dataset Ready</span>
                                        </div>
                                    ) : airportsCount > 0 ? (
                                        <>
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>Core Database Ready</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => syncOurAirports()}
                                                disabled={isSyncingAirports}
                                                className="px-3 py-1.5 rounded-xs bg-neutral-900 dark:bg-white text-white dark:text-black font-medium text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all shadow-xs"
                                            >
                                                <RefreshCw
                                                    className={`w-3.5 h-3.5 ${
                                                        isSyncingAirports ? "animate-spin" : ""
                                                    }`}
                                                />
                                                <span>{isSyncingAirports ? "Syncing..." : "Sync Full (Online)"}</span>
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => syncOurAirports()}
                                            disabled={isSyncingAirports}
                                            className="px-3.5 py-1.5 rounded-xs bg-neutral-900 dark:bg-white text-white dark:text-black font-medium text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all shadow-xs"
                                        >
                                            <RefreshCw
                                                className={`w-3.5 h-3.5 ${
                                                    isSyncingAirports ? "animate-spin" : ""
                                                }`}
                                            />
                                            <span>Sync Global Aerodromes</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isSyncingAirports && syncProgress && (
                                <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-card space-y-2">
                                    <div className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400">
                                        <span>{syncProgress.message}</span>
                                        <span className="font-semibold tabular-nums">
                                            {syncProgress.percent}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-neutral-100 dark:bg-geist-hairline h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="bg-neutral-900 dark:bg-white h-full transition-all duration-300"
                                            style={{ width: `${syncProgress.percent}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="p-4 rounded-sm bg-neutral-50 dark:bg-geist-card/50 border border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                                {airportsCount >= 1000 ? (
                                    <p>
                                        Over {airportsCount.toLocaleString()} worldwide aerodromes, unpaved strips, and runway dimensions are indexed locally. Zero cloud dependency during flights.
                                    </p>
                                ) : (
                                    <p>
                                        Core international hubs and runways are pre-bundled and active offline. If your simulator machine has internet access, you can sync the complete global directory of 75,000+ aerodromes now or anytime in Settings.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Routes & Dispatch */}
                    {currentStep === 4 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                                    Procedural Route Generator &amp; Saved Routes
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
                                    Plan realistic single-leg or multi-sector dispatches and manage your flight library.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-card/50 space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-white">
                                        <Route className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                                        <span>New Route Generator</span>
                                    </div>
                                    <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5 leading-relaxed">
                                        <li>• Generate 1–6 sectors using ICAO aircraft categories (Cat A–F) with realistic turnaround times.</li>
                                        <li>• Terrain-aware Minimum Safe Altitude (MSA) clamping and runway length/surface filtering.</li>
                                        <li>• Optional Navigraph AIRAC SID/STAR/airway routing and live map preview.</li>
                                    </ul>
                                </div>

                                <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-card/50 space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-white">
                                        <Bookmark className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                                        <span>Saved Routes &amp; Dispatch</span>
                                    </div>
                                    <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5 leading-relaxed">
                                        <li>• Filter dispatches by All, Favorites, Drafts, or Flown and edit individual sectors anytime.</li>
                                        <li>• Dispatch a saved route in one click when your aircraft is within 25 NM of the origin.</li>
                                        <li>• Syncs active flight plan legs directly to the EFB Companion.</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 rounded-sm bg-neutral-50 dark:bg-geist-card/50 border border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-400">
                                Multi-sector flights prompt you at intermediate stops so you can continue the next leg seamlessly.
                            </div>
                        </div>
                    )}

                    {/* STEP 5: Checklists & Documentation */}
                    {currentStep === 5 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                                    Aircraft Checklists &amp; Documentation
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
                                    Run hands-free SOP flows and keep your flight briefings and manuals indexed offline.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-card/50 space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-white">
                                        <ListChecks className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                                        <span>Checklists &amp; Voice Co-Pilot</span>
                                    </div>
                                    <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5 leading-relaxed">
                                        <li>• Normal, Emergency, and Abnormal checklists with automatic active-aircraft matching.</li>
                                        <li>• Create custom checklists or import/export JSON templates.</li>
                                        <li>• 100% offline voice control with Always-On or Push-to-Talk in Settings.</li>
                                    </ul>
                                </div>

                                <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-card/50 space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-white">
                                        <FileText className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                                        <span>Documentation &amp; Briefings</span>
                                    </div>
                                    <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5 leading-relaxed">
                                        <li>• Built-in Markdown and PDF viewer for SOPs, charts, and flight briefings.</li>
                                        <li>• Add custom local folders in Settings with live filesystem watching.</li>
                                        <li>• Rename titles inline and organize manuals with custom tags.</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 rounded-sm bg-neutral-50 dark:bg-geist-card/50 border border-neutral-200 dark:border-geist-hairline text-xs text-neutral-600 dark:text-neutral-400">
                                You can configure Push-to-Talk, test your microphone, or add custom doc folders anytime in Settings.
                            </div>
                        </div>
                    )}

                    {/* STEP 6: EFB Companion Pairing */}
                    {currentStep === 6 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                                    EFB Companion Cockpit (iPad / Tablet)
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-geist-muted mt-1">
                                    Open your live moving map and flight instruments on a tablet, phone, or second screen without installing an app.
                                </p>
                            </div>

                            <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-50/50 dark:bg-geist-card/50 flex flex-col sm:flex-row items-center gap-4">
                                <div>
                                    <QrCodeView value={efbUrl} size={110} />
                                </div>
                                <div className="space-y-2 text-center sm:text-left flex-1">
                                    <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                                        Scan with Tablet Camera or Open:
                                    </div>
                                    <a
                                        href={efbUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center sm:justify-start gap-1"
                                    >
                                        <span>{efbUrl}</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!efbStatus?.isRunning) {
                                                    setIsStartingServer(true);
                                                    try {
                                                        await startServer();
                                                    } finally {
                                                        setIsStartingServer(false);
                                                    }
                                                }
                                            }}
                                            disabled={efbStatus?.isRunning || isStartingServer}
                                            className={`px-3 py-1.5 rounded-xs text-xs font-medium border transition-colors ${
                                                efbStatus?.isRunning
                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                    : "bg-white dark:bg-geist-card text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-geist-cardHover"
                                            }`}
                                        >
                                            {efbStatus?.isRunning
                                                ? "Server Active"
                                                : isStartingServer
                                                ? "Starting..."
                                                : "Start EFB Server"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="text-xs text-neutral-500 dark:text-geist-muted space-y-1">
                                <p>• Tablet and PC must be on the same local Wi-Fi network.</p>
                                <p>• Real-time updates stream via lightweight local WebSockets.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/60 dark:bg-[#0c0c0c] flex items-center justify-between">
                    <div>
                        {currentStep > 1 && (
                            <button
                                type="button"
                                onClick={() => setCurrentStep((s) => s - 1)}
                                className="px-3.5 py-1.5 rounded-xs text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-geist-cardHover transition-colors flex items-center gap-1.5"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>Back</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {currentStep < totalSteps ? (
                            <button
                                type="button"
                                onClick={() => setCurrentStep((s) => s + 1)}
                                className="px-4 py-1.5 rounded-xs bg-neutral-900 dark:bg-white text-white dark:text-black text-xs font-medium hover:opacity-90 transition-all flex items-center gap-1.5 shadow-xs"
                            >
                                <span>Continue</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleFinish}
                                className="px-4 py-1.5 rounded-xs bg-neutral-900 dark:bg-white text-white dark:text-black text-xs font-medium hover:opacity-90 transition-all flex items-center gap-1.5 shadow-xs"
                            >
                                <span>Finish & Start Flying</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
