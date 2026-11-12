import React, { useState, useEffect, useRef } from "react";
import { useFlightStore } from "../../store/flightStore";
import packageJson from "../../../package.json";
import rawChangelog from "../../data/changelog.json";
import {
    Sparkles,
    Download,
    RefreshCw,
    Check,
    CheckCheck,
    X,
    Calendar,
    ChevronDown,
    ChevronUp,
    Settings,
    Newspaper,
    AlertCircle,
    Info,
    Tag,
} from "lucide-react";

export interface ChangelogItem {
    title: string;
    description: string;
    badge?: string;
    date?: string;
    "date:"?: string;
    type: "any" | "version" | "important";
}

const STORAGE_KEY = "apollo_changelog_read_ids";

// Safe, lightweight markdown renderer without dangerouslySetInnerHTML
export const renderChangelogMarkdown = (text: string): React.ReactNode => {
    if (!text) return null;

    const lines = text.split("\n");
    return lines.map((line, lineIndex) => {
        // Match **bold**, __underline__, ~~strike~~, *italic*
        const tokenRegex = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*)/g;
        const parts = line.split(tokenRegex);

        return (
            <React.Fragment key={lineIndex}>
                {parts.map((part, partIndex) => {
                    if (
                        part.startsWith("**") &&
                        part.endsWith("**") &&
                        part.length >= 4
                    ) {
                        return (
                            <strong
                                key={partIndex}
                                className="font-semibold text-neutral-900 dark:text-white"
                            >
                                {part.slice(2, -2)}
                            </strong>
                        );
                    }
                    if (
                        part.startsWith("__") &&
                        part.endsWith("__") &&
                        part.length >= 4
                    ) {
                        return (
                            <span
                                key={partIndex}
                                className="underline underline-offset-2"
                            >
                                {part.slice(2, -2)}
                            </span>
                        );
                    }
                    if (
                        part.startsWith("~~") &&
                        part.endsWith("~~") &&
                        part.length >= 4
                    ) {
                        return (
                            <span
                                key={partIndex}
                                className="line-through opacity-75"
                            >
                                {part.slice(2, -2)}
                            </span>
                        );
                    }
                    if (
                        part.startsWith("*") &&
                        part.endsWith("*") &&
                        part.length >= 2
                    ) {
                        return (
                            <em key={partIndex} className="italic">
                                {part.slice(1, -1)}
                            </em>
                        );
                    }
                    return part;
                })}
                {lineIndex < lines.length - 1 && <br />}
            </React.Fragment>
        );
    });
};

