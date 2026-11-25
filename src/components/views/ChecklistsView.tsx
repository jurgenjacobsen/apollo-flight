import React, { useState, useMemo, useRef } from "react";
import { useFlightStore } from "../../store/flightStore";
import {
    Checklist,
    ChecklistSection,
    ChecklistItem,
    ChecklistProcedureType,
    resetChecklistChecks,
} from "../../types/checklist";
import {
    ListChecks,
    Plus,
    Search,
    Download,
    Upload,
    Plane,
    RotateCcw,
    Trash2,
    Copy,
    Edit3,
    ChevronDown,
    ChevronRight,
    AlertCircle,
    X,
    FileText,
    Check,
    Mic,
    MicOff,
    Volume2,
} from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { ConfirmDeleteButton } from "../ui/ConfirmDeleteButton";
import { useChecklistVoiceCopilot } from "../../hooks/useChecklistVoiceCopilot";
import { formatKeyCodeLabel } from "../../utils/speechUtils";

function matchesAircraft(
    association?: string,
    currentSimTitle?: string,
): boolean {
    if (!association || !currentSimTitle) return false;
    const assoc = association.toLowerCase().trim();
    const title = currentSimTitle.toLowerCase().trim();
    if (!assoc || !title || title === "standby (waiting for msfs)") return false;
    if (assoc === title || title.includes(assoc) || assoc.includes(title)) {
        return true;
    }
    const assocWords = assoc
        .split(/[\s\-_/]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2);
    return assocWords.some((w) => title.includes(w));
}

function getProcedureStyles(procedureType?: ChecklistProcedureType) {
    switch (procedureType) {
        case "emergency":
            return {
                borderClass:
                    "border-rose-400 dark:border-red-700/80",
                badgeClass:
                    "bg-rose-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800/80 font-bold",
                label: "Emergency",
                headerHover:
                    "hover:bg-rose-50/50 dark:hover:bg-rose-950/20",
            };
        case "abnormal":
            return {
                borderClass:
                    "border-amber-400 dark:border-amber-700/80",
                badgeClass:
                    "bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80 font-semibold",
                label: "Abnormal",
                headerHover:
                    "hover:bg-amber-50/50 dark:hover:bg-amber-950/20",
            };
        case "normal":
        default:
            return {
                borderClass:
                    "border-neutral-200 dark:border-geist-hairline dark:border-l-sky-400",
                badgeClass:
                    "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50 font-medium",
                label: "Normal",
                headerHover:
                    "hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40",
            };
    }
}

