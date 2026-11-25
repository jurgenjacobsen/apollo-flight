import { Checklist, ChecklistItem, ChecklistSection } from "../types/checklist";

const ONES = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
];

const TENS = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
];

export const COMMON_AVIATION_AFFIRMATIVES = [
    "checked",
    "set",
    "check",
    "done",
    "verified",
    "armed",
    "standard",
    "normal",
    "on",
    "off",
    "engaged",
    "disengaged",
    "retracted",
    "extended",
    "idle",
    "closed",
    "open",
    "green",
    "clear",
];

export type ChecklistVoiceCommand =
    | "say_again"
    | "next_item"
    | "previous_item"
    | "finish_checklist"
    | "stop_checklist"
    | "resume_checklist"
    | "item_help";

function numberToSpokenWords(n: number): string {
    if (!Number.isInteger(n) || n < 0) return String(n);
    if (n < 20) return ONES[n];
    if (n < 100) {
        const t = Math.floor(n / 10);
        const o = n % 10;
        return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
    }
    return String(n)
        .split("")
        .map((d) => ONES[Number(d)] ?? d)
        .join(" ");
}

const COMPOUND_WORD_ALIASES: Array<[RegExp, string]> = [
    [/\btake[\s-]+off\b/g, "takeoff"],
    [/\bcross[\s-]+check(ed)?\b/g, "crosscheck$1"],
    [/\bpush[\s-]+back\b/g, "pushback"],
    [/\bshut[\s-]+down\b/g, "shutdown"],
    [/\bpre[\s-]+flight\b/g, "preflight"],
    [/\bcheck[\s-]+list\b/g, "checklist"],
    [/\bauto[\s-]+pilot\b/g, "autopilot"],
    [/\bauto[\s-]+brake(s)?\b/g, "autobrake$1"],
    [/\bauto[\s-]+throttle\b/g, "autothrottle"],
    [/\banti[\s-]+ice\b/g, "antiice"],
];

const COMPOUND_SPLIT_FORMS: Record<string, string> = {
    takeoff: "take off",
    crosscheck: "cross check",
    crosschecked: "cross checked",
    pushback: "push back",
    shutdown: "shut down",
    preflight: "pre flight",
    autopilot: "auto pilot",
    autobrake: "auto brake",
    autobrakes: "auto brakes",
    autothrottle: "auto throttle",
    antiice: "anti ice",
};

/**
 * Normalizes checklist phrases and spoken transcripts into clean lowercase
 * alphabetic tokens compatible with Vosk's English lexicon.
 */
export function normalizeVoiceText(text: string): string {
    let cleaned = text
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/°/g, " degrees ")
        .replace(/\//g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\b\d+\b/g, (match) => numberToSpokenWords(Number(match)))
        .replace(/\s+/g, " ")
        .trim();

    for (const [pattern, replacement] of COMPOUND_WORD_ALIASES) {
        cleaned = cleaned.replace(pattern, replacement);
    }

    return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Formats a KeyboardEvent.code string into a human-friendly PTT key label.
 */
export function formatKeyCodeLabel(code: string): string {
    if (!code) return "Space";
    if (code === "Space") return "Space";
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code === "ControlLeft") return "Left Ctrl";
    if (code === "ControlRight") return "Right Ctrl";
    if (code === "ShiftLeft") return "Left Shift";
    if (code === "ShiftRight") return "Right Shift";
    if (code === "AltLeft") return "Left Alt";
    if (code === "AltRight") return "Right Alt";
    return code;
}

/**
 * Builds a clean, deduplicated Vosk grammar list from a checklist and
 * standard cockpit navigation/affirmative tokens.
 */