export const parseChangelogDate = (dateStr?: string): string => {
    if (!dateStr) return "";
    // Matches DD-MM-YYYY@HH:mm in UTC
    const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})@(\d{2}):(\d{2})$/);
    let dateObj: Date;

    if (match) {
        const [, day, month, year, hours, minutes] = match;
        dateObj = new Date(
            Date.UTC(
                Number(year),
                Number(month) - 1,
                Number(day),
                Number(hours),
                Number(minutes),
            ),
        );
    } else {
        dateObj = new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`);
    }

    if (isNaN(dateObj.getTime())) return dateStr;

    const formattedDate = dateObj.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
    const formattedTime = dateObj.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    return `${formattedDate} · ${formattedTime}`;
};

export const getItemKey = (item: ChangelogItem, index: number): string => {
    const rawDate = item.date || item["date:"] || "";
    return `${item.type}-${item.badge || "nobadge"}-${rawDate}-${item.title}`
        .replace(/\s+/g, "_")
        .toLowerCase();
};

interface NewsDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export const NewsDropdown: React.FC<NewsDropdownProps> = ({
    isOpen,
    onClose,
    triggerRef,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const changelog = (rawChangelog as ChangelogItem[]) || [];

    const {
        availableUpdate,
        isInstallingUpdate,
        downloadProgress,
        installUpdate,
        setActiveView,
    } = useFlightStore();

    const [isUpdateExpanded, setIsUpdateExpanded] = useState(false);

    // Read IDs from localStorage
    const [readIds, setReadIds] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch {
            return new Set();
        }
    });

    const saveReadIds = (newSet: Set<string>) => {
        setReadIds(newSet);
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(Array.from(newSet)),
            );
        } catch (e) {
            console.error("Failed to persist changelog read status:", e);
        }
    };

    const toggleMarkAsRead = (id: string) => {
        const next = new Set(readIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        saveReadIds(next);
    };

    const markAllAsRead = () => {
        const next = new Set(readIds);
        changelog.forEach((item, index) => {
            next.add(getItemKey(item, index));
        });
        saveReadIds(next);
    };

    // Close on click outside or escape
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose, triggerRef]);

    if (!isOpen) return null;

    const unreadCount = changelog.filter(
        (item, index) => !readIds.has(getItemKey(item, index)),
    ).length;

    const currentAppVersion = packageJson.version.trim().replace(/^v/i, "");

    return (
        <div
            ref={dropdownRef}
            role="dialog"
            aria-label="News and notifications"
            className="absolute right-0 top-full mt-2 w-[370px] sm:w-[422px] max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#161616] border border-neutral-200 dark:border-geist-hairline rounded-md shadow-2xl z-50 overflow-hidden animate-dropdown-smooth"
        >
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-neutral-50/70 dark:bg-[#1a1a1a]/70 border-b border-neutral-200 dark:border-geist-hairline flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Newspaper className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                    <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                        News & Updates
                    </span>
                    {unreadCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/60">
                            {unreadCount} new
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={markAllAsRead}
                            className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white px-2 py-0.5 rounded-sm hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                            Mark all read
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Scrollable Container */}
            <div className="max-h-[30rem] overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/80">
                {/* Available Software Update Notification Card */}
                {availableUpdate && (
                    <div className="p-3.5 bg-emerald-50/40 dark:bg-emerald-950/15 border-b border-emerald-200/60 dark:border-emerald-800/30">
                        <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5">
                                <div className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                                    <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <div className="flex items-center flex-wrap gap-1.5">
                                        <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">
                                            Apollo Flight v{availableUpdate.version}
                                        </h4>
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
                                            Ready to install
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-1 leading-relaxed">
                                        A new version is available for download and update.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Collapsible Release Notes if available */}
                        {availableUpdate.body && (
                            <div className="mt-2 text-left">
                                <button
                                    type="button"
                                    onClick={() => setIsUpdateExpanded(!isUpdateExpanded)}
                                    className="inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
                                >
                                    <span>{isUpdateExpanded ? "Hide notes" : "View release notes"}</span>
                                    {isUpdateExpanded ? (
                                        <ChevronUp className="w-3 h-3" />
                                    ) : (
                                        <ChevronDown className="w-3 h-3" />
                                    )}
                                </button>
                                {isUpdateExpanded && (
                                    <div className="mt-1.5 p-2 rounded bg-white/70 dark:bg-black/40 border border-neutral-200 dark:border-geist-hairline text-[11px] text-neutral-700 dark:text-neutral-300 whitespace-pre-line font-mono max-h-36 overflow-y-auto leading-relaxed">
                                        {availableUpdate.body}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="mt-3 flex items-center gap-2">
                            {isInstallingUpdate ? (
                                <div className="flex items-center gap-2 bg-neutral-200 dark:bg-[#202020] px-3 py-1.5 rounded-sm text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>
                                        {downloadProgress !== null
                                            ? `Downloading ${downloadProgress}%...`
                                            : "Installing update..."}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={installUpdate}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Update & Restart</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveView("settings");
                                            onClose();
                                        }}
                                        className="px-2.5 py-1.5 rounded-sm text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                                    >
                                        Settings
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Changelog Items */}
                {changelog.length === 0 && !availableUpdate ? (
                    <div className="p-8 text-center text-xs text-neutral-500 dark:text-geist-muted">
                        No news or changelog announcements available.
                    </div>
                ) : (
                    changelog.map((item, index) => {
                        const itemKey = getItemKey(item, index);
                        const isRead = readIds.has(itemKey);
                        const rawDate = item.date || item["date:"] || "";
                        const formattedDate = parseChangelogDate(rawDate);

                        // Badge logic
                        let badgeText: string | null = null;
                        let badgeClass =
                            "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-geist-hairline";

                        const isVersionFormat =
                            item.badge &&
                            /^v?\d+(\.\d+)+$/i.test(item.badge.trim());

                        if (item.type === "version") {
                            if (isVersionFormat && item.badge) {
                                const cleanBadge = item.badge
                                    .trim()
                                    .replace(/^v/i, "");
                                if (cleanBadge === currentAppVersion) {
                                    badgeText = `Latest version - ${cleanBadge}`;
                                    badgeClass =
                                        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20";
                                } else {
                                    badgeText = `${cleanBadge}`;
                                }
                            } else if (item.badge) {
                                badgeText = item.badge;
                            }
                        } else if (item.type === "important") {
                            badgeText = "!";
                            badgeClass =
                                "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
                        } else if (item.badge) {
                            badgeText = item.badge;
                        }

                        return (
                            <div
                                key={itemKey}
                                className={`p-3.5 transition-colors text-left ${
                                    isRead
                                        ? "opacity-65 hover:opacity-100 bg-transparent"
                                        : "bg-neutral-50/30 dark:bg-neutral-900/20"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2.5">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        {/* Title & Badges */}
                                        <div className="flex items-center flex-wrap gap-1.5">
                                            <h4
                                                className={`text-xs font-semibold leading-tight ${
                                                    isRead
                                                        ? "text-neutral-700 dark:text-neutral-300"
                                                        : "text-neutral-900 dark:text-white"
                                                }`}
                                            >
                                                {item.title}
                                            </h4>

                                            {badgeText && (
                                                <span
                                                    className={`px-1.5 py-0.2 rounded-sm text-[10px] font-medium tracking-tight whitespace-nowrap ${badgeClass}`}
                                                >
                                                    {badgeText}
                                                </span>
                                            )}
                                        </div>

                                        {/* Date */}
                                        {formattedDate && (
                                            <div className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                                                <Calendar className="w-3 h-3 shrink-0" />
                                                <span>{formattedDate}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Mark as read button */}
                                    <button
                                        type="button"
                                        onClick={() => toggleMarkAsRead(itemKey)}
                                        className={`shrink-0 p-1 rounded-sm border transition-colors cursor-pointer ${
                                            isRead
                                                ? "border-transparent text-emerald-600 dark:text-emerald-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                                : "border-neutral-200 dark:border-geist-hairline text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                        }`}
                                        title={
                                            isRead
                                                ? "Mark as unread"
                                                : "Mark as read"
                                        }
                                        aria-label={
                                            isRead
                                                ? "Mark as unread"
                                                : "Mark as read"
                                        }
                                    >
                                        {isRead ? (
                                            <CheckCheck className="w-3.5 h-3.5" />
                                        ) : (
                                            <Check className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                </div>

                                {/* Description with inline markdown */}
                                <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-sans">
                                    {renderChangelogMarkdown(item.description)}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer with App Version Info */}
            <div className="px-3 py-2 bg-neutral-50/80 dark:bg-[#141414] border-t border-neutral-200 dark:border-geist-hairline flex items-center justify-between text-[11px] text-neutral-500 dark:text-geist-muted">
                <span>Apollo Flight</span>
                <span>Version {packageJson.version}</span>
            </div>
        </div>
    );
};
