import React, { useState, useEffect, useRef } from "react";
import { useFlightStore } from "../../../store/flightStore";
import { useVoskSpeech } from "../../../hooks/useVoskSpeech";
import { formatKeyCodeLabel } from "../../../utils/speechUtils";
import { Select } from "../../ui/Select";
import {
    Mic,
    MicOff,
    CheckCircle2,
    AlertCircle,
    Volume2,
    Radio,
    Sparkles,
    Check,
    RotateCcw,
    Headphones,
    MessageSquare,
    Trash2,
} from "lucide-react";

interface ChecklistsSettingsTabProps {
    notifySaved: () => void;
}

interface TestItem {
    id: string;
    challenge: string;
    response: string;
    acceptedResponses: string[];
    completed: boolean;
}

interface TranscriptEntry {
    id: string;
    timestamp: string;
    text: string;
    isFinal: boolean;
    matchedItem?: string;
}

const INITIAL_TEST_ITEMS: TestItem[] = [
    {
        id: "test-1",
        challenge: "Radio Check",
        response: "Loud and Clear",
        acceptedResponses: ["loud and clear", "read you five", "checked", "ok", "five by five", "clear"],
        completed: false,
    },
    {
        id: "test-2",
        challenge: "Altimeters",
        response: "Set",
        acceptedResponses: ["set", "checked", "set and crosschecked", "standard"],
        completed: false,
    },
    {
        id: "test-3",
        challenge: "Flaps",
        response: "Takeoff",
        acceptedResponses: ["takeoff", "set", "flaps takeoff", "flaps set", "checked"],
        completed: false,
    },
];

