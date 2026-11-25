import React, { useState } from "react";
import { useFlightStore } from "../../store/flightStore";
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp } from "lucide-react";

export const SystemErrorModal: React.FC = () => {
    const { systemModalError, dismissSystemError } = useFlightStore();
    const [showDetails, setShowDetails] = useState(false);

    if (!systemModalError) return null;

    const {
        title,
        message,
        details,
        type = "error",
        actionLabel,
        onAction,
    } = systemModalError;

    const isError = type === "error";
    const isWarning = type === "warning";

    return (
        <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="system-error-title"
            aria-describedby="system-error-desc"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
            <div className="w-full max-w-md bg-white dark:bg-[#111111] rounded-2xl shadow-2xl border border-neutral-200 dark:border-[#222222] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-5 pb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                isError
                                    ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-900/50"
                                    : isWarning
                                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900/50"
                                    : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-900/50"
                            }`}
                        >
                            {isError && <AlertTriangle className="w-5 h-5" />}
                            {isWarning && <AlertCircle className="w-5 h-5" />}
                            {!isError && !isWarning && <Info className="w-5 h-5" />}
                        </div>
                        <div>
                            <h3
                                id="system-error-title"
                                className="text-sm font-semibold text-neutral-900 dark:text-white"
                            >
                                {title}
                            </h3>
                            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                {isError ? "System Alert" : isWarning ? "Notice" : "Information"}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={dismissSystemError}
                        className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors"
                        aria-label="Close dialog"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-2 space-y-3">
                    <p
                        id="system-error-desc"
                        className="text-xs text-neutral-600 dark:text-[#aaaaaa] leading-relaxed"
                    >
                        {message}
                    </p>

                    {details && (
                        <div className="pt-1">
                            <button
                                type="button"
                                onClick={() => setShowDetails((prev) => !prev)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                            >
                                <span>{showDetails ? "Hide technical details" : "Show technical details"}</span>
                                {showDetails ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                )}
                            </button>

                            {showDetails && (
                                <pre className="mt-2 p-2.5 bg-neutral-100 dark:bg-[#1a1a1a] rounded-lg text-[10px] font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto whitespace-pre-wrap break-all border border-neutral-200 dark:border-[#2a2a2a] max-h-36">
                                    {details}
                                </pre>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 px-5 mt-2 border-t border-neutral-100 dark:border-[#222222] bg-neutral-50/50 dark:bg-[#141414] flex items-center justify-end gap-2">
                    {onAction && actionLabel && (
                        <button
                            type="button"
                            onClick={() => {
                                onAction();
                                dismissSystemError();
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity shadow-xs"
                        >
                            {actionLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={dismissSystemError}
                        className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-200 dark:border-[#333333] text-neutral-700 dark:text-[#cccccc] hover:bg-neutral-100 dark:hover:bg-[#222222] transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};
