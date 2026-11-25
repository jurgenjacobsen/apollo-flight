export interface ChecklistItem {
    id: string;
    challenge: string;         // e.g. "Parking Brake", "Gear", "Flaps", "Altimeters"
    response: string;          // e.g. "SET", "DOWN & LOCKED", "TAKEOFF", "SET & CROSSCHECKED"
    acceptedResponses?: string[]; // Voice aliases: ["down", "three green", "down and three green", "down and locked"]
    note?: string;             // Optional guidance or threshold
    checked?: boolean;         // In-flight execution status
}

export type ChecklistProcedureType = "normal" | "abnormal" | "emergency";

export interface ChecklistSection {
    id: string;
    title: string;             // e.g. "Before Start", "Taxi", "Before Takeoff", "Approach"
    procedureType?: ChecklistProcedureType; // "normal" | "abnormal" | "emergency"
    items: ChecklistItem[];
}

export interface Checklist {
    id: string;
    title: string;             // e.g. "Cessna 172 Skyhawk Normal Procedures"
    description?: string;
    aircraftAssociation?: string; // Associated aircraft title from logbook or current simulator
    category?: string;         // e.g. "Normal Procedures", "Emergency", "Quick Reference"
    sections: ChecklistSection[];
    createdAt: string;
    updatedAt: string;
    isDefault?: boolean;
}

export interface ApolloChecklistExportBundle {
    format: "apollo-checklist-bundle";
    version: number;
    exportedAt: string;
    checklists: Checklist[];
}

export const resetChecklistChecks = (checklists: Checklist[]): Checklist[] =>
    (checklists || []).map((chk) => ({
        ...chk,
        sections: (chk.sections || []).map((sec) => ({
            ...sec,
            items: (sec.items || []).map((it) => ({
                ...it,
                checked: false,
            })),
        })),
    }));

