import { Checklist, resetChecklistChecks } from "../../types/checklist";
import { safeInvoke } from "../../utils/ipc";

type StoreSet = (partial: any) => void;
type StoreGet = () => {
    checklists: Checklist[];
    activeChecklistId: string | null;
};

export function createChecklistSlice(set: StoreSet, get: StoreGet) {
    return {
        setActiveChecklistId: (id: string | null) => set({ activeChecklistId: id }),

        setChecklists: (checklists: Checklist[]) => {
            set({ checklists });
            safeInvoke("set_user_setting", {
                key: "checklists",
                value: JSON.stringify(resetChecklistChecks(checklists)),
            }).catch(() => {});
        },

        addChecklist: (
            checklistData: Omit<Checklist, "id" | "createdAt" | "updatedAt"> & {
                id?: string;
            },
        ) => {
            const id =
                checklistData.id ||
                `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const now = new Date().toISOString();
            const newChecklist: Checklist = {
                ...checklistData,
                id,
                createdAt: now,
                updatedAt: now,
            };
            const updated = [newChecklist, ...get().checklists];
            set({ checklists: updated, activeChecklistId: id });
            safeInvoke("set_user_setting", {
                key: "checklists",
                value: JSON.stringify(resetChecklistChecks(updated)),
            }).catch(() => {});
            return newChecklist;
        },

        updateChecklist: (id: string, updates: Partial<Checklist>) => {
            const now = new Date().toISOString();
            const updated = get().checklists.map((c) =>
                c.id === id ? { ...c, ...updates, updatedAt: now } : c,
            );
            set({ checklists: updated });
            safeInvoke("set_user_setting", {
                key: "checklists",
                value: JSON.stringify(resetChecklistChecks(updated)),
            }).catch(() => {});
        },

        deleteChecklist: (id: string) => {
            const updated = get().checklists.filter((c) => c.id !== id);
            const activeChecklistId =
                get().activeChecklistId === id ? null : get().activeChecklistId;
            set({ checklists: updated, activeChecklistId });
            safeInvoke("set_user_setting", {
                key: "checklists",
                value: JSON.stringify(resetChecklistChecks(updated)),
            }).catch(() => {});
        },

        duplicateChecklist: (id: string) => {
            const target = get().checklists.find((c) => c.id === id);
            if (!target) return;
            const now = new Date().toISOString();
            const newId = `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const duplicated: Checklist = {
                ...target,
                id: newId,
                title: `${target.title} (Copy)`,
                isDefault: false,
                createdAt: now,
                updatedAt: now,
                sections: target.sections.map((s) => ({
                    ...s,
                    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    items: s.items.map((i) => ({
                        ...i,
                        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        checked: false,
                    })),
                })),
            };
            const updated = [duplicated, ...get().checklists];
            set({ checklists: updated, activeChecklistId: newId });
            safeInvoke("set_user_setting", {
                key: "checklists",
                value: JSON.stringify(resetChecklistChecks(updated)),
            }).catch(() => {});
        },

        toggleChecklistItem: (
            checklistId: string,
            sectionId: string,
            itemId: string,
        ) => {
            const updated = get().checklists.map((chk) => {
                if (chk.id !== checklistId) return chk;
                return {
                    ...chk,
                    sections: chk.sections.map((sec) => {
                        if (sec.id !== sectionId) return sec;
                        return {
                            ...sec,
                            items: sec.items.map((it) => {
                                if (it.id !== itemId) return it;
                                return { ...it, checked: !it.checked };
                            }),
                        };
                    }),
                };
            });
            set({ checklists: updated });
        },

        resetChecklist: (checklistId: string) => {
            const updated = get().checklists.map((chk) => {
                if (chk.id !== checklistId) return chk;
                return {
                    ...chk,
                    sections: chk.sections.map((sec) => ({
                        ...sec,
                        items: sec.items.map((it) => ({
                            ...it,
                            checked: false,
                        })),
                    })),
                };
            });
            set({ checklists: updated });
        },

        resetChecklistSection: (checklistId: string, sectionId: string) => {
            const updated = get().checklists.map((chk) => {
                if (chk.id !== checklistId) return chk;
                return {
                    ...chk,
                    sections: chk.sections.map((sec) => {
                        if (sec.id !== sectionId) return sec;
                        return {
                            ...sec,
                            items: sec.items.map((it) => ({
                                ...it,
                                checked: false,
                            })),
                        };
                    }),
                };
            });
            set({ checklists: updated });
        },

        importChecklists: (imported: Checklist[]) => {
            const current = get().checklists;
            const currentMap = new Map(current.map((c) => [c.id, c]));
            let added = 0;
            let replaced = 0;
            const now = new Date().toISOString();

            for (const chk of imported) {
                if (!chk.title || !Array.isArray(chk.sections)) continue;
                const id =
                    chk.id ||
                    `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const validItem: Checklist = {
                    id,
                    title: chk.title,
                    aircraftAssociation: chk.aircraftAssociation || undefined,
                    category: chk.category || "General",
                    description: chk.description || "",
                    isDefault: Boolean(chk.isDefault),
                    createdAt: chk.createdAt || now,
                    updatedAt: now,
                    sections: chk.sections.map((sec, sIdx) => ({
                        id:
                            sec.id ||
                            `sec-${sIdx}-${Math.random().toString(36).slice(2, 7)}`,
                        title: sec.title || `Section ${sIdx + 1}`,
                        procedureType:
                            sec.procedureType === "abnormal" ||
                            sec.procedureType === "emergency"
                                ? sec.procedureType
                                : "normal",
                        items: (sec.items || []).map((it, iIdx) => ({
                            id:
                                it.id ||
                                `it-${iIdx}-${Math.random().toString(36).slice(2, 7)}`,
                            challenge: it.challenge || "Item",
                            response: it.response || "CHECK",
                            note: it.note,
                            checked: false,
                        })),
                    })),
                };

                if (currentMap.has(id)) {
                    currentMap.set(id, validItem);
                    replaced++;
                } else {
                    currentMap.set(id, validItem);
                    added++;
                }
            }

            const updated = Array.from(currentMap.values());
            set({ checklists: updated });
            safeInvoke("set_user_setting", {
                key: "checklists",
                value: JSON.stringify(resetChecklistChecks(updated)),
            }).catch(() => {});
            return { added, replaced };
        },
    };
}
