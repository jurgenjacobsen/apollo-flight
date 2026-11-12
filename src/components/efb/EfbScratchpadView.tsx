import React from "react";
import { useEfbStore } from "../../store/efbStore";
import { ClipboardEdit, Trash2 } from "lucide-react";

export const EfbScratchpadView: React.FC = () => {
    const { scratchpad, updateScratchpad, clearScratchpad } = useEfbStore();

    return (
        <div className="flex flex-col h-full w-full p-4 md:p-6 overflow-y-auto select-none space-y-4 bg-neutral-50 dark:bg-black font-sans">
            {/* Header & Quick Clear */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ClipboardEdit className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        ATC Clearance Scratchpad
                    </h3>
                </div>
                <button
                    onClick={() => {
                        if (window.confirm("Clear all scratchpad clearances and notes?")) {
                            clearScratchpad();
                        }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline hover:border-red-300 dark:hover:border-red-900/60 shadow-xs transition-colors"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                </button>
            </div>

            {/* Quick ATC Tiles Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 font-mono">
                {/* ATIS Info */}
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium mb-1">
                        ATIS Info
                    </label>
                    <input
                        type="text"
                        maxLength={2}
                        placeholder="e.g. B"
                        value={scratchpad.atis}
                        onChange={(e) => updateScratchpad({ atis: e.target.value.toUpperCase() })}
                        className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-base font-bold uppercase text-center text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* Assigned Runway */}
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium mb-1">
                        Runway
                    </label>
                    <input
                        type="text"
                        maxLength={4}
                        placeholder="e.g. 28R"
                        value={scratchpad.runway}
                        onChange={(e) => updateScratchpad({ runway: e.target.value.toUpperCase() })}
                        className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-base font-bold uppercase text-center text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* Squawk XPDR */}
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium mb-1">
                        Squawk (XPDR)
                    </label>
                    <input
                        type="text"
                        maxLength={4}
                        placeholder="e.g. 4721"
                        value={scratchpad.squawk}
                        onChange={(e) => updateScratchpad({ squawk: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-base font-bold text-center text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* Altimeter / QNH */}
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium mb-1">
                        Altimeter
                    </label>
                    <input
                        type="text"
                        maxLength={6}
                        placeholder="29.92"
                        value={scratchpad.altimeter}
                        onChange={(e) => updateScratchpad({ altimeter: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-base font-bold text-center text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* Initial Assigned Altitude */}
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium mb-1">
                        Initial Alt (FT)
                    </label>
                    <input
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 5000"
                        value={scratchpad.assignedAltitude}
                        onChange={(e) => updateScratchpad({ assignedAltitude: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-base font-bold text-center text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* Departure Freq */}
                <div className="p-3 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium mb-1">
                        Dep Freq
                    </label>
                    <input
                        type="text"
                        maxLength={7}
                        placeholder="124.75"
                        value={scratchpad.departureFreq}
                        onChange={(e) => updateScratchpad({ departureFreq: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-base font-bold text-center text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>
            </div>

            {/* Clearance Route */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs font-mono">
                <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium block mb-1.5">
                    Clearance Limit / SID / Route
                </label>
                <input
                    type="text"
                    placeholder="e.g. CLEARED TO LFMN VIA GVA 1N, CLIMB FL100, SQUAWK 4721"
                    value={scratchpad.clearanceRoute}
                    onChange={(e) => updateScratchpad({ clearanceRoute: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-sm font-semibold uppercase text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Freeform Pilot Notes Textarea */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex-1 flex flex-col font-mono min-h-[160px]">
                <label className="text-[10px] text-neutral-400 dark:text-geist-muted uppercase font-sans font-medium block mb-1.5">
                    Taxi Clearances & Pilot Scratchpad Notes
                </label>
                <textarea
                    rows={6}
                    placeholder="e.g. Taxi via Charlie, cross 09, hold short Bravo..."
                    value={scratchpad.notes}
                    onChange={(e) => updateScratchpad({ notes: e.target.value })}
                    className="w-full flex-1 p-3 rounded-lg border border-neutral-200 dark:border-geist-hairline bg-neutral-50 dark:bg-neutral-950 text-sm resize-none text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500 leading-relaxed font-mono"
                />
            </div>
        </div>
    );
};
