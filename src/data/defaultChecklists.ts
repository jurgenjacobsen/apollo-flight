import { Checklist } from "../types/checklist";

export const DEFAULT_CHECKLISTS: Checklist[] = [
    {
        id: "chk-welcome",
        title: "Welcome to Apollo Checklists",
        category: "Quick Reference",
        description: "A quick interactive guide to familiarize yourself with checklists, session tracking, and custom procedures.",
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        sections: [
            {
                id: "welcome-sec-1",
                title: "1. Getting Started",
                procedureType: "normal",
                items: [
                    { id: "wel-1", challenge: "Flight Simulator", response: "RUNNING & CONNECTED", note: "Launch MSFS 2020 or MSFS 2024" },
                    { id: "wel-2", challenge: "Telemetry Link", response: "VERIFIED ONLINE", note: "Green status indicator in the top header" },
                    { id: "wel-3", challenge: "Documentation & Manuals", response: "REVIEWED AS REQ", note: "Browse aircraft manuals and PDF briefings in Docs" },
                ],
            },
            {
                id: "welcome-sec-2",
                title: "2. Checklists Workflow",
                procedureType: "normal",
                items: [
                    { id: "wel-4", challenge: "Check off an Item", response: "CLICK TO ADVANCE", note: "Checks stay active during your session and reset cleanly on restart" },
                    { id: "wel-5", challenge: "Create Custom Checklist", response: "AS DESIRED", note: "Use '+ New Checklist' to build procedures tailored for your aircraft" },
                    { id: "wel-6", challenge: "Import & Export", response: "AVAILABLE", note: "Backup or share checklist JSON bundles with ease" },
                ],
            },
            {
                id: "welcome-sec-3",
                title: "3. Flight Operations",
                procedureType: "normal",
                items: [
                    { id: "wel-7", challenge: "Departure & Arrival Route", response: "LOGBOOK READY", note: "Automatic flight logging starts on takeoff roll" },
                    { id: "wel-8", challenge: "Cockpit Preparation", response: "COMPLETE", note: "Have a great flight!" },
                ],
            },
        ],
    },
];
