import React, { useState, useEffect } from "react";
import { useEfbStore } from "../../../store/efbStore";
import { QrCodeView } from "../../ui/QrCodeView";
import {
    RefreshCw,
    QrCode,
    ChevronDown,
    Copy,
    CheckCircle2,
    ExternalLink,
} from "lucide-react";

interface EfbCompanionTabProps {
    notifySaved: () => void;
}

export const EfbCompanionTab: React.FC<EfbCompanionTabProps> = ({ notifySaved }) => {
    const {
        status: efbStatus,
        fetchStatus: fetchEfbStatus,
        serverMode: efbServerMode,
        setServerMode: setEfbServerMode,
        customPort: efbCustomPort,
        setCustomPort: setEfbCustomPort,
        autoStartEfb,
    } = useEfbStore();

    const [isQrDrawerOpen, setIsQrDrawerOpen] = useState(false);
    const [efbPortInput, setEfbPortInput] = useState(
        efbCustomPort || (efbStatus.port ? String(efbStatus.port) : "24820"),
    );
    const [isCopiedEfbUrl, setIsCopiedEfbUrl] = useState(false);
    const [isSpinningPort, setIsSpinningPort] = useState(false);

    useEffect(() => {
        fetchEfbStatus();
    }, [fetchEfbStatus]);

    const efbCurrentMode = efbServerMode;

    const handleSetEfbMode = async (mode: "off" | "on" | "auto") => {
        try {
            await setEfbServerMode(mode);
            notifySaved();
        } catch (err) {
            console.error("Failed to update EFB server mode:", err);
        }
    };

    const handleEfbPortChange = async (val: string) => {
        setEfbPortInput(val);
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
            await setEfbCustomPort(val);
            notifySaved();
        }
    };

    const handleGenerateRandomEfbPort = async () => {
        setIsSpinningPort(true);
        const randomPort = Math.floor(10000 + Math.random() * 50000);
        setEfbPortInput(String(randomPort));
        await setEfbCustomPort(String(randomPort));
        notifySaved();
        setTimeout(() => setIsSpinningPort(false), 500);
    };

    const handleCopyEfbUrl = () => {
        if (!efbStatus.url) return;
        navigator.clipboard.writeText(efbStatus.url);
        setIsCopiedEfbUrl(true);
        setTimeout(() => setIsCopiedEfbUrl(false), 2000);
    };

    return (
        <div className="space-y-4">
            <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm divide-y divide-neutral-200 dark:divide-geist-hairline shadow-xs">
                {/* Preference: EFB Server State & Mode */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                EFB Server Mode
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Broadcast live telemetry and interactive charts to tablets or smartphones over your local Wi-Fi.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <div className="inline-flex items-center rounded-sm overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-300 dark:border-geist-hairline p-0.5 gap-1">
                            <button
                                type="button"
                                onClick={() => handleSetEfbMode("off")}
                                className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
                                    efbCurrentMode === "off"
                                        ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                }`}
                            >
                                Off
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetEfbMode("on")}
                                className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
                                    efbCurrentMode === "on"
                                        ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                }`}
                            >
                                On
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetEfbMode("auto")}
                                className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
                                    efbCurrentMode === "auto"
                                        ? "bg-neutral-900 text-white dark:bg-white dark:text-black shadow-xs"
                                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                                }`}
                            >
                                Auto-start
                            </button>
                        </div>
                    </div>
                </div>

                {/* Preference: Server Port */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Server Port
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            TCP port used for local HTTP service and device connection.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                        <input
                            type="number"
                            min="1024"
                            max="65535"
                            placeholder="24820"
                            value={efbPortInput}
                            onChange={(e) => handleEfbPortChange(e.target.value)}
                            disabled={efbStatus.isRunning}
                            className="w-28 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-black border border-neutral-300 dark:border-geist-hairline rounded-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:opacity-50 disabled:cursor-default"
                        />
                        <button
                            type="button"
                            onClick={handleGenerateRandomEfbPort}
                            disabled={efbStatus.isRunning}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-geist-hairline transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
                            title="Generate safe random port"
                        >
                            <RefreshCw
                                className={`w-3 h-3 text-neutral-500 ${
                                    isSpinningPort ? "animate-spin" : ""
                                }`}
                            />
                            <span>Random</span>
                        </button>
                    </div>
                </div>

                {/* Preference: QR Code View (Dropdown Drawer) */}
                <div className={`p-4 sm:p-5 flex flex-col justify-between gap-4 ${efbCurrentMode === "off" ? "opacity-50" : ""}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1 max-w-xl">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                    Device Pairing QR Code
                                </h3>
                            </div>
                            <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                                Open companion pairing QR Code and local Wi-Fi connection URL.
                            </p>
                        </div>

                        <div className="shrink-0 flex items-center">
                            <button
                                type="button"
                                onClick={() => setIsQrDrawerOpen(!isQrDrawerOpen)}
                                disabled={efbCurrentMode === "off"}
                                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm bg-neutral-100 enabled:hover:bg-neutral-200 dark:bg-[#202020] dark:enabled:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-geist-hairline transition-all duration-200 select-none cursor-pointer disabled:cursor-default disabled:opacity-50"
                            >
                                <QrCode className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                                <span className="whitespace-nowrap">
                                    QR Code
                                </span>
                                <ChevronDown
                                    className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ease-out ${
                                        isQrDrawerOpen ? "rotate-180" : ""
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Dropdown Drawer */}
                    {isQrDrawerOpen && (
                        <div className="pt-4 border-t border-neutral-200 dark:border-geist-hairline flex flex-col sm:flex-row items-center gap-5">
                            {efbStatus.isRunning && efbStatus.url ? (
                                <>
                                    <div className="shrink-0">
                                        <QrCodeView value={efbStatus.url} size={150} className="rounded-sm"/>
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                                            Point your iPad, tablet, or smartphone camera at this QR code while connected to your local Wi-Fi network.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <code className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-neutral-100 dark:bg-black/50 border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white select-all">
                                                {efbStatus.url}
                                            </code>
                                            <button
                                                type="button"
                                                onClick={handleCopyEfbUrl}
                                                className="p-1.5 rounded-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                                title="Copy URL"
                                            >
                                                {isCopiedEfbUrl ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="w-full py-4 text-center rounded-sm bg-neutral-50 dark:bg-black/30 border border-dashed border-neutral-200 dark:border-geist-hairline text-xs text-neutral-500 dark:text-geist-muted">
                                    EFB server is currently stopped. Turn server <strong className="text-neutral-700 dark:text-neutral-300">On</strong> or <strong className="text-neutral-700 dark:text-neutral-300">Auto-start</strong> to generate your Wi-Fi pairing QR code.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Preference: Open EFB in Browser */}
                <div className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${efbCurrentMode === "off" ? "opacity-50" : ""}`}>
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-white">
                                Browser Preview
                            </h3>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted leading-relaxed">
                            Test or view the Electronic Flight Bag interface directly in your desktop browser.
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center">
                        <a
                            href={efbStatus.isRunning && efbStatus.url ? efbStatus.url : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            role="button"
                            aria-disabled={!efbStatus.isRunning || !efbStatus.url}
                            onClick={(e) => {
                                if (!efbStatus.isRunning || !efbStatus.url) {
                                    e.preventDefault();
                                }
                            }}
                            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm border border-neutral-300 dark:border-geist-hairline transition-all duration-200 select-none ${
                                efbStatus.isRunning && efbStatus.url
                                    ? "bg-neutral-100 hover:bg-neutral-200 dark:bg-[#202020] dark:hover:bg-[#2a2a2a] text-neutral-800 dark:text-neutral-200 cursor-pointer"
                                    : "bg-neutral-100 dark:bg-[#202020] text-neutral-400 dark:text-neutral-500 opacity-50 cursor-default pointer-events-none"
                            }`}
                        >
                            <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
                            <span>Open in Browser</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
