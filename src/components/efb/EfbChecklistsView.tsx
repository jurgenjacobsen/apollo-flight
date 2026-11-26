import React from "react";
import { useEfbStore } from "../../store/efbStore";
import { ListChecks, Check, RotateCcw } from "lucide-react";

export const EfbChecklistsView: React.FC = () => {
    const {
        checklists,
        toggleChecklistItem,
        resetChecklistGroup,
        resetAllChecklists,
    } = useEfbStore();

    return (
        <div className="flex flex-col h-full w-full p-4 md:p-6 overflow-y-auto select-none space-y-4 bg-neutral-50 dark:bg-black font-sans">
            {/* Header & Reset All */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        Normal Flight Checklists
                    </h3>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        if (window.confirm("Reset all checklists?")) {
                            resetAllChecklists();
                        }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-amber-600 dark:hover:text-amber-400 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline hover:border-amber-300 dark:hover:border-amber-900/60 shadow-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All</span>
                </button>
            </div>

            {/* Checklist Groups */}
            <div className="space-y-3">
                {checklists.map((group) => {
                    const completedCount = group.items.filter((i) => i.checked).length;
                    const totalCount = group.items.length;
                    const isAllDone = completedCount === totalCount;
                    const percent = Math.round((completedCount / totalCount) * 100);

                    return (
                        <div
                            key={group.id}
                            className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs space-y-3 transition-colors duration-150"
                        >
                            {/* Group Header & Progress */}
                            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-geist-hairline pb-2.5">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            isAllDone
                                                ? "bg-emerald-500"
                                                : completedCount > 0
                                                  ? "bg-amber-500"
                                                  : "bg-neutral-300 dark:bg-neutral-700"
                                        }`}
                                    />
                                    <span className="font-semibold text-sm text-neutral-900 dark:text-white">
                                        {group.title}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <span className="text-xs text-neutral-500 dark:text-geist-muted tabular-nums">
                                        {completedCount} / {totalCount} ({percent}%)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => resetChecklistGroup(group.id)}
                                        title="Reset group"
                                        aria-label={`Reset ${group.title}`}
                                        className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors duration-150 p-1 rounded-sm hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className={`h-full transition-[width] duration-200 ease-out ${
                                        isAllDone
                                            ? "bg-emerald-500"
                                            : "bg-blue-500"
                                    }`}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>

                            {/* Checklist Items Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                {group.items.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => toggleChecklistItem(group.id, item.id)}
                                        className={`flex items-center justify-between p-2.5 rounded-sm border text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer ${
                                            item.checked
                                                ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 font-medium"
                                                : "bg-neutral-100/70 dark:bg-[#1a1a1a] border-neutral-200 dark:border-geist-hairline text-neutral-800 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-700"
                                        }`}
                                    >
                                        <span className="text-xs mr-2">
                                            {item.label}
                                        </span>
                                        <div
                                            className={`w-4 h-4 shrink-0 rounded-xs flex items-center justify-center border transition-colors duration-150 ${
                                                item.checked
                                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                                    : "border-neutral-300 dark:border-neutral-700 bg-white dark:bg-geist-surface"
                                            }`}
                                        >
                                            {item.checked && <Check className="w-3 h-3 stroke-[3]" />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
