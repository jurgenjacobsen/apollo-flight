import { useState, useEffect, useRef, useCallback } from "react";
import { Checklist, ChecklistItem } from "../types/checklist";
import { useFlightStore, safeInvoke } from "../store/flightStore";
import {
    buildChecklistGrammar,
    buildMicConstraints,
    createSpeechAudioContext,
    downsampleTo16kPCM,
    formatChallengeForSpeech,
    formatItemHelpSpeech,
    matchSectionActivation,
    normalizeVoiceText,
    parseChecklistVoiceCommand,
    verifyChecklistResponse,
} from "../utils/speechUtils";

interface UseChecklistVoiceCopilotProps {
    checklist: Checklist | null;
    onItemCompleted: (sectionId: string, itemId: string) => void;
    onSetItemChecked?: (sectionId: string, itemId: string, checked: boolean) => void;
    onSectionCompleted?: (sectionId: string) => void;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function createOutputAudioContext(): Promise<AudioContext | null> {
    const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    const ctx = new AudioContextClass();
    const outputDeviceId = useFlightStore.getState().voiceCopilotOutputDeviceId;
    if (outputDeviceId && typeof (ctx as any).setSinkId === "function") {
        await (ctx as any).setSinkId(outputDeviceId);
    }
    return ctx;
}

// Synthesize pleasant cockpit audio chime using Web Audio API (zero audio file dependencies)
async function playCockpitChime() {
    try {
        const ctx = await createOutputAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08); // A6
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch {
        // Fallback or audio not allowed without user gesture
    }
}

// Distinct ascending (on) / descending (off) two-tone chime for Voice Co-Pilot state changes
async function playCopilotToggleChime(mode: "on" | "off") {
    try {
        const ctx = await createOutputAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        osc.type = "sine";
        if (mode === "on") {
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(880, now + 0.09); // A5
        } else {
            osc.frequency.setValueAtTime(783.99, now); // G5
            osc.frequency.setValueAtTime(523.25, now + 0.09); // C5
        }

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.14, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    } catch {
        // Fallback or audio not allowed without user gesture
    }
}

export function useChecklistVoiceCopilot({
    checklist,
    onItemCompleted,
    onSetItemChecked,
    onSectionCompleted,
}: UseChecklistVoiceCopilotProps) {
    const micMode = useFlightStore((s) => s.voiceCopilotMicMode);
    const pttKey = useFlightStore((s) => s.voiceCopilotPttKey);

    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isPttActive, setIsPttActive] = useState(false);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const [currentChallenge, setCurrentChallenge] = useState<string | null>(null);
    const [lastHeard, setLastHeard] = useState<string | null>(null);
    const [lastMatched, setLastMatched] = useState<boolean>(false);
    const [isSupported] = useState(true);
    const [audioLevel, setAudioLevel] = useState<number>(0);

    const isSpeakingRef = useRef(false);
    const isListeningRef = useRef(false);
    const isPausedRef = useRef(false);
    const isPttPressedRef = useRef(false);
    const micModeRef = useRef(micMode);
    const pttKeyRef = useRef(pttKey);
    const activeSectionIdRef = useRef<string | null>(null);
    const activeItemIdRef = useRef<string | null>(null);
    const lastActiveSectionIdRef = useRef<string | null>(null);
    const currentChallengeRef = useRef<string | null>(null);
    const checklistRef = useRef<Checklist | null>(checklist);
    const onItemCompletedRef = useRef(onItemCompleted);
    const onSetItemCheckedRef = useRef(onSetItemChecked);
    const onSectionCompletedRef = useRef(onSectionCompleted);
    const handleSpokenTextRef = useRef<(raw: string, isFinal: boolean) => void>(() => {});
    const lastCommandAtRef = useRef<number>(0);
    const lastCompletedItemKeyRef = useRef<string | null>(null);
    const pendingQueueRef = useRef<number[][]>([]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const isFeedingRef = useRef(false);

    micModeRef.current = micMode;
    pttKeyRef.current = pttKey;
    activeSectionIdRef.current = activeSectionId;
    activeItemIdRef.current = activeItemId;
    currentChallengeRef.current = currentChallenge;
    checklistRef.current = checklist;
    onItemCompletedRef.current = onItemCompleted;
    onSetItemCheckedRef.current = onSetItemChecked;
    onSectionCompletedRef.current = onSectionCompleted;
    isListeningRef.current = isListening;
    isPausedRef.current = isPaused;

    // Text to Speech speaker (System Web Speech synthesis)
    const speak = useCallback((text: string): Promise<void> => {
        const naturalText = formatChallengeForSpeech(text);
        return new Promise((resolve) => {
            if (
                !naturalText ||
                typeof window === "undefined" ||
                !("speechSynthesis" in window)
            ) {
                return resolve();
            }

            // Set synchronously so partial/queued mic frames cannot trigger during TTS setup
            isSpeakingRef.current = true;
            pendingQueueRef.current = [];
            setIsSpeaking(true);

            const startUtterance = () => {
                const utterance = new SpeechSynthesisUtterance(naturalText);
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.lang = "en-US";

                const finish = () => {
                    isSpeakingRef.current = false;
                    setIsSpeaking(false);
                    resolve();
                };

                utterance.onend = finish;
                utterance.onerror = finish;

                window.speechSynthesis.speak(utterance);
            };

            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                window.speechSynthesis.cancel();
                setTimeout(startUtterance, 50);
            } else {
                startUtterance();
            }
        });
    }, []);

