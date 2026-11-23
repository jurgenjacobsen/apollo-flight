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
    const totalSteps = 4;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#111111] border border-neutral-200 dark:border-[#222222] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-neutral-100 dark:border-[#222222] flex items-center justify-between bg-neutral-50/50 dark:bg-[#141414]">
                    <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-black">
                            <Plane className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-[#ededed]">
                                Welcome to Apollo Flight
                            </h2>
                            <p className="text-xs text-neutral-500 dark:text-[#888888]">
                                Step {currentStep} of {totalSteps} · Initial Setup
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleSkip}
                        className="text-xs font-medium text-neutral-400 hover:text-neutral-700 dark:hover:text-[#cccccc] transition-colors px-2.5 py-1 rounded-md"
                    >
                        Skip Tour
                    </button>
                </div>

                {/* Stepper Progress Indicator */}
                <div className="px-6 pt-4 pb-2">
                    <div className="flex items-center justify-between">
                        {[
                            { num: 1, label: "Sim Bridge", icon: Activity },
                            { num: 2, label: "Units", icon: Scale },
                            { num: 3, label: "Aerodromes", icon: Database },
                            { num: 4, label: "EFB Companion", icon: Tablet },
                        ].map((s) => {
                            const Icon = s.icon;
                            const isActive = currentStep === s.num;
                            const isDone = currentStep > s.num;

                            return (
                                <div
                                    key={s.num}
                                    className="flex flex-col items-center flex-1 relative"
                                >
                                    <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
                                            isDone
                                                ? "bg-emerald-500 text-white shadow-sm"
                                                : isActive
                                                ? "bg-neutral-900 dark:bg-white text-white dark:text-black shadow-md ring-4 ring-neutral-100 dark:ring-neutral-800"
                                                : "bg-neutral-100 dark:bg-[#1a1a1a] text-neutral-400 dark:text-[#666666]"
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
                                                ? "text-neutral-900 dark:text-[#ededed]"
                                                : "text-neutral-400 dark:text-[#666666]"
                                        }`}
                                    >
                                        {s.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Step Body */}
                <div className="p-6 overflow-y-auto flex-1">
                    {/* STEP 1: Sim Bridge Diagnostics */}
                    {currentStep === 1 && (
                        <div className="space-y-5 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900 dark:text-[#ededed]">
                                    SimConnect & FSUIPC7 Status
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-[#888888] mt-1">
                                    Apollo Flight streams real-time 50 Hz flight dynamics, engine states, and weather via FSUIPC7.
                                </p>
                            </div>

                            <div
                                className={`p-4 rounded-xl border flex items-center justify-between ${
                                    currentTelemetry.simConnected
                                        ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300"
                                        : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-300"
                                }`}
                            >
                                <div className="flex items-center space-x-3">
                                    <div
                                        className={`w-3 h-3 rounded-full animate-pulse ${
                                            currentTelemetry.simConnected
                                                ? "bg-emerald-500"
                                                : "bg-amber-500"
                                        }`}
                                    />
                                    <div>
                                        <div className="font-semibold text-sm">
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
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                )}
                            </div>

                            <div className="bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-[#222222] rounded-xl p-4 text-xs space-y-2 text-neutral-600 dark:text-[#999999]">
                                <div className="font-semibold text-neutral-900 dark:text-[#ededed] flex items-center space-x-1.5">
                                    <AlertCircle className="w-4 h-4 text-neutral-400" />
                                    <span>First Time Checklist:</span>
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
                        <div className="space-y-5 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900 dark:text-[#ededed]">
                                    Measurement Units & Preferences
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-[#888888] mt-1">
                                    Configure your cockpit units. You can update these anytime in Settings.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3.5">
                                {/* Weight Unit */}
                                <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] space-y-2">
                                    <div className="text-xs font-semibold text-neutral-700 dark:text-[#cccccc]">
                                        Aircraft Weight
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                                            <button
                                                key={u}
                                                onClick={() => setWeightUnit(u)}
                                                className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                    weightUnit === u
                                                        ? "bg-neutral-900 dark:bg-white text-white dark:text-black border-transparent shadow-sm"
                                                        : "bg-white dark:bg-[#1a1a1a] text-neutral-600 dark:text-[#888888] border-neutral-200 dark:border-[#2b2b2b]"
                                                }`}
                                            >
                                                {u.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Speed Unit */}
                                <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] space-y-2">
                                    <div className="text-xs font-semibold text-neutral-700 dark:text-[#cccccc]">
                                        Wind & Airspeed
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {(["kt", "mps"] as WindSpeedUnit[]).map((u) => (
                                            <button
                                                key={u}
                                                onClick={() => setWindSpeedUnit(u)}
                                                className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                    windSpeedUnit === u
                                                        ? "bg-neutral-900 dark:bg-white text-white dark:text-black border-transparent shadow-sm"
                                                        : "bg-white dark:bg-[#1a1a1a] text-neutral-600 dark:text-[#888888] border-neutral-200 dark:border-[#2b2b2b]"
                                                }`}
                                            >
                                                {u.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Altitude / Runway Length */}
                                <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] space-y-2">
                                    <div className="text-xs font-semibold text-neutral-700 dark:text-[#cccccc]">
                                        Altitude & Runways
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {(["ft", "m"] as LengthUnit[]).map((u) => (
                                            <button
                                                key={u}
                                                onClick={() => setLengthUnit(u)}
                                                className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                    lengthUnit === u
                                                        ? "bg-neutral-900 dark:bg-white text-white dark:text-black border-transparent shadow-sm"
                                                        : "bg-white dark:bg-[#1a1a1a] text-neutral-600 dark:text-[#888888] border-neutral-200 dark:border-[#2b2b2b]"
                                                }`}
                                            >
                                                {u === "ft" ? "Feet (ft)" : "Meters (m)"}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Temperature Unit */}
                                <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] space-y-2">
                                    <div className="text-xs font-semibold text-neutral-700 dark:text-[#cccccc]">
                                        Temperature
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {(["c", "f"] as TemperatureUnit[]).map((u) => (
                                            <button
                                                key={u}
                                                onClick={() => setTemperatureUnit(u)}
                                                className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                    temperatureUnit === u
                                                        ? "bg-neutral-900 dark:bg-white text-white dark:text-black border-transparent shadow-sm"
                                                        : "bg-white dark:bg-[#1a1a1a] text-neutral-600 dark:text-[#888888] border-neutral-200 dark:border-[#2b2b2b]"
                                                }`}
                                            >
                                                °{u.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: OurAirports Database Hydration */}
                    {currentStep === 3 && (
                        <div className="space-y-5 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900 dark:text-[#ededed]">
                                    Global Aerodromes Database
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-[#888888] mt-1">
                                    Apollo Flight includes offline search and nearest-aerodrome lookup for over 75,000 global runways.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl border border-neutral-200 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="text-xs font-medium text-neutral-500 dark:text-[#888888]">
                                        Indexed Airports
                                    </div>
                                    <div className="text-2xl font-bold text-neutral-900 dark:text-[#ededed] font-mono">
                                        {airportsCount > 0
                                            ? airportsCount.toLocaleString()
                                            : "0"}
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {airportsCount >= 1000 ? (
                                        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Global Dataset Ready</span>
                                        </div>
                                    ) : airportsCount > 0 ? (
                                        <div className="flex items-center space-x-2">
                                            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>Core Database Ready</span>
                                            </div>
                                            <button
                                                onClick={() => syncOurAirports()}
                                                disabled={isSyncingAirports}
                                                className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-black font-semibold text-xs flex items-center space-x-1.5 hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                                            >
                                                <RefreshCw
                                                    className={`w-3 h-3 ${
                                                        isSyncingAirports ? "animate-spin" : ""
                                                    }`}
                                                />
                                                <span>{isSyncingAirports ? "Syncing..." : "Sync Full (Online)"}</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => syncOurAirports()}
                                            disabled={isSyncingAirports}
                                            className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black font-semibold text-xs flex items-center space-x-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
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
                                <div className="p-4 rounded-xl border border-neutral-200 dark:border-[#222222] bg-white dark:bg-[#161616] space-y-2">
                                    <div className="flex justify-between text-xs text-neutral-600 dark:text-[#888888]">
                                        <span>{syncProgress.message}</span>
                                        <span className="font-mono font-semibold">
                                            {syncProgress.percent}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="bg-neutral-900 dark:bg-white h-full transition-all duration-300"
                                            style={{ width: `${syncProgress.percent}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-[#222222] text-xs text-neutral-600 dark:text-[#999999] space-y-1">
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

                    {/* STEP 4: EFB Companion Pairing */}
                    {currentStep === 4 && (
                        <div className="space-y-5 animate-in fade-in duration-200">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900 dark:text-[#ededed]">
                                    EFB Companion Cockpit (iPad / Tablet)
                                </h3>
                                <p className="text-xs text-neutral-500 dark:text-[#888888] mt-1">
                                    Open your live moving map and flight instruments on a tablet, phone, or second screen without installing an app.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl border border-neutral-200 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] flex flex-col sm:flex-row items-center gap-4">
                                <div className="bg-white p-2.5 rounded-xl border border-neutral-200 shadow-sm">
                                    <QrCodeView value={efbUrl} size={110} />
                                </div>
                                <div className="space-y-2 text-center sm:text-left flex-1">
                                    <div className="text-xs font-semibold text-neutral-800 dark:text-[#dddddd]">
                                        Scan with Tablet Camera or Open:
                                    </div>
                                    <a
                                        href={efbUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center sm:justify-start space-x-1"
                                    >
                                        <span>{efbUrl}</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <div className="flex items-center justify-center sm:justify-start space-x-2 pt-1">
                                        <button
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
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                efbStatus?.isRunning
                                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40"
                                                    : "bg-white dark:bg-[#222222] text-neutral-700 dark:text-[#cccccc] border-neutral-200 dark:border-[#333333] hover:bg-neutral-100"
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

                            <div className="text-xs text-neutral-500 dark:text-[#888888] space-y-1">
                                <p>• Tablet and PC must be on the same local Wi-Fi network.</p>
                                <p>• Real-time updates stream via lightweight local WebSockets.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 px-6 border-t border-neutral-100 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] flex items-center justify-between">
                    <div>
                        {currentStep > 1 && (
                            <button
                                onClick={() => setCurrentStep((s) => s - 1)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-[#aaaaaa] hover:bg-neutral-200/50 dark:hover:bg-[#222222] transition-colors flex items-center space-x-1.5"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>Back</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center space-x-3">
                        {currentStep < totalSteps ? (
                            <button
                                onClick={() => setCurrentStep((s) => s + 1)}
                                className="px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black text-xs font-semibold hover:opacity-90 transition-all flex items-center space-x-1.5 shadow-sm"
                            >
                                <span>Continue</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleFinish}
                                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all flex items-center space-x-1.5 shadow-md shadow-emerald-600/20"
                            >
                                <Sparkles className="w-4 h-4" />
                                <span>Finish & Start Flying</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
