import { describe, it, expect } from "vitest";
import {
    normalizeVoiceText,
    buildChecklistGrammar,
    verifyChecklistResponse,
    matchSectionActivation,
    parseChecklistVoiceCommand,
    formatKeyCodeLabel,
    formatItemHelpSpeech,
    formatChallengeForSpeech,
} from "./speechUtils";
import { Checklist } from "../types/checklist";

describe("speechUtils", () => {
    it("normalizes punctuation, symbols, and numbers into Vosk-friendly words", () => {
        expect(normalizeVoiceText("Set, 15°")).toBe("set fifteen degrees");
        expect(normalizeVoiceText("ON & Checked")).toBe("on and checked");
        expect(normalizeVoiceText("Flaps 10 / 25")).toBe("flaps ten twenty five");
    });

    it("builds a normalized checklist grammar without punctuation or raw digits", () => {
        const checklist: Checklist = {
            id: "chk-1",
            title: "Test",
            createdAt: "2026-11-25T00:00:00Z",
            updatedAt: "2026-11-25T00:00:00Z",
            sections: [
                {
                    id: "sec-1",
                    title: "Before Takeoff",
                    items: [
                        {
                            id: "item-1",
                            challenge: "Flaps",
                            response: "Set, 15°",
                            acceptedResponses: ["15 degrees"],
                            checked: false,
                        },
                    ],
                },
            ],
        };

        const grammar = buildChecklistGrammar(checklist);
        expect(grammar).toContain("before takeoff");
        expect(grammar).toContain("before takeoff checklist");
        expect(grammar).toContain("next item");
        expect(grammar).toContain("previous item");
        expect(grammar).toContain("finish checklist");
        expect(grammar).toContain("resume checklist");
        expect(grammar).toContain("set fifteen degrees");
        expect(grammar).toContain("fifteen");
        expect(grammar).toContain("checked");
        expect(grammar.every((entry) => !/[,°&/]|\d/.test(entry))).toBe(true);
    });

    it("treats take-off, take off, and takeoff (and similar aviation compounds) identically", () => {
        expect(normalizeVoiceText("Take-off")).toBe("takeoff");
        expect(normalizeVoiceText("Take Off")).toBe("takeoff");
        expect(normalizeVoiceText("Takeoff")).toBe("takeoff");
        expect(normalizeVoiceText("Set & Cross-Checked")).toBe("set and crosschecked");

        const sections = [{ id: "s1", title: "Before Take-off", items: [] }];
        expect(matchSectionActivation("before take off checklist", sections)?.id).toBe("s1");
        expect(matchSectionActivation("before takeoff checklist", sections)?.id).toBe("s1");
        expect(matchSectionActivation("before take-off checklist", sections)?.id).toBe("s1");

        const grammar = buildChecklistGrammar({
            id: "chk-takeoff",
            title: "Test",
            createdAt: "2026-11-25T00:00:00Z",
            updatedAt: "2026-11-25T00:00:00Z",
            sections,
        });
        expect(grammar).toContain("before takeoff checklist");
        expect(grammar).toContain("before take off checklist");
    });

    it("matches SOP section activation only when the full '<section> checklist' phrase is spoken", () => {
        const sections = [
            { id: "s1", title: "Before Starting Engine", items: [] },
            { id: "s2", title: "Before Takeoff", items: [] },
        ];

        // Bare section name must NOT activate
        expect(matchSectionActivation("before takeoff", sections)).toBeUndefined();
        // Full SOP phrase activates the matching section
        expect(matchSectionActivation("before takeoff checklist", sections)?.id).toBe("s2");
        expect(matchSectionActivation("before starting engine checklist", sections)?.id).toBe("s1");
    });

    it("parses all checklist navigation voice commands", () => {
        expect(parseChecklistVoiceCommand("say again")).toBe("say_again");
        expect(parseChecklistVoiceCommand("next item")).toBe("next_item");
        expect(parseChecklistVoiceCommand("previous item")).toBe("previous_item");
        expect(parseChecklistVoiceCommand("go back")).toBe("previous_item");
        expect(parseChecklistVoiceCommand("finish checklist")).toBe("finish_checklist");
        expect(parseChecklistVoiceCommand("stop checklist")).toBe("stop_checklist");
        expect(parseChecklistVoiceCommand("stop")).toBe("stop_checklist");
        expect(parseChecklistVoiceCommand("resume checklist")).toBe("resume_checklist");
        expect(parseChecklistVoiceCommand("what do i say")).toBe("item_help");
        expect(parseChecklistVoiceCommand("what should i say")).toBe("item_help");
        expect(parseChecklistVoiceCommand("expected response")).toBe("item_help");
        expect(parseChecklistVoiceCommand("help")).toBe("item_help");
        expect(parseChecklistVoiceCommand("flaps set")).toBeNull();
    });

    it("requires full phrase/sentence matching for multi-word responses", () => {
        const multiWordItem = {
            id: "item-multi",
            challenge: "Briefing",
            response: "REVIEWED AS REQ",
            checked: false,
        };

        // Partial prefix must NOT match
        expect(verifyChecklistResponse("reviewed as", multiWordItem)).toBe(false);
        expect(verifyChecklistResponse("reviewed", multiWordItem)).toBe(false);
        // Full phrase (exact or inside a sentence) MUST match
        expect(verifyChecklistResponse("reviewed as req", multiWordItem)).toBe(true);
        expect(verifyChecklistResponse("briefing is reviewed as req", multiWordItem)).toBe(true);
    });

    it("matches direct responses, carrier phrases for single-word responses, and accepted aliases", () => {
        const item = {
            id: "item-1",
            challenge: "Flaps",
            response: "Set, 15°",
            acceptedResponses: ["fifteen degrees"],
            checked: false,
        };

        expect(verifyChecklistResponse("set fifteen degrees", item)).toBe(true);
        expect(verifyChecklistResponse("flaps are set", item)).toBe(false);
        expect(verifyChecklistResponse("fifteen degrees", item)).toBe(true);
        expect(verifyChecklistResponse("landing gear down", item)).toBe(false);

        const singleWordItem = {
            id: "item-2",
            challenge: "Parking Brake",
            response: "Set",
            checked: false,
        };
        expect(verifyChecklistResponse("parking brake is set", singleWordItem)).toBe(true);
    });

    it("formats KeyboardEvent.code labels cleanly for PTT settings", () => {
        expect(formatKeyCodeLabel("Space")).toBe("Space");
        expect(formatKeyCodeLabel("KeyV")).toBe("V");
        expect(formatKeyCodeLabel("ControlRight")).toBe("Right Ctrl");
    });

    it("formats item_help spoken prompt with item name and expected response", () => {
        expect(
            formatItemHelpSpeech({
                id: "1",
                challenge: "Parking Brake",
                response: "Set",
                checked: false,
            }),
        ).toBe("For Parking Brake, say Set.");

        expect(
            formatItemHelpSpeech({
                id: "2",
                challenge: "Flaps",
                response: "Set, 15°",
                acceptedResponses: ["fifteen degrees"],
                checked: false,
            }),
        ).toBe("For Flaps, say Set, 15°, or fifteen degrees.");
    });

    it("expands aviation abbreviations and normalizes ALL-CAPS labels for fluid TTS", () => {
        expect(formatChallengeForSpeech("ENG ANTI-ICE")).toBe("engine anti-ice.");
        expect(formatChallengeForSpeech("REVIEWED AS REQ")).toBe("reviewed as required.");
        expect(formatChallengeForSpeech("APU GEN")).toBe("APU generator.");
        expect(formatChallengeForSpeech("PARKING BRAKE")).toBe("parking brake.");
    });
});