    const formatSectionSopName = (title: string) => {
        const trimmed = title.trim();
        return /checklist$/i.test(trimmed) ? trimmed : `${trimmed} checklist`;
    };

    // Step to next item or complete section (searches forward from afterItemId so skipped items are not revisited)
    const stepNextItem = useCallback(
        async (
            targetSectionId: string,
            specificItemId?: string,
            afterItemId?: string,
        ) => {
            const currentChk = checklistRef.current;
            if (!currentChk) return;

            const section = currentChk.sections.find(
                (s) => s.id === targetSectionId,
            );
            if (!section) return;

            let nextItem: ChecklistItem | undefined;
            if (specificItemId) {
                nextItem = section.items.find((i) => i.id === specificItemId);
            } else if (afterItemId) {
                const afterIdx = section.items.findIndex((i) => i.id === afterItemId);
                const searchSlice =
                    afterIdx !== -1 ? section.items.slice(afterIdx + 1) : section.items;
                nextItem = searchSlice.find((i) => !i.checked);
            } else {
                nextItem = section.items.find((i) => !i.checked);
            }

            if (!nextItem) {
                setCurrentChallenge(null);
                currentChallengeRef.current = null;
                setActiveItemId(null);
                activeItemIdRef.current = null;
                setActiveSectionId(null);
                activeSectionIdRef.current = null;
                setIsPaused(false);
                isPausedRef.current = false;
                const skippedItems = section.items.filter((i) => !i.checked);
                const sopName = formatSectionSopName(section.title);
                if (skippedItems.length > 0) {
                    const challenges = skippedItems.map((i) => i.challenge);
                    const skippedList =
                        challenges.length === 1
                            ? challenges[0]
                            : `${challenges.slice(0, -1).join(", ")} and ${challenges[challenges.length - 1]}`;
                    await speak(`${sopName} completed, except for ${skippedList}.`);
                } else {
                    await speak(`${sopName} completed.`);
                }
                onSectionCompletedRef.current?.(section.id);
                return;
            }

            lastCompletedItemKeyRef.current = null;
            lastActiveSectionIdRef.current = section.id;
            setActiveSectionId(section.id);
            activeSectionIdRef.current = section.id;
            setActiveItemId(nextItem.id);
            activeItemIdRef.current = nextItem.id;
            setCurrentChallenge(nextItem.challenge);
            currentChallengeRef.current = nextItem.challenge;
            await speak(nextItem.challenge);
        },
        [speak, onSectionCompleted],
    );

    // Repeat current challenge (debounced by synchronous isSpeakingRef)
    const repeatCurrentChallenge = useCallback(() => {
        const challenge = currentChallengeRef.current;
        if (challenge && !isSpeakingRef.current) {
            speak(challenge);
        }
    }, [speak]);

    // Tell the user what response is expected for the current item
    const announceCurrentItemHelp = useCallback(async () => {
        const currentChk = checklistRef.current;
        const currentSecId = activeSectionIdRef.current;
        const currentItId = activeItemIdRef.current;
        if (!currentChk || !currentSecId || !currentItId) {
            await speak("Say a section name followed by checklist to begin.");
            return;
        }

        const section = currentChk.sections.find((s) => s.id === currentSecId);
        const item = section?.items.find((i) => i.id === currentItId);
        if (!item) return;

        await speak(formatItemHelpSpeech(item));
    }, [speak]);

