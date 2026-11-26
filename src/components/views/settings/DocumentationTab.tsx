import React, { useState } from "react";
import { useFlightStore, safeInvoke } from "../../../store/flightStore";
import { FolderOpen, Plus, Trash2 } from "lucide-react";

interface DocumentationTabProps {
    notifySaved: () => void;
}

export const DocumentationTab: React.FC<DocumentationTabProps> = ({ notifySaved }) => {
    const {
        docCustomDirs,
        docLiveUpdate,
        setDocCustomDirs,
        setDocLiveUpdate,
    } = useFlightStore();

    const [manualDocDir, setManualDocDir] = useState("");

    return (
        <div className="space-y-4">
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                {/* Live Update Toggle */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Live Update Documentation Indexing
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            When enabled, the app continuously syncs files added to your documentation folders. Disabling pauses background checks and only indexes documents when opening the view.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={docLiveUpdate}
                            onClick={async () => {
                                await setDocLiveUpdate(!docLiveUpdate);
                                notifySaved();
                            }}
                            aria-label="Toggle live update documentation indexing"
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                                docLiveUpdate
                                    ? "bg-neutral-900 dark:bg-white"
                                    : "bg-neutral-300 dark:bg-[#333333]"
                            }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black shadow-xs ring-0 transition duration-200 ease-in-out ${
                                    docLiveUpdate
                                        ? "translate-x-4"
                                        : "translate-x-0"
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Custom Folders Directory Selector */}
                <div className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 max-w-xl">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Custom Documentation Directories
                            </h3>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                Give the app access to fetch and render .md and .pdf files from your own aircraft manuals, charts, or briefing folders.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await safeInvoke("open_user_docs_folder");
                                    } catch {}
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200 transition-colors shadow-xs"
                            >
                                <FolderOpen className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                                <span>Open User Docs Folder</span>
                            </button>

                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        const sel = await safeInvoke<string | null>("open_directory_dialog");
                                        if (sel && !docCustomDirs.includes(sel)) {
                                            await setDocCustomDirs([...docCustomDirs, sel]);
                                            notifySaved();
                                        }
                                    } catch {}
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-neutral-100 transition-colors shadow-xs"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Browse Folder</span>
                            </button>
                        </div>
                    </div>

                    {/* Manual Path Entry Input */}
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={manualDocDir}
                            onChange={(e) => setManualDocDir(e.target.value)}
                            placeholder="Or paste directory path (e.g. C:\FlightSim\Checklists or D:\Charts)..."
                            className="flex-1 px-3 py-1.5 text-xs rounded-sm bg-neutral-50 dark:bg-[#111111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                            onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                    const trimmed = manualDocDir.trim();
                                    if (trimmed && !docCustomDirs.includes(trimmed)) {
                                        await setDocCustomDirs([...docCustomDirs, trimmed]);
                                        setManualDocDir("");
                                        notifySaved();
                                    }
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={async () => {
                                const trimmed = manualDocDir.trim();
                                if (trimmed && !docCustomDirs.includes(trimmed)) {
                                    await setDocCustomDirs([...docCustomDirs, trimmed]);
                                    setManualDocDir("");
                                    notifySaved();
                                }
                            }}
                            disabled={!manualDocDir.trim()}
                            className="px-3 py-1.5 text-xs font-medium rounded-sm border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200 disabled:opacity-40 transition-colors"
                        >
                            Add Directory
                        </button>
                    </div>

                    {/* Active Directory List */}
                    {docCustomDirs.length > 0 ? (
                        <div className="space-y-1.5 pt-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                                Indexed Custom Folders ({docCustomDirs.length})
                            </span>
                            <div className="space-y-1">
                                {docCustomDirs.map((dir) => (
                                    <div
                                        key={dir}
                                        className="flex items-center justify-between p-2 rounded-sm bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-geist-hairline text-xs"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FolderOpen className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                            <span className="text-[11px] text-neutral-800 dark:text-neutral-200 truncate">
                                                {dir}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                await setDocCustomDirs(docCustomDirs.filter((d) => d !== dir));
                                                notifySaved();
                                            }}
                                            className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-2 shrink-0"
                                            title="Remove folder from index"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 rounded-sm bg-neutral-50 dark:bg-[#141414] border border-dashed border-neutral-200 dark:border-geist-hairline text-center text-xs text-neutral-400">
                            No custom directories added yet. Files in the default /user-docs and /docs folders are indexed automatically.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
