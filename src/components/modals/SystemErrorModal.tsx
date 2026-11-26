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

    const iconStyle = isError
        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
        : isWarning
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";

    return (
        <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="system-error-title"
            aria-describedby="system-error-desc"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
        >
            <div className="w-full max-w-md bg-white dark:bg-geist-surface rounded-sm shadow-2xl border border-neutral-200 dark:border-geist-hairline overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 font-sans">
                {/* Header */}
                <div className="px-5 py-4 border-b border-neutral-200 dark:border-geist-hairline bg-neutral-50/60 dark:bg-[#0c0c0c] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className={`p-2 rounded-sm flex items-center justify-center shrink-0 border ${iconStyle}`}
                        >
                            {isError && <AlertTriangle className="w-4 h-4" />}
                            {isWarning && <AlertCircle className="w-4 h-4" />}
                            {!isError && !isWarning && <Info className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex flex-col">
                            <span
                                id="system-error-title"
                                className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white truncate"
                            >
                                {title}
                            </span>
                            <span className="text-[11px] font-medium text-neutral-500 dark:text-geist-muted">
                                {isError ? "System Alert" : isWarning ? "Notice" : "Information"}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={dismissSystemError}
                        className="p-1 rounded-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-geist-cardHover transition-colors shrink-0"
                        aria-label="Close dialog"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-3 select-text">
                    <p
                        id="system-error-desc"
                        className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed"
                    >
                        {message}
                    </p>

                    {details && (
                        <div className="pt-1">
                            <button
                                type="button"
                                onClick={() => setShowDetails((prev) => !prev)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
                            >
                                <span>{showDetails ? "Hide technical details" : "Show technical details"}</span>
                                {showDetails ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                )}
                            </button>

                            {showDetails && (
                                <pre className="mt-2 p-3 bg-neutral-50 dark:bg-geist-card rounded-sm text-[11px] font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto whitespace-pre-wrap break-all border border-neutral-200 dark:border-geist-hairline max-h-40">
                                    {details}
                                </pre>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-geist-hairline bg-neutral-50/60 dark:bg-[#0c0c0c] flex items-center justify-end gap-2">
                    {onAction && actionLabel && (
                        <button
                            type="button"
                            onClick={() => {
                                onAction();
                                dismissSystemError();
                            }}
                            className="px-3.5 py-1.5 rounded-xs text-xs font-medium bg-neutral-900 dark:bg-white text-white dark:text-black hover:opacity-90 transition-all shadow-xs"
                        >
                            {actionLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={dismissSystemError}
                        className="px-3.5 py-1.5 rounded-xs text-xs font-medium border border-neutral-200 dark:border-geist-hairline bg-white dark:bg-geist-card text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-geist-cardHover transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};