    // Skip / Next item
    const skipCurrentItem = useCallback(async () => {
        const currentChk = checklistRef.current;
        const currentSecId = activeSectionIdRef.current;
        const currentItId = activeItemIdRef.current;
        if (!currentChk || !currentSecId) return;

        const section = currentChk.sections.find((s) => s.id === currentSecId);
        if (!section) return;

        setIsPaused(false);
        isPausedRef.current = false;

        if (!currentItId) {
            await stepNextItem(section.id);
            return;
        }

        const curIdx = section.items.findIndex((i) => i.id === currentItId);
        if (curIdx !== -1 && curIdx + 1 < section.items.length) {
            const nextIt = section.items[curIdx + 1];
            await stepNextItem(section.id, nextIt.id);
        } else if (curIdx === section.items.length - 1) {
            const lastIt = section.items[curIdx];
            await speak(
                `This is the last item of the checklist. ${lastIt?.challenge ?? ""}`.trim(),
            );
        } else {
            await stepNextItem(section.id);
        }
    }, [speak, stepNextItem]);

    // Previous item ("Previous item" / "Go back"): unchecks the target item and reads its challenge
    const previousItem = useCallback(async () => {
        const currentChk = checklistRef.current;
        const targetSecId = activeSectionIdRef.current ?? lastActiveSectionIdRef.current;
        const currentItId = activeItemIdRef.current;
        if (!currentChk || !targetSecId) return;

        const section = currentChk.sections.find((s) => s.id === targetSecId);
        if (!section || section.items.length === 0) return;

        setIsPaused(false);
        isPausedRef.current = false;

        let targetIdx: number;
        if (currentItId) {
            const curIdx = section.items.findIndex((i) => i.id === currentItId);
            if (curIdx === 0) {
                const firstIt = section.items[0];
                if (onSetItemCheckedRef.current) {
                    onSetItemCheckedRef.current(section.id, firstIt.id, false);
                } else if (firstIt.checked) {
                    onItemCompletedRef.current(section.id, firstIt.id);
                }
                await speak(
                    `This is the first item of the checklist. ${firstIt.challenge}`,
                );
                return;
            }
            targetIdx = curIdx > 0 ? curIdx - 1 : 0;
        } else {
            // If section just completed, go back to the last item in that section
            targetIdx = section.items.length - 1;
        }

        const prevIt = section.items[targetIdx];
        if (prevIt) {
            if (onSetItemCheckedRef.current) {
                onSetItemCheckedRef.current(section.id, prevIt.id, false);
            } else if (prevIt.checked) {
                onItemCompletedRef.current(section.id, prevIt.id);
            }
            await stepNextItem(section.id, prevIt.id);
        }
    }, [speak, stepNextItem]);

    // Finish entire active checklist section
    const finishActiveSection = useCallback(async () => {
        const currentChk = checklistRef.current;
        const currentSecId = activeSectionIdRef.current;
        if (!currentChk || !currentSecId) return;

        const section = currentChk.sections.find((s) => s.id === currentSecId);
        if (!section) return;

        for (const item of section.items) {
            if (!item.checked) {
                if (onSetItemCheckedRef.current) {
                    onSetItemCheckedRef.current(section.id, item.id, true);
                } else {
                    onItemCompletedRef.current(section.id, item.id);
                }
            }
        }

        setCurrentChallenge(null);
        currentChallengeRef.current = null;
        setActiveItemId(null);
        activeItemIdRef.current = null;
        setActiveSectionId(null);
        activeSectionIdRef.current = null;
        setIsPaused(false);
        isPausedRef.current = false;

        await delay(150);
        await playCockpitChime();
        await delay(400);
        await speak(`${formatSectionSopName(section.title)} completed.`);
        onSectionCompletedRef.current?.(section.id);
    }, [speak]);

    // Pause co-pilot at current item
    const pauseCopilot = useCallback(() => {
        if (typeof window !== "undefined") {
            window.speechSynthesis?.cancel();
        }
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        isPausedRef.current = true;
        setIsPaused(true);
    }, []);

    // Resume co-pilot from paused item
    const resumeCopilot = useCallback(async () => {
        const currentChk = checklistRef.current;
        const currentSecId = activeSectionIdRef.current;
        if (!currentChk || !currentSecId) return;

        const section = currentChk.sections.find((s) => s.id === currentSecId);
        if (!section) return;

        const item =
            section.items.find((i) => i.id === activeItemIdRef.current) ||
            section.items.find((i) => !i.checked);
        if (!item) return;

        isPausedRef.current = false;
        setIsPaused(false);
        setActiveItemId(item.id);
        activeItemIdRef.current = item.id;
        setCurrentChallenge(item.challenge);
        currentChallengeRef.current = item.challenge;

        await delay(400);
        await speak(`${formatSectionSopName(section.title)}, from line ${item.challenge}`);
    }, [speak]);