export const ChecklistsView: React.FC = () => {
    const {
        checklists,
        activeChecklistId,
        setActiveChecklistId,
        addChecklist,
        updateChecklist,
        deleteChecklist,
        duplicateChecklist,
        toggleChecklistItem,
        resetChecklist,
        resetChecklistSection,
        importChecklists,
        currentTelemetry,
        flights,
        voiceCopilotMicGranted,
        setActiveView,
        setSettingsActiveTab,
    } = useFlightStore();

    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
    const [collapsedSections, setCollapsedSections] = useState<
        Record<string, boolean>
    >({});
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingChecklist, setEditingChecklist] = useState<Checklist | null>(
        null,
    );
    const [feedbackMessage, setFeedbackMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Compute all unique aircraft types flown in logbook + current telemetry aircraft
    const availableAircraftOptions = useMemo(() => {
        const set = new Set<string>();
        if (
            currentTelemetry.simConnected &&
            currentTelemetry.aircraftTitle &&
            currentTelemetry.aircraftTitle !== "Standby (Waiting for MSFS)"
        ) {
            set.add(currentTelemetry.aircraftTitle.trim());
        }
        flights.forEach((f) => {
            if (f.aircraftType && f.aircraftType !== "Unknown") {
                set.add(f.aircraftType.trim());
            }
        });
        // Common default templates
        ["Cessna 172 Skyhawk", "Airbus A320neo", "Boeing 737-800"].forEach((a) =>
            set.add(a),
        );
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [flights, currentTelemetry]);

    // Active in-game aircraft title
    const activeSimTitle =
        currentTelemetry.simConnected &&
        currentTelemetry.aircraftTitle &&
        currentTelemetry.aircraftTitle !== "Standby (Waiting for MSFS)"
            ? currentTelemetry.aircraftTitle
            : null;

    // Check if a checklist matches active sim aircraft
    const isChecklistActive = (chk: Checklist) => {
        return Boolean(
            activeSimTitle &&
                matchesAircraft(chk.aircraftAssociation, activeSimTitle),
        );
    };

    // Sort checklists: Active in-sim aircraft at the very top, then standard sorting
    const sortedChecklists = useMemo(() => {
        const copy = [...checklists];
        copy.sort((a, b) => {
            const aActive = isChecklistActive(a);
            const bActive = isChecklistActive(b);
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return a.title.localeCompare(b.title);
        });
        return copy;
    }, [checklists, activeSimTitle]);

    // Filter by search & category
    const filteredChecklists = useMemo(() => {
        return sortedChecklists.filter((chk) => {
            const cat = chk.category || "";
            const matchSearch =
                chk.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (chk.aircraftAssociation &&
                    chk.aircraftAssociation
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase())) ||
                cat.toLowerCase().includes(searchTerm.toLowerCase());

            const matchCat =
                selectedCategory === "ALL" ||
                cat.toLowerCase() === selectedCategory.toLowerCase();

            return matchSearch && matchCat;
        });
    }, [sortedChecklists, searchTerm, selectedCategory]);

    // Categories list
    const categories = useMemo(() => {
        const set = new Set<string>();
        checklists.forEach((c) => {
            if (c.category) set.add(c.category);
        });
        return ["ALL", ...Array.from(set)];
    }, [checklists]);

    // Current selected checklist
    const activeChecklist = useMemo(() => {
        if (!checklists.length) return null;
        if (activeChecklistId) {
            const found = checklists.find((c) => c.id === activeChecklistId);
            if (found) return found;
        }
        // If an active in-sim checklist exists, prioritize it by default
        const activeSimChk = sortedChecklists.find((c) => isChecklistActive(c));
        return activeSimChk || filteredChecklists[0] || checklists[0] || null;
    }, [checklists, activeChecklistId, sortedChecklists, filteredChecklists]);

    // Calculate progress for a checklist
    const getChecklistStats = (chk: Checklist) => {
        let total = 0;
        let checked = 0;
        chk.sections.forEach((sec) => {
            sec.items.forEach((it) => {
                total++;
                if (it.checked) checked++;
            });
        });
        const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
        return { total, checked, percent, isComplete: total > 0 && checked === total };
    };

    const toggleSectionCollapse = (sectionId: string) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    const handleToggleItem = (
        checklistId: string,
        sectionId: string,
        itemId: string,
    ) => {
        const section = activeChecklist?.sections.find((s) => s.id === sectionId);
        if (section) {
            const item = section.items.find((i) => i.id === itemId);
            const willBeChecked = !item?.checked;
            if (willBeChecked) {
                const otherUnchecked = section.items.filter(
                    (i) => i.id !== itemId && !i.checked,
                ).length;
                if (otherUnchecked === 0) {
                    // All items in this section completed -> auto collapse after brief visual confirmation
                    setTimeout(() => {
                        setCollapsedSections((prev) => ({
                            ...prev,
                            [sectionId]: true,
                        }));
                    }, 350);
                }
            }
        }
        toggleChecklistItem(checklistId, sectionId, itemId);
    };

    const handleResetSection = (checklistId: string, sectionId: string) => {
        resetChecklistSection(checklistId, sectionId);
        if (copilot.activeSectionId === sectionId) {
            copilot.resetCopilotState();
        }
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: false,
        }));
    };

    const handleResetChecklist = (checklistId: string) => {
        resetChecklist(checklistId);
        copilot.resetCopilotState();
        setCollapsedSections({});
    };

    const copilot = useChecklistVoiceCopilot({
        checklist: activeChecklist,
        onItemCompleted: (sectionId, itemId) => {
            if (!activeChecklist) return;
            const latest = useFlightStore
                .getState()
                .checklists.find((c) => c.id === activeChecklist.id);
            const sec = latest?.sections.find((s) => s.id === sectionId);
            const item = sec?.items.find((i) => i.id === itemId);
            if (!item?.checked) {
                handleToggleItem(activeChecklist.id, sectionId, itemId);
            }
        },
        onSetItemChecked: (sectionId, itemId, checked) => {
            if (!activeChecklist) return;
            const latest = useFlightStore
                .getState()
                .checklists.find((c) => c.id === activeChecklist.id);
            const sec = latest?.sections.find((s) => s.id === sectionId);
            const item = sec?.items.find((i) => i.id === itemId);
            if (Boolean(item?.checked) !== checked) {
                handleToggleItem(activeChecklist.id, sectionId, itemId);
            }
            if (!checked) {
                setCollapsedSections((prev) => ({
                    ...prev,
                    [sectionId]: false,
                }));
            }
        },
        onSectionCompleted: (sectionId) => {
            setCollapsedSections((prev) => ({
                ...prev,
                [sectionId]: true,
            }));
        },
    });

    const handleExportSingle = (chk: Checklist) => {
        const cleanChk = resetChecklistChecks([chk])[0] || chk;
        const jsonStr = JSON.stringify(cleanChk, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const filename = `${chk.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_checklist.json`;
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportAll = () => {
        const bundle = {
            format: "apollo-checklists-bundle",
            version: "1.0",
            exportedAt: new Date().toISOString(),
            checklists: resetChecklistChecks(checklists),
        };
        const jsonStr = JSON.stringify(bundle, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `apollo_checklists_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const parsed = JSON.parse(text);
                let toImport: Checklist[] = [];

                if (Array.isArray(parsed)) {
                    toImport = parsed;
                } else if (parsed && Array.isArray(parsed.checklists)) {
                    toImport = parsed.checklists;
                } else if (parsed && parsed.title && Array.isArray(parsed.sections)) {
                    toImport = [parsed];
                } else {
                    throw new Error("Invalid checklist format");
                }

                const result = importChecklists(toImport);
                setFeedbackMessage({
                    type: "success",
                    text: `Successfully imported: ${result.added} added, ${result.replaced} updated.`,
                });
                setTimeout(() => setFeedbackMessage(null), 4000);
            } catch (err: any) {
                setFeedbackMessage({
                    type: "error",
                    text: `Import failed: ${err.message || "Invalid JSON structure"}`,
                });
                setTimeout(() => setFeedbackMessage(null), 5000);
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = "";
    };

    const openCreateModal = () => {
        setEditingChecklist(null);
        setIsEditorOpen(true);
    };

    const openEditModal = (chk: Checklist) => {
        setEditingChecklist(chk);
        setIsEditorOpen(true);
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans overflow-hidden">
            {/* Header & Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                        <ListChecks className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                            Aircraft Checklists
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Standard Operating Procedures & cockpit flow cards
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
                    {activeSimTitle && (
                        <div className="hidden sm:inline-flex items-center gap-2 h-8 px-2.5 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="truncate max-w-[200px]">
                                In Sim: {activeSimTitle}
                            </span>
                        </div>
                    )}

                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".json"
                        className="hidden"
                        onChange={handleImportFile}
                    />

                    <Tooltip content="Import checklist or bundle from JSON">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border transition-colors duration-150 select-none bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs cursor-pointer"
                        >
                            <Upload className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Import</span>
                        </button>
                    </Tooltip>

                    <Tooltip content="Export all checklists as JSON backup">
                        <button
                            type="button"
                            onClick={handleExportAll}
                            className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border transition-colors duration-150 select-none bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Export All</span>
                        </button>
                    </Tooltip>

                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black shadow-xs transition-colors cursor-pointer select-none"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Checklist</span>
                    </button>
                </div>
            </div>

            {/* Notification alert banner */}
            {feedbackMessage && (
                <div
                    className={`px-4 py-2 text-xs font-medium flex items-center justify-between rounded-sm border ${
                        feedbackMessage.type === "success"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50"
                            : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800/50"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        {feedbackMessage.type === "success" ? (
                            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                        <span>{feedbackMessage.text}</span>
                    </div>
                    <button
                        onClick={() => setFeedbackMessage(null)}
                        className="opacity-70 hover:opacity-100 p-0.5"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Main Content Area: Split Master-Detail Layout */}
            <div className="flex-1 flex min-h-0 border border-neutral-200 dark:border-geist-hairline rounded-sm overflow-hidden bg-white dark:bg-geist-surface shadow-xs">
                {/* Left Sidebar: Checklist Navigation & Filter */}
                <div className="w-80 md:w-88 border-r border-neutral-200 dark:border-geist-hairline flex flex-col bg-white dark:bg-geist-surface shrink-0">
                    {/* Search and Category Filter */}
                    <div className="p-3 border-b border-neutral-200 dark:border-geist-hairline space-y-2">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                            <input
                                type="text"
                                placeholder="Search checklists or aircraft..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-[#111] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Category chips */}
                        {categories.length > 2 && (
                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                                {categories.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-sm whitespace-nowrap transition-colors ${
                                            selectedCategory === cat
                                                ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                                : "bg-neutral-100 dark:bg-[#181818] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-[#222]"
                                        }`}
                                    >
                                        {cat === "ALL" ? "All" : cat}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Checklists List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                        {filteredChecklists.length === 0 ? (
                            <div className="p-6 text-center text-xs text-neutral-500">
                                <FileText className="w-8 h-8 mx-auto mb-2 text-neutral-300 dark:text-neutral-700" />
                                <p>No checklists found matching criteria.</p>
                            </div>
                        ) : (
                            filteredChecklists.map((chk) => {
                                const isSelected = activeChecklist?.id === chk.id;
                                const isActiveInSim = isChecklistActive(chk);
                                const stats = getChecklistStats(chk);

                                return (
                                    <button
                                        key={chk.id}
                                        onClick={() => setActiveChecklistId(chk.id)}
                                        className={`w-full text-left p-2.5 rounded-sm border transition-all duration-150 relative ${
                                            isSelected
                                                ? "bg-neutral-100/90 dark:bg-[#1c1c1c] border-neutral-400 dark:border-neutral-600 shadow-xs"
                                                : "bg-white dark:bg-geist-surface border-neutral-200/80 dark:border-geist-hairline/80 hover:bg-neutral-50 dark:hover:bg-[#181818]"
                                        } ${
                                            isActiveInSim
                                                ? "ring-1 ring-emerald-500/50 border-emerald-500/50"
                                                : ""
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-medium text-xs text-neutral-900 dark:text-[#ededed] truncate">
                                                        {chk.title}
                                                    </span>
                                                </div>
                                                {chk.aircraftAssociation && (
                                                    <div className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                                                        <Plane className="w-3 h-3 text-neutral-400 shrink-0" />
                                                        <span className="truncate">
                                                            {chk.aircraftAssociation}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {isActiveInSim && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 shrink-0">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Sim Active
                                                </span>
                                            )}
                                        </div>

                                        {/* Progress bar */}
                                        <div className="mt-2 space-y-1">
                                            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                                <span>
                                                    {stats.checked} / {stats.total} items
                                                </span>
                                                <span
                                                    className={
                                                        stats.isComplete
                                                            ? "text-emerald-500 font-semibold"
                                                            : ""
                                                    }
                                                >
                                                    {stats.percent}%
                                                </span>
                                            </div>
                                            <div className="w-full h-1 rounded-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 ${
                                                        stats.isComplete
                                                            ? "bg-emerald-500"
                                                            : "bg-neutral-900 dark:bg-white"
                                                    }`}
                                                    style={{ width: `${stats.percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Pane: Checklist Runner / Detail */}
                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-neutral-50 dark:bg-black">
                    {activeChecklist ? (
                        <div className="max-w-4xl w-full mx-auto p-6 space-y-6">
                            {/* Checklist Header card */}
                            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-5 shadow-xs space-y-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-[#ededed]">
                                                {activeChecklist.title}
                                            </h2>
                                            {isChecklistActive(activeChecklist) && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Connected In Sim
                                                </span>
                                            )}
                                            <span className="px-2 py-0.5 rounded-sm text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                                {activeChecklist.category}
                                            </span>
                                        </div>

                                        {activeChecklist.aircraftAssociation && (
                                            <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                                                <Plane className="w-3.5 h-3.5" />
                                                <span>
                                                    Linked Aircraft:{" "}
                                                    <strong className="text-neutral-700 dark:text-neutral-300">
                                                        {activeChecklist.aircraftAssociation}
                                                    </strong>
                                                </span>
                                            </div>
                                        )}

                                        {activeChecklist.description && (
                                            <p className="text-xs text-neutral-600 dark:text-neutral-400 pt-1">
                                                {activeChecklist.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Checklist Actions */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Tooltip
                                            content={
                                                !voiceCopilotMicGranted
                                                    ? "Configure Microphone & Voice Co-Pilot in Settings"
                                                    : copilot.isListening
                                                    ? "Stop Voice Co-Pilot (Listening)"
                                                    : "Start Interactive Hands-Free Voice Co-Pilot"
                                            }
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!voiceCopilotMicGranted) {
                                                        setSettingsActiveTab("settings-checklists");
                                                        setActiveView("settings");
                                                        return;
                                                    }
                                                    if (copilot.isListening) {
                                                        copilot.stopCopilot();
                                                    } else {
                                                        copilot.startCopilot();
                                                    }
                                                }}
                                                className={`h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-sm transition-all shadow-xs cursor-pointer select-none ${
                                                    copilot.isListening
                                                        ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/20"
                                                        : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                                                }`}
                                            >
                                                {copilot.isListening ? (
                                                    <Mic className="w-3.5 h-3.5 animate-pulse text-white" />
                                                ) : (
                                                    <MicOff className="w-3.5 h-3.5 opacity-80" />
                                                )}
                                                <span>
                                                    {copilot.isListening
                                                        ? "Co-Pilot Active"
                                                        : "Voice Co-Pilot"}
                                                </span>
                                            </button>
                                        </Tooltip>

                                        <Tooltip content="Reset all items in this checklist">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleResetChecklist(activeChecklist.id)
                                                }
                                                className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] border border-neutral-200 dark:border-geist-hairline rounded-sm transition-colors shadow-xs"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </button>
                                        </Tooltip>

                                        <Tooltip content="Duplicate checklist">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    duplicateChecklist(activeChecklist.id)
                                                }
                                                className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] border border-neutral-200 dark:border-geist-hairline rounded-sm transition-colors shadow-xs"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </Tooltip>

                                        <Tooltip content="Export this checklist as JSON">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleExportSingle(activeChecklist)
                                                }
                                                className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] border border-neutral-200 dark:border-geist-hairline rounded-sm transition-colors shadow-xs"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                        </Tooltip>

                                        <Tooltip content="Edit checklist">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openEditModal(activeChecklist)
                                                }
                                                className="p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#202020] border border-neutral-200 dark:border-geist-hairline rounded-sm transition-colors shadow-xs"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                        </Tooltip>

                                        <ConfirmDeleteButton
                                            onConfirm={() =>
                                                deleteChecklist(activeChecklist.id)
                                            }
                                            title="Delete checklist"
                                            confirmLabel="Confirm"
                                        />
                                    </div>
                                </div>

                                {/* Overall Progress Bar */}
                                {(() => {
                                    const stats = getChecklistStats(activeChecklist);
                                    return (
                                        <div className="pt-2 border-t border-neutral-100 dark:border-geist-hairline/60">
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                                                    Checklist Progression
                                                </span>
                                                <span
                                                    className={`font-semibold ${
                                                        stats.isComplete
                                                            ? "text-emerald-500"
                                                            : "text-neutral-600 dark:text-neutral-400"
                                                    }`}
                                                >
                                                    {stats.checked} of {stats.total} items (
                                                    {stats.percent}%)
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 ${
                                                        stats.isComplete
                                                            ? "bg-emerald-500"
                                                            : "bg-neutral-900 dark:bg-white"
                                                    }`}
                                                    style={{ width: `${stats.percent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Voice Co-Pilot Status & Interactive HUD */}
                            {copilot.isListening && (
                                <div className="p-3.5 px-4 bg-emerald-50/90 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-sm flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in duration-150">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium">
                                            {copilot.isSpeaking ? (
                                                <Volume2 className="w-4 h-4 text-emerald-600 animate-pulse" />
                                            ) : (
                                                <Mic className="w-4 h-4 text-emerald-600 animate-pulse" />
                                            )}
                                            <span>
                                                {copilot.isSpeaking
                                                    ? "Co-Pilot Speaking Challenge..."
                                                    : copilot.isPaused
                                                    ? `Paused at "${copilot.currentChallenge || "section"}" — Say "Resume checklist"`
                                                    : copilot.currentChallenge
                                                    ? `Challenge: "${copilot.currentChallenge}" — Awaiting Response`
                                                    : 'Say "<section> checklist" to begin (e.g. "Before Takeoff checklist")'}
                                            </span>
                                        </div>

                                        {copilot.micMode === "ptt" && (
                                            <span
                                                className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                                                    copilot.isPttActive
                                                        ? "bg-amber-500 text-white"
                                                        : "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                                                }`}
                                            >
                                                {copilot.isPttActive
                                                    ? "PTT Transmitting"
                                                    : `Hold [${formatKeyCodeLabel(copilot.pttKey)}] to Talk`}
                                            </span>
                                        )}

                                        {copilot.lastHeard && (
                                            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">
                                                Heard: "{copilot.lastHeard}"
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {copilot.currentChallenge && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={copilot.previousItem}
                                                    className="px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-sm text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                                >
                                                    Previous
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={copilot.repeatCurrentChallenge}
                                                    className="px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-sm text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                                >
                                                    Say Again
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={copilot.skipCurrentItem}
                                                    className="px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-sm text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                                >
                                                    Skip Item
                                                </button>
                                                {copilot.isPaused && (
                                                    <button
                                                        type="button"
                                                        onClick={copilot.resumeCopilot}
                                                        className="px-2.5 py-1 bg-emerald-600 text-white rounded-sm text-[11px] font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
                                                    >
                                                        Resume
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={copilot.stopCopilot}
                                            className="px-2.5 py-1 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/40 rounded-sm text-[11px] font-medium hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors cursor-pointer"
                                        >
                                            Stop Voice
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Checklist Sections */}
                            <div className="space-y-4">
                                {activeChecklist.sections.map((section, secIdx) => {
                                    const isCollapsed =
                                        collapsedSections[section.id] ?? false;
                                    const sectionTotal = section.items.length;
                                    const sectionChecked = section.items.filter(
                                        (i) => i.checked,
                                    ).length;
                                    const isSectionComplete =
                                        sectionTotal > 0 &&
                                        sectionChecked === sectionTotal;
                                    const proc = getProcedureStyles(section.procedureType);

                                    return (
                                        <div
                                            key={section.id}
                                            className={`bg-white dark:bg-geist-surface border rounded-sm overflow-hidden shadow-xs transition-colors ${proc.borderClass}`}
                                        >
                                            {/* Section Header */}
                                            <div
                                                className={`px-5 py-3.5 flex items-center justify-between cursor-pointer select-none transition-colors ${
                                                    isSectionComplete
                                                        ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                                                        : proc.headerHover
                                                }`}
                                                onClick={() =>
                                                    toggleSectionCollapse(section.id)
                                                }
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="text-neutral-400">
                                                        {isCollapsed ? (
                                                            <ChevronRight className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4" />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-sm font-semibold text-neutral-900 dark:text-[#ededed]">
                                                            {section.title}
                                                        </h3>
                                                        <span
                                                            className={`text-[10px] uppercase px-1.5 py-0.5 rounded-sm ${proc.badgeClass}`}
                                                        >
                                                            {proc.label}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div
                                                    className="flex items-center gap-3"
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-sm font-medium ${
                                                            isSectionComplete
                                                                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60"
                                                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                                                        }`}
                                                    >
                                                        {sectionChecked} / {sectionTotal}
                                                    </span>

                                                    {sectionChecked > 0 && (
                                                        <Tooltip content="Reset this section">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleResetSection(
                                                                        activeChecklist.id,
                                                                        section.id,
                                                                    )
                                                                }
                                                                className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-sm transition-colors"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                            </button>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Items List */}
                                            {!isCollapsed && (
                                                <div className="divide-y divide-neutral-100 dark:divide-geist-hairline/60">
                                                    {section.items.map((item) => {
                                                        const isChallenged =
                                                            copilot.activeItemId === item.id;
                                                        return (
                                                            <div
                                                                key={item.id}
                                                                onClick={() =>
                                                                    handleToggleItem(
                                                                        activeChecklist.id,
                                                                        section.id,
                                                                        item.id,
                                                                    )
                                                                }
                                                                className={`px-5 py-3 flex items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
                                                                    isChallenged
                                                                        ? "bg-emerald-50/70 dark:bg-emerald-950/30 ring-1 ring-inset ring-emerald-500/80"
                                                                        : item.checked
                                                                        ? "bg-neutral-50/60 dark:bg-neutral-900/40 opacity-75"
                                                                        : "hover:bg-neutral-50 dark:hover:bg-neutral-800/30"
                                                                }`}
                                                            >
                                                                {/* Checkbox & Challenge */}
                                                                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                                                                    <div
                                                                        className={`w-4 h-4 rounded-xs flex items-center justify-center transition-colors shrink-0 ${
                                                                            item.checked
                                                                                ? "bg-emerald-500 text-white"
                                                                                : "border border-neutral-300 dark:border-neutral-600 hover:border-neutral-500"
                                                                        }`}
                                                                    >
                                                                        {item.checked && (
                                                                            <Check className="w-3 h-3 stroke-[3]" />
                                                                        )}
                                                                    </div>

                                                                    <div className="flex-1 min-w-0">
                                                                        <div
                                                                            className={`text-xs font-semibold flex items-center gap-1.5 flex-wrap ${
                                                                                item.checked
                                                                                    ? "line-through text-neutral-400 dark:text-neutral-500"
                                                                                    : "text-neutral-900 dark:text-[#ededed]"
                                                                            }`}
                                                                        >
                                                                            <span>{item.challenge}</span>
                                                                            {isChallenged && (
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.2 rounded-xs">
                                                                                    <Volume2 className="w-3 h-3 animate-pulse" />
                                                                                    <span>Co-Pilot Challenge</span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {item.note && (
                                                                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 italic mt-0.5">
                                                                                {item.note}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Response Badge */}
                                                                <div className="shrink-0">
                                                                    <span
                                                                        className={`px-2 py-0.5 rounded-sm text-xs font-bold tracking-wide uppercase transition-colors ${
                                                                            item.checked
                                                                                ? "bg-neutral-100 dark:bg-neutral-800/80 text-neutral-400 dark:text-neutral-500"
                                                                                : "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-2xs"
                                                                        }`}
                                                                    >
                                                                        {item.response}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                            <ListChecks className="w-12 h-12 mb-3 text-neutral-300 dark:text-neutral-700" />
                            <h3 className="text-sm font-semibold mb-1 text-neutral-800 dark:text-neutral-200">
                                No Checklist Selected
                            </h3>
                            <p className="text-xs max-w-sm mb-4">
                                Select an aircraft checklist from the sidebar or create a
                                custom checklist.
                            </p>
                            <button
                                type="button"
                                onClick={openCreateModal}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black shadow-xs transition-colors cursor-pointer select-none"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Create Checklist</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Checklist Editor / Creator Modal */}
            {isEditorOpen && (
                <ChecklistEditorModal
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    initialData={editingChecklist}
                    availableAircraftOptions={availableAircraftOptions}
                    onSave={(saved) => {
                        if (editingChecklist) {
                            updateChecklist(editingChecklist.id, saved);
                        } else {
                            addChecklist(saved);
                        }
                        setIsEditorOpen(false);
                    }}
                />
            )}
        </div>
    );
};

interface ChecklistEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData: Checklist | null;
    availableAircraftOptions: string[];
    onSave: (data: Omit<Checklist, "id" | "createdAt" | "updatedAt">) => void;
}

const ChecklistEditorModal: React.FC<ChecklistEditorModalProps> = ({
    isOpen,
    onClose,
    initialData,
    availableAircraftOptions,
    onSave,
}) => {
    const [title, setTitle] = useState(initialData?.title || "");
    const [category, setCategory] = useState(
        initialData?.category || "Normal Procedures",
    );
    const [aircraftAssociation, setAircraftAssociation] = useState(
        initialData?.aircraftAssociation || "",
    );
    const [customAircraft, setCustomAircraft] = useState("");
    const [isCustomAircraft, setIsCustomAircraft] = useState(
        Boolean(
            initialData?.aircraftAssociation &&
                !availableAircraftOptions.includes(initialData.aircraftAssociation),
        ),
    );
    const [description, setDescription] = useState(
        initialData?.description || "",
    );
    const [sections, setSections] = useState<ChecklistSection[]>(
        initialData?.sections || [
            {
                id: `sec-${Date.now()}`,
                title: "Pre-Flight",
                procedureType: "normal",
                items: [
                    {
                        id: `it-${Date.now()}-1`,
                        challenge: "Parking Brake",
                        response: "SET",
                        note: "",
                    },
                ],
            },
        ],
    );

    if (!isOpen) return null;

    const handleAddSection = (procedureType: ChecklistProcedureType = "normal") => {
        setSections((prev) => [
            ...prev,
            {
                id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: `Section ${prev.length + 1}`,
                procedureType,
                items: [
                    {
                        id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        challenge: "Item Challenge",
                        response: "CHECK",
                        note: "",
                    },
                ],
            },
        ]);
    };

    const handleUpdateSectionProcedureType = (
        sectionIndex: number,
        procedureType: ChecklistProcedureType,
    ) => {
        setSections((prev) =>
            prev.map((sec, idx) =>
                idx === sectionIndex ? { ...sec, procedureType } : sec,
            ),
        );
    };

    const handleRemoveSection = (sectionIndex: number) => {
        setSections((prev) => prev.filter((_, idx) => idx !== sectionIndex));
    };

    const handleUpdateSectionTitle = (sectionIndex: number, newTitle: string) => {
        setSections((prev) =>
            prev.map((sec, idx) =>
                idx === sectionIndex ? { ...sec, title: newTitle } : sec,
            ),
        );
    };

    const handleAddItem = (sectionIndex: number) => {
        setSections((prev) =>
            prev.map((sec, idx) => {
                if (idx !== sectionIndex) return sec;
                return {
                    ...sec,
                    items: [
                        ...sec.items,
                        {
                            id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            challenge: "",
                            response: "CHECK",
                            note: "",
                        },
                    ],
                };
            }),
        );
    };

    const handleRemoveItem = (sectionIndex: number, itemIndex: number) => {
        setSections((prev) =>
            prev.map((sec, idx) => {
                if (idx !== sectionIndex) return sec;
                return {
                    ...sec,
                    items: sec.items.filter((_, iIdx) => iIdx !== itemIndex),
                };
            }),
        );
    };

    const handleUpdateItem = (
        sectionIndex: number,
        itemIndex: number,
        field: keyof ChecklistItem,
        value: string,
    ) => {
        setSections((prev) =>
            prev.map((sec, idx) => {
                if (idx !== sectionIndex) return sec;
                return {
                    ...sec,
                    items: sec.items.map((it, iIdx) => {
                        if (iIdx !== itemIndex) return it;
                        return { ...it, [field]: value };
                    }),
                };
            }),
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        const finalAircraft = isCustomAircraft
            ? customAircraft.trim()
            : aircraftAssociation.trim();

        onSave({
            title: title.trim(),
            category: category.trim() || "General",
            aircraftAssociation: finalAircraft || undefined,
            description: description.trim(),
            isDefault: initialData?.isDefault ?? false,
            sections: sections.filter((s) => s.items.length > 0 || s.title.trim()),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-neutral-200 dark:border-geist-hairline flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-neutral-900 dark:text-[#ededed]">
                            {initialData ? "Edit Checklist" : "Create New Checklist"}
                        </h2>
                        <p className="text-xs text-neutral-500">
                            Configure checklist title, aircraft link, sections and SOP
                            items.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Form */}
                <form
                    onSubmit={handleSubmit}
                    className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        {/* Title and Category */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                    Checklist Title *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Cessna 172 Skyhawk SOP"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-3 py-1.5 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                    Category
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Normal Procedures, Emergency, Quick Ref"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full px-3 py-1.5 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Aircraft Association: Select Menu populated from user logbook */}
                        <div className="space-y-2">
                            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                Associated Aircraft (Auto-highlights & sorts when flying
                                this plane)
                            </label>

                            <div className="flex items-center gap-3">
                                <select
                                    value={
                                        isCustomAircraft
                                            ? "__CUSTOM__"
                                            : aircraftAssociation
                                    }
                                    onChange={(e) => {
                                        if (e.target.value === "__CUSTOM__") {
                                            setIsCustomAircraft(true);
                                        } else {
                                            setIsCustomAircraft(false);
                                            setAircraftAssociation(e.target.value);
                                        }
                                    }}
                                    className="flex-1 px-3 py-1.5 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                >
                                    <option value="">-- No Aircraft Linked --</option>
                                    <optgroup label="Flown In Logbook / Sim">
                                        {availableAircraftOptions.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <option value="__CUSTOM__">
                                        + Enter Custom Aircraft Name...
                                    </option>
                                </select>
                            </div>

                            {isCustomAircraft && (
                                <div className="pt-1">
                                    <input
                                        type="text"
                                        placeholder="Type custom aircraft title (e.g. B738 PMDG)..."
                                        value={customAircraft}
                                        onChange={(e) =>
                                            setCustomAircraft(e.target.value)
                                        }
                                        className="w-full px-3 py-1.5 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                Description (Optional)
                            </label>
                            <textarea
                                rows={2}
                                placeholder="Short SOP overview or notes..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                            />
                        </div>

                        {/* Sections & Items Builder */}
                        <div className="space-y-4 pt-2 border-t border-neutral-200 dark:border-geist-hairline">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                                    Checklist Sections & Items
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => handleAddSection("normal")}
                                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-[#202020] dark:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer shadow-xs"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Section</span>
                                </button>
                            </div>

                            {sections.map((sec, secIdx) => (
                                <div
                                    key={sec.id}
                                    className={`p-4 rounded-sm border bg-neutral-50/60 dark:bg-[#181818] space-y-3 transition-colors ${
                                        sec.procedureType === "emergency"
                                            ? "border-rose-400 dark:border-rose-700/80 border-l-4 border-l-rose-600"
                                            : sec.procedureType === "abnormal"
                                              ? "border-amber-400 dark:border-amber-700/80 border-l-4 border-l-amber-500"
                                              : "border-neutral-200 dark:border-geist-hairline border-l-4 border-l-sky-500 dark:border-l-sky-400"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 flex-1">
                                            <span className="text-xs font-bold text-neutral-400">
                                                {secIdx + 1}.
                                            </span>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Section title (e.g. Before Start)"
                                                value={sec.title}
                                                onChange={(e) =>
                                                    handleUpdateSectionTitle(
                                                        secIdx,
                                                        e.target.value,
                                                    )
                                                }
                                                className="flex-1 px-2.5 py-1 text-xs font-semibold rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                            />

                                            <select
                                                value={sec.procedureType || "normal"}
                                                onChange={(e) =>
                                                    handleUpdateSectionProcedureType(
                                                        secIdx,
                                                        e.target.value as ChecklistProcedureType,
                                                    )
                                                }
                                                className={`h-7 px-2 text-[11px] font-semibold rounded-sm border transition-colors focus-visible:outline-none cursor-pointer ${
                                                    sec.procedureType === "emergency"
                                                        ? "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800"
                                                        : sec.procedureType === "abnormal"
                                                          ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                                                          : "bg-white dark:bg-black text-sky-700 dark:text-sky-300 border-neutral-300 dark:border-neutral-700"
                                                }`}
                                            >
                                                <option value="normal">Normal</option>
                                                <option value="abnormal">Abnormal</option>
                                                <option value="emergency">Emergency</option>
                                            </select>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveSection(secIdx)}
                                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-sm transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Items in section */}
                                    <div
                                        className={`space-y-2 pl-4 border-l-2 ${
                                            sec.procedureType === "emergency"
                                                ? "border-rose-300 dark:border-rose-900/60"
                                                : sec.procedureType === "abnormal"
                                                  ? "border-amber-300 dark:border-amber-900/60"
                                                  : "border-neutral-200 dark:border-neutral-800"
                                        }`}
                                    >
                                        {sec.items.map((item, itIdx) => (
                                            <div
                                                key={item.id}
                                                className="grid grid-cols-12 gap-2 items-center"
                                            >
                                                {/* Challenge name */}
                                                <div className="col-span-5">
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="Challenge / Item (e.g. Flaps)"
                                                        value={item.challenge}
                                                        onChange={(e) =>
                                                            handleUpdateItem(
                                                                secIdx,
                                                                itIdx,
                                                                "challenge",
                                                                e.target.value,
                                                             )
                                                        }
                                                        className="w-full px-2 py-1 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                                    />
                                                </div>

                                                {/* Target Response */}
                                                <div className="col-span-3">
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="Response (e.g. UP)"
                                                        value={item.response}
                                                        onChange={(e) =>
                                                            handleUpdateItem(
                                                                secIdx,
                                                                itIdx,
                                                                "response",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="w-full px-2 py-1 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                                    />
                                                </div>

                                                {/* Note */}
                                                <div className="col-span-3">
                                                    <input
                                                        type="text"
                                                        placeholder="Note (optional)"
                                                        value={item.note || ""}
                                                        onChange={(e) =>
                                                            handleUpdateItem(
                                                                secIdx,
                                                                itIdx,
                                                                "note",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="w-full px-2 py-1 text-xs rounded-sm border border-neutral-300 dark:border-geist-hairline bg-white dark:bg-black text-neutral-900 dark:text-white placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-400 transition-colors"
                                                    />
                                                </div>

                                                {/* Remove item */}
                                                <div className="col-span-1 flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleRemoveItem(
                                                                secIdx,
                                                                itIdx,
                                                            )
                                                        }
                                                        className="p-1 text-neutral-400 hover:text-red-500 rounded-sm transition-colors"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        <button
                                            type="button"
                                            onClick={() => handleAddItem(secIdx)}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white pt-1"
                                        >
                                            <Plus className="w-3 h-3" />
                                            <span>Add item to {sec.title || "section"}</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="px-6 py-4 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-black/60 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-[#202020] dark:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer select-none"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-900 enabled:hover:bg-neutral-800 dark:bg-white dark:enabled:hover:bg-neutral-200 text-white dark:text-black shadow-xs transition-colors cursor-pointer select-none"
                        >
                            {initialData ? "Save Changes" : "Create Checklist"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
