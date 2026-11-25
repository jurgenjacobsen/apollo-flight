import { describe, it, expect } from "vitest";
import {
    formatPitchAngle,
    formatRollAngle,
    formatAttitude,
} from "./flightFormatters";

describe("flightFormatters attitude formatting", () => {
    it("formats pitch angles with Up/Down directional labels", () => {
        expect(formatPitchAngle(undefined)).toBe("--");
        expect(formatPitchAngle(0)).toBe("0°");
        expect(formatPitchAngle(4.2)).toBe("4.2° Up");
        expect(formatPitchAngle(-3.5)).toBe("3.5° Down");
    });

    it("formats roll/bank angles with Left/Right directional labels", () => {
        expect(formatRollAngle(undefined)).toBe("--");
        expect(formatRollAngle(0)).toBe("0°");
        expect(formatRollAngle(15.4)).toBe("15.4° Left");
        expect(formatRollAngle(-12)).toBe("12° Right");
        expect(formatRollAngle(15.4, true)).toBe("15.4° L");
        expect(formatRollAngle(-12, true)).toBe("12° R");
    });

    it("formats combined attitude string in compact and full modes", () => {
        expect(formatAttitude(5, -10, true)).toBe("5° Up / 10° R");
        expect(formatAttitude(-2.5, 8.2, false)).toBe("2.5° Down / 8.2° Left");
    });
});