    // Reset active section/item pointer (called when checklist/section is reset)
    const resetCopilotState = useCallback(() => {
        if (typeof window !== "undefined") {
            window.speechSynthesis?.cancel();
        }
        isSpeakingRef.current = false;
        isPausedRef.current = false;
        activeSectionIdRef.current = null;
        activeItemIdRef.current = null;
        currentChallengeRef.current = null;
        lastCompletedItemKeyRef.current = null;
        pendingQueueRef.current = [];
        setIsSpeaking(false);
        setIsPaused(false);
        setActiveSectionId(null);
        setActiveItemId(null);
        setCurrentChallenge(null);
        setLastHeard(null);
        setLastMatched(false);
    }, []);

    // Reset co-pilot pointers when switching checklists
    useEffect(() => {
        resetCopilotState();
    }, [checklist?.id, resetCopilotState]);

    // Handle recognized text from Vosk
    const handleSpokenText = useCallback(
        async (rawTranscript: string, isFinal: boolean) => {
            if (isSpeakingRef.current) return;

            const transcript = normalizeVoiceText(rawTranscript);
            if (!transcript) return;

            setLastHeard(transcript);

            // 1. Navigation commands require final result + cooldown to prevent duplicate firing
            const now = Date.now();
            if (isFinal && now - lastCommandAtRef.current > 1200) {
                const cmd = parseChecklistVoiceCommand(transcript);
                if (cmd) {
                    lastCommandAtRef.current = now;
                    setLastMatched(true);

                    if (cmd === "say_again") {
                        await delay(250);
                        repeatCurrentChallenge();
                        return;
                    }
                    if (cmd === "next_item") {
                        await delay(150);
                        await playCockpitChime();
                        await delay(400);
                        await skipCurrentItem();
                        return;
                    }
                    if (cmd === "previous_item") {
                        await delay(150);
                        await playCockpitChime();
                        await delay(400);
                        await previousItem();
                        return;
                    }
                    if (cmd === "finish_checklist") {
                        await finishActiveSection();
                        return;
                    }
                    if (cmd === "stop_checklist") {
                        pauseCopilot();
                        return;
                    }
                    if (cmd === "resume_checklist") {
                        await resumeCopilot();
                        return;
                    }
                    if (cmd === "item_help") {
                        await delay(200);
                        await announceCurrentItemHelp();
                        return;
                    }
                }
            }

            if (isPausedRef.current) return;

            const currentSecId = activeSectionIdRef.current;
            const currentItId = activeItemIdRef.current;
            const currentChk = checklistRef.current;

            // 2. Check Item Response Matching (require final result so partial phrases never interrupt the user)
            if (isFinal && currentSecId && currentItId && currentChk) {
                const itemKey = `${currentSecId}:${currentItId}`;
                if (lastCompletedItemKeyRef.current === itemKey) return;

                const section = currentChk.sections.find((s) => s.id === currentSecId);
                const item = section?.items.find((i) => i.id === currentItId);

                if (item && verifyChecklistResponse(transcript, item)) {
                    lastCompletedItemKeyRef.current = itemKey;
                    setLastMatched(true);
                    await delay(150);
                    await playCockpitChime();
                    if (onSetItemCheckedRef.current) {
                        onSetItemCheckedRef.current(currentSecId, currentItId, true);
                    } else {
                        onItemCompletedRef.current(currentSecId, currentItId);
                    }
                    await delay(700);
                    await stepNextItem(currentSecId, undefined, currentItId);
                    return;
                }
            }

            // 3. SOP Section Activation (requires full "<section> checklist" phrase on final result)
            if (isFinal && currentChk && !activeSectionIdRef.current) {
                const matchedSection = matchSectionActivation(
                    transcript,
                    currentChk.sections,
                );
                if (matchedSection) {
                    lastCommandAtRef.current = Date.now();
                    setLastMatched(true);
                    setActiveSectionId(matchedSection.id);
                    activeSectionIdRef.current = matchedSection.id;
                    setIsPaused(false);
                    isPausedRef.current = false;

                    // Human response pause -> SOP confirmation -> brief pause -> first challenge
                    await delay(450);
                    await speak(formatSectionSopName(matchedSection.title));
                    await delay(450);
                    await stepNextItem(matchedSection.id);
                    return;
                }
            }

            if (isFinal) {
                setLastMatched(false);
            }
        },
        [
            announceCurrentItemHelp,
            finishActiveSection,
            pauseCopilot,
            previousItem,
            repeatCurrentChallenge,
            resumeCopilot,
            skipCurrentItem,
            speak,
            stepNextItem,
        ],
    );