export function buildChecklistGrammar(checklist: Checklist | null): string[] {
    const grammarSet = new Set<string>([
        "say again",
        "repeat",
        "repeat item",
        "next item",
        "previous item",
        "go back",
        "finish checklist",
        "stop",
        "stop checklist",
        "resume checklist",
        "help",
        "what do i say",
        "what should i say",
        "expected response",
        "prompt",
        "skip item",
        "skip",
        "pause",
        "hold",
        "standby",
        "checklist",
        ...COMMON_AVIATION_AFFIRMATIVES,
    ]);

    const addPhraseAndTokens = (raw: string) => {
        const norm = normalizeVoiceText(raw);
        if (!norm) return;
        grammarSet.add(norm);

        // Also add split-word variants (e.g. "takeoff" -> "take off") for Vosk lexicon coverage
        const splitVariant = norm
            .split(" ")
            .map((w) => COMPOUND_SPLIT_FORMS[w] ?? w)
            .join(" ");
        if (splitVariant !== norm) {
            grammarSet.add(splitVariant);
        }

        const words = splitVariant.split(" ");
        if (words.length > 1) {
            for (const w of words) {
                if (w.length >= 2) {
                    grammarSet.add(w);
                }
            }
        }
    };

    if (checklist) {
        for (const sec of checklist.sections) {
            const normTitle = normalizeVoiceText(sec.title);
            if (normTitle) {
                addPhraseAndTokens(normTitle);
                if (!normTitle.endsWith("checklist")) {
                    addPhraseAndTokens(`${normTitle} checklist`);
                }
            }
            for (const item of sec.items) {
                addPhraseAndTokens(item.challenge);
                addPhraseAndTokens(item.response);
                if (item.acceptedResponses) {
                    for (const resp of item.acceptedResponses) {
                        addPhraseAndTokens(resp);
                    }
                }
            }
        }
    }

    return Array.from(grammarSet);
}

/**
 * Parses global SOP navigation commands from a normalized transcript.
 */
export function parseChecklistVoiceCommand(
    transcript: string,
): ChecklistVoiceCommand | null {
    const clean = normalizeVoiceText(transcript);
    if (!clean) return null;

    if (
        clean.includes("say again") ||
        clean.includes("repeat item") ||
        clean === "repeat"
    ) {
        return "say_again";
    }
    if (
        clean.includes("previous item") ||
        clean.includes("go back")
    ) {
        return "previous_item";
    }
    if (
        clean.includes("next item") ||
        clean.includes("skip item") ||
        clean === "skip"
    ) {
        return "next_item";
    }
    if (clean.includes("finish checklist")) {
        return "finish_checklist";
    }
    if (clean.includes("resume checklist")) {
        return "resume_checklist";
    }
    if (
        clean.includes("stop checklist") ||
        clean === "stop" ||
        clean === "pause"
    ) {
        return "stop_checklist";
    }
    if (
        clean.includes("what do i say") ||
        clean.includes("what should i say") ||
        clean.includes("expected response") ||
        clean === "help" ||
        clean === "prompt"
    ) {
        return "item_help";
    }

    return null;
}

/**
 * Matches a spoken SOP section callout (must include the full "<section> checklist"
 * phrase so bare section names do not prematurely trigger reading).
 */
export function matchSectionActivation(
    transcript: string,
    sections: ChecklistSection[],
): ChecklistSection | undefined {
    const clean = normalizeVoiceText(transcript);
    if (!clean || !clean.includes("checklist")) return undefined;

    // Prefer longest matching section phrase to avoid shorter-prefix ambiguity
    const sorted = [...sections].sort(
        (a, b) => b.title.length - a.title.length,
    );

    for (const section of sorted) {
        const normTitle = normalizeVoiceText(section.title);
        if (!normTitle) continue;
        const sopPhrase = normTitle.endsWith("checklist")
            ? normTitle
            : `${normTitle} checklist`;

        if (clean === sopPhrase || clean.includes(sopPhrase)) {
            return section;
        }
    }

    return undefined;
}

/**
 * Matches a spoken transcript against a checklist item's expected response,
 * accepted aliases, affirmative aviation tokens, and word-level overlap.
 */
export function verifyChecklistResponse(
    spoken: string,
    item: ChecklistItem,
): boolean {
    const cleanSpoken = normalizeVoiceText(spoken);
    if (!cleanSpoken) return false;

    const candidates = [item.response, ...(item.acceptedResponses ?? [])]
        .map(normalizeVoiceText)
        .filter(Boolean);

    // 1. Require the full expected phrase or accepted alias to be spoken
    //    (never match a truncated prefix like "reviewed as" against "reviewed as req")
    for (const expected of candidates) {
        if (cleanSpoken.includes(expected)) {
            return true;
        }
    }

    const spokenTokens = new Set(cleanSpoken.split(" "));
    const primaryExpected = candidates[0] ?? "";
    const primaryWords = primaryExpected.split(" ").filter(Boolean);

    // 2. Allow single-word aviation affirmatives only when the primary expected
    //    response is a single word (e.g. "Set", "Checked", "Normal")
    if (primaryWords.length <= 1) {
        for (const aff of COMMON_AVIATION_AFFIRMATIVES) {
            if (
                spokenTokens.has(aff) &&
                (primaryExpected === aff ||
                    primaryExpected === "checked" ||
                    primaryExpected === "set")
            ) {
                return true;
            }
        }
    }

    // 3. Multi-word full-phrase token match: all meaningful expected words must be spoken
    for (const expected of candidates) {
        const expectedWords = expected.split(" ").filter((w) => w.length >= 2);
        if (expectedWords.length >= 2) {
            const allWordsMatched = expectedWords.every((w) =>
                spokenTokens.has(w),
            );
            if (allWordsMatched) {
                return true;
            }
        }
    }

    return false;
}

