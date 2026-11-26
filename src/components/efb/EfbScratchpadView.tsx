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
                    <ClipboardEdit className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        ATC Clearance Scratchpad
                    </h3>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        if (window.confirm("Clear all scratchpad clearances and notes?")) {
                            clearScratchpad();
                        }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline hover:border-red-300 dark:hover:border-red-900/60 shadow-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                </button>
            </div>

            {/* Quick ATC Tiles Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {/* ATIS Info */}
                <div className="p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium mb-1.5">
                        ATIS Info
                    </label>
                    <input
                        type="text"
                        maxLength={2}
                        placeholder="B"
                        value={scratchpad.atis}
                        onChange={(e) => updateScratchpad({ atis: e.target.value.toUpperCase() })}
                        className="w-full px-2.5 py-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-base font-semibold uppercase text-center tabular-nums text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
                    />
                </div>

                {/* Assigned Runway */}
                <div className="p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium mb-1.5">
                        Runway
                    </label>
                    <input
                        type="text"
                        maxLength={4}
                        placeholder="28R"
                        value={scratchpad.runway}
                        onChange={(e) => updateScratchpad({ runway: e.target.value.toUpperCase() })}
                        className="w-full px-2.5 py-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-base font-semibold uppercase text-center tabular-nums text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
                    />
                </div>

                {/* Squawk XPDR */}
                <div className="p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium mb-1.5">
                        Squawk (XPDR)
                    </label>
                    <input
                        type="text"
                        maxLength={4}
                        placeholder="4721"
                        value={scratchpad.squawk}
                        onChange={(e) => updateScratchpad({ squawk: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-base font-semibold text-center tabular-nums text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
                    />
                </div>

                {/* Altimeter / QNH */}
                <div className="p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium mb-1.5">
                        Altimeter
                    </label>
                    <input
                        type="text"
                        maxLength={6}
                        placeholder="29.92"
                        value={scratchpad.altimeter}
                        onChange={(e) => updateScratchpad({ altimeter: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-base font-semibold text-center tabular-nums text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
                    />
                </div>

                {/* Initial Assigned Altitude */}
                <div className="p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium mb-1.5">
                        Initial Alt (ft)
                    </label>
                    <input
                        type="text"
                        maxLength={6}
                        placeholder="5000"
                        value={scratchpad.assignedAltitude}
                        onChange={(e) => updateScratchpad({ assignedAltitude: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-base font-semibold text-center tabular-nums text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
                    />
                </div>

                {/* Departure Freq */}
                <div className="p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex flex-col justify-between">
                    <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium mb-1.5">
                        Dep Freq
                    </label>
                    <input
                        type="text"
                        maxLength={7}
                        placeholder="124.75"
                        value={scratchpad.departureFreq}
                        onChange={(e) => updateScratchpad({ departureFreq: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-base font-semibold text-center tabular-nums text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
                    />
                </div>
            </div>

            {/* Clearance Route */}
            <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs">
                <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium block mb-1.5">
                    Clearance Limit / SID / Route
                </label>
                <input
                    type="text"
                    placeholder="e.g. CLEARED TO LFMN VIA GVA 1N, CLIMB FL100, SQUAWK 4721"
                    value={scratchpad.clearanceRoute}
                    onChange={(e) => updateScratchpad({ clearanceRoute: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-sm font-medium uppercase font-mono text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
                />
            </div>

            {/* Freeform Pilot Notes Textarea */}
            <div className="p-4 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-surface shadow-xs flex-1 flex flex-col min-h-[160px]">
                <label className="text-[11px] text-neutral-500 dark:text-geist-muted font-medium block mb-1.5">
                    Taxi Clearances & Pilot Scratchpad Notes
                </label>
                <textarea
                    rows={6}
                    placeholder="e.g. Taxi via Charlie, cross 09, hold short Bravo..."
                    value={scratchpad.notes}
                    onChange={(e) => updateScratchpad({ notes: e.target.value })}
                    className="w-full flex-1 p-3 rounded-sm border border-neutral-200 dark:border-geist-hairline bg-neutral-100 dark:bg-[#1a1a1a] text-sm resize-none text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400 leading-relaxed font-sans"
                />
            </div>
        </div>
    );
};
