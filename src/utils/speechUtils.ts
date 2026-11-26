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

function numberToDigitWords(rawDigits: string): string {
    return rawDigits
        .split("")
        .map((d) => ONES[Number(d)] ?? d)
        .join(" ");
}

/**
 * Generates ICAO Doc 9432 & natural English spoken variants for an integer
 * (e.g. 2500 -> "two five zero zero", "two thousand five hundred", "twenty five hundred";
 *       25   -> "twenty five", "two five").
 */
function integerToIcaoVariants(rawDigits: string): string[] {
    const n = Number(rawDigits);
    if (!Number.isInteger(n) || n < 0) return [rawDigits];

    const variants = new Set<string>();
    variants.add(numberToSpokenWords(n));
    if (rawDigits.length >= 2) {
        variants.add(numberToDigitWords(rawDigits));
    }

    if (n >= 100 && n < 1000) {
        const hundreds = Math.floor(n / 100);
        const rem = n % 100;
        if (rem === 0) {
            variants.add(`${ONES[hundreds]} hundred`);
        } else {
            variants.add(`${ONES[hundreds]} hundred ${numberToSpokenWords(rem)}`);
        }
    } else if (n >= 1000 && n < 100000) {
        const thousands = Math.floor(n / 1000);
        const rem = n % 1000;
        const thousandsLead =
            thousands < 10
                ? ONES[thousands]
                : `${numberToDigitWords(String(thousands))}`;
        const thousandsNatural = numberToSpokenWords(thousands);

        if (rem === 0) {
            variants.add(`${thousandsLead} thousand`);
            if (thousandsNatural !== thousandsLead) {
                variants.add(`${thousandsNatural} thousand`);
            }
        } else if (rem % 100 === 0) {
            const h = rem / 100;
            variants.add(`${thousandsLead} thousand ${ONES[h]} hundred`);
            if (thousandsNatural !== thousandsLead) {
                variants.add(`${thousandsNatural} thousand ${ONES[h]} hundred`);
            }
            if (n < 10000) {
                variants.add(`${numberToSpokenWords(Math.floor(n / 100))} hundred`);
            }
        } else {
            const remWords =
                rem < 100
                    ? numberToSpokenWords(rem)
                    : `${ONES[Math.floor(rem / 100)]} hundred ${rem % 100 === 0 ? "" : numberToSpokenWords(rem % 100)}`.trim();
            variants.add(`${thousandsLead} thousand ${remWords}`);
            if (thousandsNatural !== thousandsLead) {
                variants.add(`${thousandsNatural} thousand ${remWords}`);
            }
        }
    }

    return Array.from(variants);
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

const UNIT_NORMALIZATIONS: Array<[RegExp, string]> = [
    // Temperature & percent
    [/°\s*c\b/gi, " degrees celsius "],
    [/°\s*f\b/gi, " degrees fahrenheit "],
    [/°/g, " degrees "],
    [/%/g, " percent "],
    // Compound speed/pressure/rate units (before "/" is stripped)
    [/\bkm\/h\b/gi, " kilometers per hour "],
    [/\bft\/min\b/gi, " feet per minute "],
    [/\bm\/s\b/gi, " meters per second "],
    // Single-letter units only when immediately attached to or following a digit
    [/(\d)\s*(mm|millimeter|millimeters)\b/gi, "$1 millimeters "],
    [/(\d)\s*(cm|centimeter|centimeters)\b/gi, "$1 centimeters "],
    [/(\d)\s*(km|kilometer|kilometers)\b/gi, "$1 kilometers "],
    [/(\d)\s*(nm|nmi)\b/gi, "$1 nautical miles "],
    [/(\d)\s*(ft|foot|feet)\b/gi, "$1 feet "],
    [/(\d)\s*(yd|yard|yards)\b/gi, "$1 yards "],
    [/(\d)\s*(mi|mile|miles)\b/gi, "$1 miles "],
    [/(\d)\s*(m|meter|meters)\b/gi, "$1 meters "],
    [/(\d)\s*(kg|kgs|kilogram|kilograms|kilo|kilos)\b/gi, "$1 kilograms "],
    [/(\d)\s*(g|gram|grams)\b/gi, "$1 grams "],
    [/(\d)\s*(lb|lbs|pound|pounds)\b/gi, "$1 pounds "],
    [/(\d)\s*(oz|ounce|ounces)\b/gi, "$1 ounces "],
    [/(\d)\s*(ml|milliliter|milliliters)\b/gi, "$1 milliliters "],
    [/(\d)\s*(l|ltr|liter|liters)\b/gi, "$1 liters "],
    [/(\d)\s*(gal|gals|gallon|gallons)\b/gi, "$1 gallons "],
    [/(\d)\s*(qt|qts|quart|quarts)\b/gi, "$1 quarts "],
    [/(\d)\s*(v|volt|volts)\b/gi, "$1 volts "],
    [/(\d)\s*(a|amp|amps|ampere|amperes)\b/gi, "$1 amps "],
    [/(\d)\s*(hr|hrs|hour|hours)\b/gi, "$1 hours "],
    [/(\d)\s*(min|mins|minute|minutes)\b/gi, "$1 minutes "],
    [/(\d)\s*(sec|secs|second|seconds)\b/gi, "$1 seconds "],
    // Unambiguous multi-letter units (also when spoken without adjacent digits)
    [/\b(mm|millimeter)\b/gi, "millimeters"],
    [/\b(cm|centimeter)\b/gi, "centimeters"],
    [/\b(km|kilometer)\b/gi, "kilometers"],
    [/\b(meter)\b/gi, "meters"],
    [/\b(nmi|nautical mile)\b/gi, "nautical miles"],
    [/\b(kt|kts|knot)\b/gi, "knots"],
    [/\b(kph|kmh)\b/gi, "kilometers per hour"],
    [/\bmph\b/gi, "miles per hour"],
    [/\bfpm\b/gi, "feet per minute"],
    [/\bmps\b/gi, "meters per second"],
    [/\b(hpa|hectopascal)\b/gi, "hectopascals"],
    [/\b(mbar|mb|millibar)\b/gi, "millibars"],
    [/\binhg\b/gi, "inches of mercury"],
    [/\bkpa\b/gi, "kilopascals"],
    [/\b(kg|kgs|kilogram|kilo|kilos)\b/gi, "kilograms"],
    [/\b(lb|lbs|pound)\b/gi, "pounds"],
    [/\b(oz|ounce)\b/gi, "ounces"],
    [/\b(ml|milliliter)\b/gi, "milliliters"],
    [/\b(ltr|liter)\b/gi, "liters"],
    [/\b(gal|gals|gallon)\b/gi, "gallons"],
    [/\bmhz\b/gi, "megahertz"],
    [/\bkhz\b/gi, "kilohertz"],
    [/\bhz\b/gi, "hertz"],
];

const ICAO_SPOKEN_ALIASES: Array<[RegExp, string]> = [
    [/\btree\b/g, "three"],
    [/\bfower\b/g, "four"],
    [/\bfife\b/g, "five"],
    [/\bniner\b/g, "nine"],
    [/\b(decimal|comma)\b/g, "point"],
    [/\bnegative\b/g, "minus"],
];

/**
 * Normalizes checklist phrases and spoken transcripts into clean lowercase
 * alphabetic tokens compatible with Vosk's English lexicon.
 */
export function normalizeVoiceText(text: string): string {
    let cleaned = text
        .toLowerCase()
        .replace(/&/g, " and ");

    for (const [pattern, replacement] of UNIT_NORMALIZATIONS) {
        cleaned = cleaned.replace(pattern, replacement);
    }

    cleaned = cleaned
        .replace(/\//g, " ")
        .replace(/(^|\s)-(\d)/g, "$1minus $2")
        .replace(/(\d+)[,.](\d+)/g, (_, whole: string, frac: string) => {
            const fracWords = numberToDigitWords(frac);
            return `${numberToSpokenWords(Number(whole))} point ${fracWords}`;
        })
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\b\d+\b/g, (match) => numberToSpokenWords(Number(match)))
        .replace(/\s+/g, " ")
        .trim();

    for (const [pattern, replacement] of ICAO_SPOKEN_ALIASES) {
        cleaned = cleaned.replace(pattern, replacement);
    }

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

export function expandHyphenatedVariants(raw: string): string[] {
    const baseForms = new Set<string>([raw]);
    const joinedRaw = raw.replace(/([a-z0-9])-([a-z0-9])/gi, "$1$2");
    if (joinedRaw !== raw) {
        baseForms.add(joinedRaw);
    }

    // Expand ICAO Doc 9432 numeric variants (e.g. 2500 -> "two five zero zero",
    // "two thousand five hundred", "twenty five hundred"; 25 -> "twenty five", "two five")
    const numMatch = raw.match(/\b(\d+)\b/);
    if (numMatch && !/\d[,.]\d/.test(raw)) {
        const digits = numMatch[1];
        for (const numVariant of integerToIcaoVariants(digits)) {
            baseForms.add(raw.replace(digits, numVariant));
        }
    }

    const normalized = new Set<string>();
    for (const form of baseForms) {
        const norm = normalizeVoiceText(form);
        if (norm) normalized.add(norm);
    }
    return Array.from(normalized);
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
        const variants = expandHyphenatedVariants(raw);
        for (const norm of variants) {
            grammarSet.add(norm);

            if (norm.startsWith("zero point ")) {
                grammarSet.add(norm.replace(/^zero /, ""));
            }
            if (norm === "zero point five centimeters") {
                grammarSet.add("centimeter");
                grammarSet.add("half a centimeter");
                grammarSet.add("half centimeter");
            }

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
        for (const normTitle of expandHyphenatedVariants(section.title)) {
            const sopPhrase = normTitle.endsWith("checklist")
                ? normTitle
                : `${normTitle} checklist`;

            if (clean === sopPhrase || clean.includes(sopPhrase)) {
                return section;
            }
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

    const baseCandidates = [item.response, ...(item.acceptedResponses ?? [])]
        .flatMap(expandHyphenatedVariants)
        .filter(Boolean);

    const candidates = new Set<string>(baseCandidates);
    for (const c of baseCandidates) {
        if (c.startsWith("zero point ")) {
            candidates.add(c.replace(/^zero /, ""));
        }
        if (c === "zero point five centimeters") {
            candidates.add("half a centimeter");
            candidates.add("half centimeter");
        }
    }

    const spokenWords = cleanSpoken.split(" ");
    const spokenJoinedPairs = new Set<string>(spokenWords);
    for (let i = 0; i < spokenWords.length - 1; i++) {
        spokenJoinedPairs.add(`${spokenWords[i]}${spokenWords[i + 1]}`);
    }

    // 1. Require the full expected phrase or accepted alias to be spoken
    //    (never match a truncated prefix like "reviewed as" against "reviewed as req")
    for (const expected of candidates) {
        if (
            cleanSpoken.includes(expected) ||
            (!expected.includes(" ") && spokenJoinedPairs.has(expected))
        ) {
            return true;
        }
    }

    const spokenTokens = new Set(spokenWords);
    const primaryExpected = baseCandidates[0] ?? "";
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
    [/\bSTBY\b/gi, "standby"],
    [/\bPWR\b/gi, "power"],
    [/\bBATT?\b/gi, "battery"],
    [/\bATIS\b/gi, "Atis"],
    [/\bEMER\b/gi, "emergency"],
    [/\bNAV\b/gi, "navigation"],
    [/\bFLT\b/gi, "flight"],
    [/\bAPPR\b/gi, "approach"],
    [/\bLDG\b/gi, "landing"],
    [/\bALTM\b/gi, "altimeter"],
    [/\bCAB\b/gi, "cabin"],
    [/\bXFEED\b/gi, "crossfeed"],
    [/\bINST\b/gi, "instrument"],
    [/\bPOS\b/gi, "position"],
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
    "ELT",
]);

/**
 * Expands aviation checklist abbreviations and normalizes ALL-CAPS labels
 * into natural, fluid prose for neural and system TTS engines.
 */
export function formatChallengeForSpeech(text: string): string {
    let spoken = text
        .trim()
        .replace(/(\d+),(\d+)/g, "$1.$2")
        .replace(/°\s*c\b/gi, " degrees Celsius")
        .replace(/°\s*f\b/gi, " degrees Fahrenheit")
        .replace(/°/g, " degrees")
        .replace(/%/g, " percent")
        .replace(/(\d+(?:\.\d+)?)\s*mm\b/gi, "$1 millimeters")
        .replace(/(\d+(?:\.\d+)?)\s*cm\b/gi, "$1 centimeters")
        .replace(/(\d+(?:\.\d+)?)\s*km\/h\b/gi, "$1 kilometers per hour")
        .replace(/(\d+(?:\.\d+)?)\s*km\b/gi, "$1 kilometers")
        .replace(/(\d+(?:\.\d+)?)\s*m\b/gi, "$1 meters")
        .replace(/(\d+(?:\.\d+)?)\s*(?:nm|nmi)\b/gi, "$1 nautical miles")
        .replace(/(\d+(?:\.\d+)?)\s*ft\/min\b/gi, "$1 feet per minute")
        .replace(/(\d+(?:\.\d+)?)\s*ft\b/gi, "$1 feet")
        .replace(/(\d+(?:\.\d+)?)\s*kts?\b/gi, "$1 knots")
        .replace(/(\d+(?:\.\d+)?)\s*fpm\b/gi, "$1 feet per minute")
        .replace(/(\d+(?:\.\d+)?)\s*hpa\b/gi, "$1 hectopascals")
        .replace(/(\d+(?:\.\d+)?)\s*mbar\b/gi, "$1 millibars")
        .replace(/(\d+(?:\.\d+)?)\s*inhg\b/gi, "$1 inches of mercury")
        .replace(/(\d+(?:\.\d+)?)\s*kgs?\b/gi, "$1 kilograms")
        .replace(/(\d+(?:\.\d+)?)\s*lbs?\b/gi, "$1 pounds")
        .replace(/(\d+(?:\.\d+)?)\s*gals?\b/gi, "$1 gallons")
        .replace(/(\d+(?:\.\d+)?)\s*ml\b/gi, "$1 milliliters")
        .replace(/(\d+(?:\.\d+)?)\s*l\b/gi, "$1 liters")
        .replace(/(\d+(?:\.\d+)?)\s*mhz\b/gi, "$1 megahertz")
        .replace(/(\d+(?:\.\d+)?)\s*khz\b/gi, "$1 kilohertz")
        .replace(/(\d+(?:\.\d+)?)\s*hz\b/gi, "$1 hertz")
        .replace(/&/g, " and ")
        .replace(/\//g, ", ");

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