const AVIATION_SPEECH_EXPANSIONS: Array<[RegExp, string]> = [
    [/\bREQD?\b/gi, "required"],
    [/\bENG\b/gi, "engine"],
    [/\bALT\b/gi, "altitude"],
    [/\bTEMP\b/gi, "temperature"],
    [/\bPAX\b/gi, "passengers"],
    [/\bXPDR\b/gi, "transponder"],
    [/\bHDG\b/gi, "heading"],
    [/\bIAS\b/gi, "indicated airspeed"],
    [/\bBARO\b/gi, "barometric"],
    [/\bPRESS\b/gi, "pressure"],
    [/\bHYD\b/gi, "hydraulic"],
    [/\bELEC\b/gi, "electrical"],
    [/\bPNEU\b/gi, "pneumatic"],
    [/\bGEN\b/gi, "generator"],
    [/\bBATT?\b/gi, "battery"],
    [/\bIGN\b/gi, "ignition"],
    [/\bMIN\b/gi, "minimum"],
    [/\bMAX\b/gi, "maximum"],
    [/\bQTY\b/gi, "quantity"],
    [/\bIND\b/gi, "indicated"],
    [/\bCHK\b/gi, "check"],
    [/\bCOM\b/gi, "comm"],
];

const PRESERVED_ACRONYMS = new Set([
    "APU",
    "GPU",
    "VHF",
    "ILS",
    "GPS",
    "VOR",
    "ADF",
    "DME",
    "TCAS",
    "EFIS",
    "ECAM",
    "EICAS",
    "SOP",
    "TOGA",
    "VNAV",
    "LNAV",
    "ATC",
]);

/**
 * Expands aviation checklist abbreviations and normalizes ALL-CAPS labels
 * into natural, fluid prose for neural and system TTS engines.
 */
export function formatChallengeForSpeech(text: string): string {
    let spoken = text
        .trim()
        .replace(/&/g, " and ")
        .replace(/\//g, ", ")
        .replace(/°/g, " degrees");

    for (const [pattern, replacement] of AVIATION_SPEECH_EXPANSIONS) {
        spoken = spoken.replace(pattern, replacement);
    }

    // Lowercase ALL-CAPS non-acronym words so TTS reads them smoothly instead of spelling letters
    spoken = spoken
        .split(/\s+/)
        .map((word) => {
            const bare = word.replace(/[^A-Za-z]/g, "");
            if (
                bare.length >= 2 &&
                bare === bare.toUpperCase() &&
                !PRESERVED_ACRONYMS.has(bare)
            ) {
                return word.toLowerCase();
            }
            return word;
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    if (spoken && !/[.!?]$/.test(spoken)) {
        spoken = `${spoken}.`;
    }

    return spoken;
}

export function formatItemHelpSpeech(item: ChecklistItem): string {
    const aliasHint =
        item.acceptedResponses && item.acceptedResponses.length > 0
            ? `, or ${item.acceptedResponses[0]}`
            : "";
    return `For ${item.challenge}, say ${item.response}${aliasHint}.`;
}

export function buildMicConstraints(
    inputDeviceId?: string,
): MediaStreamConstraints {
    const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    };
    if (inputDeviceId) {
        audioConstraints.deviceId = { exact: inputDeviceId };
    }
    return { audio: audioConstraints };
}

export function createSpeechAudioContext(): AudioContext {
    const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
    try {
        return new AudioCtx({ sampleRate: 16000 });
    } catch {
        return new AudioCtx();
    }
}

export function downsampleTo16kPCM(
    buffer: Float32Array,
    sampleRate: number,
): number[] {
    if (sampleRate === 16000) {
        const result: number[] = new Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            const s = Math.max(-1, Math.min(1, buffer[i]));
            result[i] =
                s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
        }
        return result;
    }

    const ratio = sampleRate / 16000;
    const newLength = Math.round(buffer.length / ratio);
    const result: number[] = new Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
        let accum = 0;
        let count = 0;
        for (
            let i = offsetBuffer;
            i < nextOffsetBuffer && i < buffer.length;
            i++
        ) {
            accum += buffer[i];
            count++;
        }
        const s = Math.max(-1, Math.min(1, count > 0 ? accum / count : 0));
        result[offsetResult] =
            s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }

    return result;
}
