import React, { Component, ErrorInfo, ReactNode } from "react";
import { safeInvoke } from "../../store/flightStore";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("[ErrorBoundary] Caught error:", error, errorInfo);
        safeInvoke("log_client_message", {
            level: "error",
            message: `${error.name}: ${error.message}\nStack: ${error.stack || ""}`,
            context: `ErrorBoundary: ${errorInfo.componentStack?.slice(0, 300) || "unknown"}`,
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-neutral-50 dark:bg-black text-neutral-900 dark:text-white font-sans h-full min-h-[300px]">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400 mb-4 border border-red-200 dark:border-red-900/50">
                        <AlertTriangle className="w-6 h-6" />
                    </div>

                    <h2 className="text-base font-semibold mb-1">
                        {this.props.fallbackTitle || "Something went wrong in this page"}
                    </h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mb-4">
                        An unexpected error occurred while rendering. You can try refreshing the page.
                    </p>

                    {this.state.error?.message && (
                        <div className="mb-4 max-w-lg w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-2.5 text-left font-mono text-[11px] text-red-600 dark:text-red-400 overflow-x-auto break-all">
                            {this.state.error.message}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={this.handleReset}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Try Again</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="px-3 py-1.5 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300"
                        >
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
