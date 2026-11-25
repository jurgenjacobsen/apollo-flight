import { useState, useEffect, useRef, useCallback } from "react";
import { safeInvoke } from "../store/flightStore";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
    buildMicConstraints,
    createSpeechAudioContext,
    downsampleTo16kPCM,
} from "../utils/speechUtils";

export interface SpeechModelStatus {
    isInstalled: boolean;
    modelPath: string;
    isDownloading: boolean;
    downloadProgress: number;
    error?: string;
}

export interface UseVoskSpeechOptions {
    inputDeviceId?: string;
    onResult?: (text: string, isFinal: boolean) => void;
}

export function useVoskSpeech(options?: UseVoskSpeechOptions) {
    const [modelStatus, setModelStatus] = useState<SpeechModelStatus | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isListening, setIsListening] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const isFeedingRef = useRef(false);

    // Refresh model status on mount
    const checkModelStatus = useCallback(async () => {
        try {
            const status = await safeInvoke<SpeechModelStatus>("get_speech_model_status");
            if (status) {
                setModelStatus(status);
                setIsDownloading(status.isDownloading);
            }
            return status;
        } catch (err: any) {
            console.warn("[useVoskSpeech] Failed to get model status:", err);
            return null;
        }
    }, []);

    useEffect(() => {
        checkModelStatus();
    }, [checkModelStatus]);

    // Listen to download progress events
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<number>("speech-model-download-progress", (event) => {
            setIsDownloading(true);
            setDownloadProgress(Math.round(event.payload * 100));
        }).then((u) => {
            unlisten = u;
        });

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    // Trigger one-click model download
    const downloadModel = useCallback(async () => {
        try {
            setError(null);
            setIsDownloading(true);
            setDownloadProgress(0);
            const status = await safeInvoke<SpeechModelStatus>("download_speech_model");
            if (status) {
                setModelStatus(status);
                setIsDownloading(false);
                setDownloadProgress(100);
            }
        } catch (err: any) {
            console.error("[useVoskSpeech] Model download failed:", err);
            setError(err?.message || String(err));
            setIsDownloading(false);
        }
    }, []);

    // Stop listening session
    const stopListening = useCallback(async () => {
        setIsListening(false);
        setAudioLevel(0);

        if (processorRef.current) {
            try {
                processorRef.current.disconnect();
            } catch {}
            processorRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }

        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            try {
                await audioContextRef.current.close();
            } catch {}
            audioContextRef.current = null;
        }

        try {
            const finalRes = await safeInvoke<any>("stop_speech_session");
            if (finalRes?.text && optionsRef.current?.onResult) {
                optionsRef.current.onResult(finalRes.text, true);
            }
        } catch {}
    }, []);

    // Start listening session
    const startListening = useCallback(
        async (grammar: string[] = []) => {
            setError(null);

            // 1. Ensure model is installed
            const status = await checkModelStatus();
            if (!status?.isInstalled) {
                setError("Vosk speech model is not installed. Please download the offline model first.");
                return false;
            }

            // 2. Start session in Rust backend
            try {
                const res = await safeInvoke<boolean>("start_speech_session", { grammar });
                if (res !== true) {
                    setError("Failed to initialize Vosk speech engine in backend.");
                    return false;
                }
            } catch (err: any) {
                console.error("[useVoskSpeech] start_speech_session threw:", err);
                setError(`Failed to start speech session: ${err?.message || err}`);
                return false;
            }

            // 3. Capture audio from selected device
            try {
                const constraints = buildMicConstraints(optionsRef.current?.inputDeviceId);

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                mediaStreamRef.current = stream;

                const audioCtx = createSpeechAudioContext();
                audioContextRef.current = audioCtx;

                const source = audioCtx.createMediaStreamSource(stream);
                const processor = audioCtx.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                const muteGain = audioCtx.createGain();
                muteGain.gain.value = 0;
                source.connect(processor);
                processor.connect(muteGain);
                muteGain.connect(audioCtx.destination);

                const pendingQueue: number[][] = [];

                const processQueue = () => {
                    if (isFeedingRef.current || pendingQueue.length === 0) return;
                    const batch = pendingQueue.shift()!;
                    isFeedingRef.current = true;

                    safeInvoke<any>("feed_speech_audio", { samples: batch })
                        .then((res) => {
                            isFeedingRef.current = false;
                            if (res?.text && optionsRef.current?.onResult) {
                                optionsRef.current.onResult(res.text, res.isFinal);
                            }
                            processQueue();
                        })
                        .catch(() => {
                            isFeedingRef.current = false;
                            processQueue();
                        });
                };

                processor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);

                    // Compute RMS volume
                    let sum = 0;
                    for (let i = 0; i < inputData.length; i++) {
                        sum += inputData[i] * inputData[i];
                    }
                    const rms = Math.sqrt(sum / inputData.length);
                    const level = Math.min(100, Math.round(rms * 100 * 3.8));
                    setAudioLevel(level);

                    const pcm16 = downsampleTo16kPCM(inputData, audioCtx.sampleRate);
                    pendingQueue.push(pcm16);
                    processQueue();
                };

                setIsListening(true);
                return true;
            } catch (err: any) {
                console.error("[useVoskSpeech] Failed to start microphone audio stream:", err);
                setError(err?.message || "Failed to access microphone.");
                await stopListening();
                return false;
            }
        },
        [checkModelStatus, stopListening],
    );

    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    return {
        modelStatus,
        isDownloading,
        downloadProgress,
        isListening,
        audioLevel,
        error,
        checkModelStatus,
        downloadModel,
        startListening,
        stopListening,
    };
}