    handleSpokenTextRef.current = handleSpokenText;

    // PTT Keyboard listeners when listening in PTT mode
    useEffect(() => {
        if (!isListening || micMode !== "ptt") {
            isPttPressedRef.current = false;
            setIsPttActive(false);
            return;
        }

        const isEditableTarget = (target: EventTarget | null) => {
            const el = target as HTMLElement | null;
            if (!el) return false;
            const tag = el.tagName;
            return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === pttKeyRef.current && !isEditableTarget(e.target)) {
                if (!e.repeat) {
                    isPttPressedRef.current = true;
                    setIsPttActive(true);
                }
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === pttKeyRef.current) {
                isPttPressedRef.current = false;
                setIsPttActive(false);
            }
        };

        const onBlur = () => {
            isPttPressedRef.current = false;
            setIsPttActive(false);
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [isListening, micMode, pttKey]);

    // Stop audio stream & Vosk session
    const stopListening = useCallback(async () => {
        const wasListening = isListeningRef.current;
        setIsListening(false);
        isListeningRef.current = false;
        setAudioLevel(0);
        setIsPttActive(false);
        isPttPressedRef.current = false;
        pendingQueueRef.current = [];

        if (wasListening) {
            void playCopilotToggleChime("off");
        }

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
            await safeInvoke("stop_speech_session");
        } catch {}
    }, []);

    // Start audio stream & Vosk session
    const startListening = useCallback(async () => {
        const inputDeviceId = useFlightStore.getState().voiceCopilotInputDeviceId;
        const grammar = buildChecklistGrammar(checklistRef.current);

        try {
            await safeInvoke("start_speech_session", { grammar });
        } catch (err) {
            console.warn("[useChecklistVoiceCopilot] Vosk start error:", err);
            void playCopilotToggleChime("off");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia(
                buildMicConstraints(inputDeviceId),
            );
            mediaStreamRef.current = stream;
            stream.getAudioTracks().forEach((track) => {
                track.onended = () => {
                    if (isListeningRef.current) {
                        void stopListening();
                    }
                };
            });

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

            pendingQueueRef.current = [];

            const processQueue = () => {
                if (
                    isFeedingRef.current ||
                    isSpeakingRef.current ||
                    pendingQueueRef.current.length === 0
                ) {
                    return;
                }
                const batch = pendingQueueRef.current.shift()!;
                isFeedingRef.current = true;

                safeInvoke<any>("feed_speech_audio", { samples: batch })
                    .then((res) => {
                        isFeedingRef.current = false;
                        if (res?.text) {
                            handleSpokenTextRef.current(res.text, res.isFinal);
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

                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                setAudioLevel(Math.min(100, Math.round(rms * 100 * 3.8)));

                if (isSpeakingRef.current) return;
                if (micModeRef.current === "ptt" && !isPttPressedRef.current) return;

                const pcm16 = downsampleTo16kPCM(inputData, audioCtx.sampleRate);
                pendingQueueRef.current.push(pcm16);
                processQueue();
            };

            setIsListening(true);
            isListeningRef.current = true;
            void playCopilotToggleChime("on");
        } catch (err) {
            console.error("[useChecklistVoiceCopilot] Mic stream error:", err);
            if (!isListeningRef.current) {
                void playCopilotToggleChime("off");
            }
            await stopListening();
        }
    }, [handleSpokenText, stopListening]);

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    }, [isListening, startListening, stopListening]);

    useEffect(() => {
        return () => {
            stopListening();
            if (typeof window !== "undefined") {
                window.speechSynthesis?.cancel();
            }
        };
    }, [stopListening]);

    return {
        isListening,
        isSpeaking,
        isPaused,
        isPttActive,
        micMode,
        pttKey,
        isSupported,
        audioLevel,
        activeSectionId,
        activeItemId,
        currentChallenge,
        lastHeard,
        lastMatched,
        toggleListening,
        startListening,
        stopListening,
        toggleCopilot: toggleListening,
        startCopilot: startListening,
        stopCopilot: stopListening,
        activateSection: (secId: string) => stepNextItem(secId),
        repeatCurrentChallenge,
        announceCurrentItemHelp,
        skipCurrentItem,
        previousItem,
        finishActiveSection,
        pauseCopilot,
        resumeCopilot,
        resetCopilotState,
    };
}