export const ChecklistsSettingsTab: React.FC<ChecklistsSettingsTabProps> = ({
    notifySaved,
}) => {
    const {
        voiceCopilotMicGranted,
        setVoiceCopilotMicGranted,
        voiceCopilotInputDeviceId,
        setVoiceCopilotInputDeviceId,
        voiceCopilotOutputDeviceId,
        setVoiceCopilotOutputDeviceId,
        voiceCopilotMicMode,
        setVoiceCopilotMicMode,
        voiceCopilotPttKey,
        setVoiceCopilotPttKey,
    } = useFlightStore();

    const [isCapturingPttKey, setIsCapturingPttKey] = useState(false);

    useEffect(() => {
        if (!isCapturingPttKey) return;
        const onKeyDown = async (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.code !== "Escape") {
                await setVoiceCopilotPttKey(e.code);
                notifySaved();
            }
            setIsCapturingPttKey(false);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [isCapturingPttKey, notifySaved, setVoiceCopilotPttKey]);

    // Device enumeration
    const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);

    // Test Checklist State
    const [testItems, setTestItems] = useState<TestItem[]>(INITIAL_TEST_ITEMS);
    const [activeTestIndex, setActiveTestIndex] = useState<number>(0);
    const [testError, setTestError] = useState<string | null>(null);
    const [testStatusMessage, setTestStatusMessage] = useState<string | null>(null);

    // Live Speech Transcript Log
    const [transcriptLog, setTranscriptLog] = useState<TranscriptEntry[]>([]);
    const [interimText, setInterimText] = useState<string>("");

    const handleVoskResult = (text: string, isFinal: boolean) => {
        const transcript = text.trim();
        if (!transcript) return;

        if (isFinal) {
            setInterimText("");
            const cleanLower = transcript.toLowerCase();
            let matchedChallenge: string | undefined;

            setTestItems((prevItems) => {
                const curIdx = prevItems.findIndex((it) => !it.completed);
                if (curIdx === -1) return prevItems;

                const curItem = prevItems[curIdx];
                const isMatch = curItem.acceptedResponses.some(
                    (r) => cleanLower.includes(r.toLowerCase()) || r.toLowerCase().includes(cleanLower),
                );

                if (isMatch) {
                    matchedChallenge = curItem.challenge;
                    playCockpitChime();
                    const updated = prevItems.map((it, idx) =>
                        idx === curIdx ? { ...it, completed: true } : it,
                    );

                    const nextIdx = curIdx + 1;
                    setActiveTestIndex(nextIdx);

                    if (nextIdx >= prevItems.length) {
                        setTestStatusMessage(
                            "Voice test complete! All items recognized successfully.",
                        );
                    } else {
                        setTestStatusMessage(
                            `Item ${nextIdx}/${prevItems.length} verified. Say: "${prevItems[nextIdx].response}"`,
                        );
                    }
                    return updated;
                }
                return prevItems;
            });

            const entry: TranscriptEntry = {
                id: `${Date.now()}-${Math.random()}`,
                timestamp: new Date().toLocaleTimeString(),
                text: transcript,
                isFinal: true,
                matchedItem: matchedChallenge,
            };
            setTranscriptLog((prev) => [entry, ...prev.slice(0, 49)]);
        } else {
            setInterimText(transcript);
        }
    };

    const vosk = useVoskSpeech({
        inputDeviceId: voiceCopilotInputDeviceId,
        onResult: handleVoskResult,
    });

    const isTesting = vosk.isListening;
    const audioLevel = vosk.audioLevel;

    // Play test cockpit chime
    const playCockpitChime = async () => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (
                voiceCopilotOutputDeviceId &&
                typeof (ctx as any).setSinkId === "function"
            ) {
                await (ctx as any).setSinkId(voiceCopilotOutputDeviceId);
            }

            const now = ctx.currentTime;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc1.type = "sine";
            osc1.frequency.setValueAtTime(880, now);
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(1760, now + 0.1);

            gainNode.gain.setValueAtTime(0.12, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc1.start(now);
            osc1.stop(now + 0.12);
            osc2.start(now + 0.1);
            osc2.stop(now + 0.35);
        } catch (err) {
            console.warn("[ChecklistsSettingsTab] Failed to play chime:", err);
        }
    };

    // Enumerate devices
    const refreshDevices = async () => {
        try {
            if (!navigator.mediaDevices?.enumerateDevices) return;
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter((d) => d.kind === "audioinput");
            const outputs = devices.filter((d) => d.kind === "audiooutput");
            setAudioInputDevices(inputs);
            setAudioOutputDevices(outputs);
        } catch (err) {
            console.warn("[ChecklistsSettingsTab] Error enumerating devices:", err);
        }
    };

    useEffect(() => {
        refreshDevices();
        navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
        return () => {
            navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
        };
    }, []);

    const handleGrantPermission = async () => {
        try {
            setTestError(null);
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: voiceCopilotInputDeviceId
                        ? { deviceId: { exact: voiceCopilotInputDeviceId } }
                        : true,
                });
                stream.getTracks().forEach((track) => track.stop());
            }
            await setVoiceCopilotMicGranted(true);
            await refreshDevices();
            notifySaved();
        } catch (err: any) {
            console.warn("[ChecklistsSettingsTab] Mic permission failed:", err);
            setTestError(
                err?.message ||
                    "Could not access microphone. Please check your Windows microphone privacy settings.",
            );
        }
    };

    const handleRevokePermission = async () => {
        stopMicrophoneTest();
        await setVoiceCopilotMicGranted(false);
        setTestStatusMessage(null);
        notifySaved();
    };

    // Stop microphone test
    const stopMicrophoneTest = () => {
        vosk.stopListening();
        setInterimText("");
    };

    useEffect(() => {
        return () => {
            stopMicrophoneTest();
        };
    }, []);

    // Start Audio Meter & Speech Recognition for the test checklist via local Vosk engine
    const startMicrophoneTest = async () => {
        setTestError(null);
        setTestStatusMessage(null);
        setInterimText("");

        // Reset items
        const freshItems = INITIAL_TEST_ITEMS.map((item) => ({ ...item, completed: false }));
        setTestItems(freshItems);
        setActiveTestIndex(0);

        // Start offline Vosk engine in open-vocabulary mode for diagnostic testing
        const started = await vosk.startListening([]);
        if (!started) {
            setTestError(vosk.error || "Failed to start offline Vosk speech recognition.");
        }
    };

    const handleClearLog = () => {
        setTranscriptLog([]);
        setInterimText("");
    };

    const handleResetTest = () => {
        stopMicrophoneTest();
        setTestItems(INITIAL_TEST_ITEMS.map((item) => ({ ...item, completed: false })));
        setActiveTestIndex(0);
        setTestStatusMessage(null);
        setTestError(null);
    };

    return (
        <div className="space-y-6">
            {/* Primary Microphone Authorization Card */}
            <div className="p-5 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                                    Microphone Authorization
                                </h3>
                                {
                                    !voiceCopilotMicGranted && 
                                    <span
                                        className="px-2 py-0.5 rounded text-[11px] font-medium border bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
                                    >
                                        Configuration Required
                                    </span>
                                }
                            </div>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted max-w-xl leading-relaxed">
                                Apollo Flight utilizes your microphone to make use of the voice recognition feature for checklists & co-pilot interactions.
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                        {voiceCopilotMicGranted ? (
                            <button
                                type="button"
                                onClick={handleRevokePermission}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-sm border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer select-none"
                            >
                                Revoke Permission
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleGrantPermission}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 shadow-xs select-none"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Grant Microphone Permission</span>
                            </button>
                        )}
                    </div>
                </div>

                {testError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{testError}</span>
                    </div>
                )}
            </div>

            {/* Audio Hardware Device Selection */}
            <div className="p-5 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-xs space-y-4">
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                        Audio Devices Configuration
                    </h4>
                    <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                        Select specific input and output hardware devices for voice checklists and cockpit audio chimes.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Input Device */}
                    <div className="space-y-1.5 min-w-0">
                        <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                            <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Microphone Input Device</span>
                        </label>
                        <Select
                            className="w-full"
                            value={voiceCopilotInputDeviceId}
                            onChange={(val) => {
                                setVoiceCopilotInputDeviceId(val);
                                notifySaved();
                            }}
                            ariaLabel="Microphone Input Device"
                            options={[
                                { value: "", label: "Default System Microphone" },
                                ...audioInputDevices
                                    .filter((device) => Boolean(device.deviceId))
                                    .map((device, idx) => ({
                                        value: device.deviceId,
                                        label: device.label || `Microphone ${idx + 1}`,
                                    })),
                            ]}
                        />
                    </div>

                    {/* Output Device */}
                    <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                                <Headphones className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Audio Playback Device (Chimes / TTS)</span>
                            </label>
                            <button
                                type="button"
                                onClick={playCockpitChime}
                                className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                            >
                                <Volume2 className="w-3 h-3" />
                                <span>Play Test Tone</span>
                            </button>
                        </div>
                        <Select
                        className="w-full"
                        value={voiceCopilotOutputDeviceId}
                        onChange={(val) => {
                            setVoiceCopilotOutputDeviceId(val);
                            notifySaved();
                        }}
                        ariaLabel="Audio Playback Device"
                        options={[
                            { value: "", label: "Default System Output" },
                            ...audioOutputDevices
                                .filter((device) => Boolean(device.deviceId))
                                .map((device, idx) => ({
                                    value: device.deviceId,
                                    label: device.label || `Output Device ${idx + 1}`,
                                })),
                        ]}
                    />
                    </div>
                </div>

                {/* Microphone Activation Mode & PTT Key */}
                <div className="pt-4 border-t border-neutral-200 dark:border-geist-hairline grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                            <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Microphone Activation Mode</span>
                        </label>
                        <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                            <button
                                type="button"
                                onClick={async () => {
                                    await setVoiceCopilotMicMode("always_on");
                                    notifySaved();
                                }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors cursor-pointer ${
                                    voiceCopilotMicMode === "always_on"
                                        ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                }`}
                            >
                                Always On
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    await setVoiceCopilotMicMode("ptt");
                                    notifySaved();
                                }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-xs transition-colors cursor-pointer ${
                                    voiceCopilotMicMode === "ptt"
                                        ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                }`}
                            >
                                Push-to-Talk (PTT)
                            </button>
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-geist-muted">
                            Use Always On for hands-free listening, or PTT to transmit only while holding a key.
                        </p>
                    </div>

                    {voiceCopilotMicMode === "ptt" && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                Push-to-Talk Key
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCapturingPttKey(true)}
                                    className={`px-3 py-2 text-xs font-mono font-semibold rounded-sm border transition-colors cursor-pointer min-w-[140px] text-left ${
                                        isCapturingPttKey
                                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 animate-pulse"
                                            : "border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-card text-neutral-800 dark:text-neutral-200 hover:border-neutral-400"
                                    }`}
                                >
                                    {isCapturingPttKey
                                        ? "Press any key..."
                                        : formatKeyCodeLabel(voiceCopilotPttKey)}
                                </button>
                                <span className="text-[11px] text-neutral-500 dark:text-geist-muted">
                                    Click to bind (Esc to cancel)
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Microphone Diagnostic & Live Test Checklist Card */}
            <div className="p-5 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                            Microphone Diagnostics & Interactive Test
                        </h4>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Speak aloud into your microphone to verify speech volume and inspect what the engine hears in real time.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {isTesting ? (
                            <button
                                type="button"
                                onClick={stopMicrophoneTest}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-sm border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer select-none"
                            >
                                Stop Test
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={startMicrophoneTest}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-sm border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center gap-1.5 cursor-pointer select-none"
                            >
                                <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Start Voice Test</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleResetTest}
                            title="Reset Test Checklist"
                            className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 rounded border border-neutral-200 dark:border-neutral-700 cursor-pointer"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Real-time Voice Volume VU Meter */}
                <div className="p-3.5 bg-neutral-50 dark:bg-[#111111] border border-neutral-200/80 dark:border-geist-hairline rounded-sm space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        <span className="flex items-center gap-1.5">
                            <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Voice Input Volume Level</span>
                        </span>
                        <span className="text-[11px] tabular-nums">{isTesting ? `${audioLevel}%` : "Idle"}</span>
                    </div>
                    {/* Volume Bar */}
                    <div className="w-full h-3 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden p-0.5">
                        <div
                            className={`h-full rounded-full transition-all duration-75 ${
                                audioLevel > 75
                                    ? "bg-red-500"
                                    : audioLevel > 40
                                      ? "bg-emerald-500"
                                      : "bg-emerald-400"
                            }`}
                            style={{ width: `${isTesting ? audioLevel : 0}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                        <span>0%</span>
                        <span>Normal Speech Range</span>
                        <span>100%</span>
                    </div>
                </div>

                {/* Interactive Test Checklist Card */}
                <div className="p-4 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-neutral-100 dark:border-geist-hairline pb-2">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                                Interactive Test Checklist — System Audio Check
                            </span>
                        </div>
                        <span className="text-[11px] text-neutral-500 dark:text-geist-muted tabular-nums">
                            {testItems.filter((i) => i.completed).length} / {testItems.length} Verified
                        </span>
                    </div>

                    <div className="space-y-2">
                        {testItems.map((item, idx) => {
                            const isCurrent = isTesting && idx === activeTestIndex;
                            return (
                                <div
                                    key={item.id}
                                    className={`p-2.5 rounded-sm border transition-all flex items-center justify-between text-xs ${
                                        item.completed
                                            ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 opacity-80"
                                            : isCurrent
                                              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 shadow-xs ring-1 ring-emerald-500/30"
                                              : "bg-neutral-50/50 dark:bg-neutral-900/40 border-neutral-200 dark:border-neutral-800"
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`w-5 h-5 rounded-sm flex items-center justify-center border text-[10px] font-bold ${
                                                item.completed
                                                    ? "bg-emerald-600 border-emerald-600 text-white"
                                                    : isCurrent
                                                      ? "border-emerald-500 text-emerald-600 animate-pulse tabular-nums"
                                                      : "border-neutral-300 dark:border-neutral-700 text-neutral-400"
                                            }`}
                                        >
                                            {item.completed ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                                                {item.challenge}
                                            </span>
                                            {isCurrent && (
                                                <span className="ml-2 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider animate-pulse">
                                                    [Speak Expected Response]
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                            Expected:
                                        </span>
                                        <span
                                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                                item.completed
                                                    ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200"
                                                    : isCurrent
                                                      ? "bg-white dark:bg-black border border-emerald-400 text-emerald-700 dark:text-emerald-300 shadow-xs"
                                                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                                            }`}
                                        >
                                            {item.response}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {testStatusMessage && (
                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{testStatusMessage}</span>
                        </div>
                    )}
                </div>

                {/* Real-time Voice Engine Transcript Log Feed */}
                <div className="p-4 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-neutral-100 dark:border-geist-hairline pb-2">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                                Live Voice Engine Transcript
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] tabular-nums bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                {transcriptLog.length} events
                            </span>
                        </div>

                        {transcriptLog.length > 0 && (
                            <button
                                type="button"
                                onClick={handleClearLog}
                                className="text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
                            >
                                <Trash2 className="w-3 h-3" />
                                <span>Clear Transcript</span>
                            </button>
                        )}
                    </div>

                    {/* Live Interim / In-Progress Speech Banner */}
                    {isTesting && (
                        <div className="p-2.5 bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800 rounded text-xs flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                            <span className="text-neutral-500 dark:text-neutral-400 shrink-0">Live Mic Audio:</span>
                            <span className="text-neutral-900 dark:text-white font-medium truncate">
                                {interimText ? `"${interimText}"` : "Listening... Speak into your microphone"}
                            </span>
                        </div>
                    )}

                    {/* Scrollable Transcript Feed */}
                    <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs pr-1">
                        {transcriptLog.length === 0 ? (
                            <div className="py-4 text-center text-neutral-400 dark:text-neutral-500 text-[11px]">
                                {isTesting
                                    ? "Awaiting speech input... Say 'Radio Check', 'Loud and clear', or anything into your microphone."
                                    : "Click 'Start Voice Test' above to begin speaking."}
                            </div>
                        ) : (
                            transcriptLog.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={`p-2 rounded border flex items-center justify-between gap-3 text-[11px] ${
                                        entry.matchedItem
                                            ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50"
                                            : "bg-neutral-50/60 dark:bg-neutral-900/50 border-neutral-200/80 dark:border-neutral-800"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-neutral-400 shrink-0 text-[10px]">
                                            [{entry.timestamp}]
                                        </span>
                                        <span className="text-neutral-800 dark:text-neutral-200 font-semibold truncate">
                                            "{entry.text}"
                                        </span>
                                    </div>

                                    {entry.matchedItem && (
                                        <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                                            <span>Matched: {entry.matchedItem}</span>
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Pilot Voice Phraseology Reference Card */}
            <div className="p-5 bg-neutral-50/70 dark:bg-[#0f0f0f] border border-neutral-200/80 dark:border-geist-hairline rounded-sm space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Recognized Voice Callouts Reference</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-white dark:bg-geist-surface rounded-sm border border-neutral-200 dark:border-geist-hairline">
                        <span className="font-semibold text-neutral-900 dark:text-white block mb-1">
                            Section Callouts
                        </span>
                        <p className="text-neutral-500 dark:text-geist-muted text-[11px] leading-relaxed">
                            "Before Takeoff", "Taxi", "After Landing", "Approach Checklist"
                        </p>
                    </div>

                    <div className="p-3 bg-white dark:bg-geist-surface rounded-sm border border-neutral-200 dark:border-geist-hairline">
                        <span className="font-semibold text-neutral-900 dark:text-white block mb-1">
                            Standard Responses
                        </span>
                        <p className="text-neutral-500 dark:text-geist-muted text-[11px] leading-relaxed">
                            "Set", "Checked", "Down and 3 Green", "Takeoff", "Armed"
                        </p>
                    </div>

                    <div className="p-3 bg-white dark:bg-geist-surface rounded-sm border border-neutral-200 dark:border-geist-hairline">
                        <span className="font-semibold text-neutral-900 dark:text-white block mb-1">
                            Navigation Commands
                        </span>
                        <p className="text-neutral-500 dark:text-geist-muted text-[11px] leading-relaxed">
                            "Say Again" / "Repeat", "Skip Item", "Hold" / "Pause"
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
