import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useFlightStore, safeInvoke } from "../../store/flightStore";
import { DocFileRecord, DocFileContent } from "../../types/documentation";
import {
    FileText,
    FolderOpen,
    Search,
    Tag,
    Clock,
    RefreshCw,
    Edit3,
    ExternalLink,
    Filter,
    Calendar,
    HardDrive,
    Sparkles,
    Check,
    X,
    ChevronRight,
    BookOpen,
    Info,
    AlertCircle,
    SlidersHorizontal,
    Plus,
} from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { Select, SelectOption } from "../ui/Select";
import { Checkbox } from "../ui/Checkbox";

const TYPE_OPTIONS: SelectOption<string>[] = [
    { value: "all", label: "All Formats" },
    { value: "md", label: "Markdown (.md)" },
    { value: "pdf", label: "PDF (.pdf)" },
];

const SOURCE_OPTIONS: SelectOption<string>[] = [
    { value: "all", label: "All Sources" },
    { value: "user-docs", label: "User Docs" },
    { value: "docs", label: "App" },
    { value: "custom", label: "Custom" },
];

const SORT_OPTIONS: SelectOption<"latest" | "title" | "modified" | "size">[] = [
    { value: "latest", label: "Latest Seen" },
    { value: "title", label: "Title (A-Z)" },
    { value: "modified", label: "Modified" },
    { value: "size", label: "Size" },
];

function areDocListsEqual(a: DocFileRecord[], b: DocFileRecord[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const itemA = a[i];
        const itemB = b[i];
        if (
            itemA.path !== itemB.path ||
            itemA.name !== itemB.name ||
            itemA.sizeBytes !== itemB.sizeBytes ||
            itemA.modified !== itemB.modified ||
            itemA.source !== itemB.source ||
            itemA.extension !== itemB.extension ||
            itemA.title !== itemB.title ||
            itemA.lastSeen !== itemB.lastSeen ||
            (itemA.tags?.length || 0) !== (itemB.tags?.length || 0)
        ) {
            return false;
        }
        if (itemA.tags && itemB.tags) {
            for (let t = 0; t < itemA.tags.length; t++) {
                if (itemA.tags[t] !== itemB.tags[t]) return false;
            }
        }
    }
    return true;
}

function formatDisplayPath(file: DocFileRecord): string {
    const forwardPath = file.path.replace(/\\/g, "/");

    if (file.source === "docs") {
        const docsIdx = forwardPath.lastIndexOf("/docs/");
        if (docsIdx !== -1) {
            const rel = forwardPath.slice(docsIdx + "/docs/".length);
            return `@app/docs/${rel}`;
        }
        if (forwardPath.startsWith("docs/")) {
            const rel = forwardPath.slice("docs/".length);
            return `@app/docs/${rel}`;
        }
        return `@app/docs/${file.name}`;
    }

    if (file.source === "user-docs") {
        const userDocsIdx = forwardPath.lastIndexOf("/user-docs/");
        if (userDocsIdx !== -1) {
            const rel = forwardPath.slice(userDocsIdx + "/user-docs/".length);
            return `@user-docs/${rel}`;
        }
        return `@user-docs/${file.name}`;
    }

    return forwardPath;
}

// Custom Markdown Parser matching Apollo Flight UI theme
function MarkdownRenderer({ content }: { content: string }) {
    const lines = useMemo(() => content.split("\n"), [content]);

    const renderedNodes = useMemo(() => {
        const nodes: React.ReactNode[] = [];
        let inCodeBlock = false;
        let codeBlockLang = "";
        let codeBlockLines: string[] = [];
        let inTable = false;
        let tableHeader: string[] = [];
        let tableRows: string[][] = [];

        const flushCodeBlock = (key: string) => {
            if (codeBlockLines.length > 0) {
                nodes.push(
                    <div
                        key={key}
                        className="my-3 rounded border border-neutral-200 dark:border-geist-hairline bg-neutral-900 text-neutral-100 overflow-hidden text-xs"
                    >
                        {codeBlockLang && (
                            <div className="px-3 py-1 bg-neutral-800 text-[10px] uppercase tracking-wider text-neutral-400 font-medium border-b border-neutral-700">
                                {codeBlockLang}
                            </div>
                        )}
                        <pre className="p-3 overflow-x-auto leading-relaxed">
                            <code>{codeBlockLines.join("\n")}</code>
                        </pre>
                    </div>,
                );
                codeBlockLines = [];
                codeBlockLang = "";
            }
        };

        const renderInline = (text: string): React.ReactNode => {
            // Tokenize **bold**, `code`, [link](url), *italic*
            const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g);
            return tokens.map((tok, i) => {
                if (tok.startsWith("**") && tok.endsWith("**")) {
                    return (
                        <strong key={i} className="font-semibold text-neutral-900 dark:text-white">
                            {tok.slice(2, -2)}
                        </strong>
                    );
                }
                if (tok.startsWith("`") && tok.endsWith("`")) {
                    return (
                        <code
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700"
                        >
                            {tok.slice(1, -1)}
                        </code>
                    );
                }
                if (tok.startsWith("*") && tok.endsWith("*")) {
                    return (
                        <em key={i} className="italic text-neutral-700 dark:text-neutral-300">
                            {tok.slice(1, -1)}
                        </em>
                    );
                }
                const linkMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if (linkMatch) {
                    return (
                        <a
                            key={i}
                            href={linkMatch[2]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                        >
                            {linkMatch[1]}
                            <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                    );
                }
                return tok;
            });
        };

        const flushTable = (key: string) => {
            if (tableHeader.length > 0) {
                nodes.push(
                    <div
                        key={key}
                        className="my-3 overflow-x-auto rounded border border-neutral-200 dark:border-geist-hairline"
                    >
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 font-semibold text-neutral-700 dark:text-neutral-300">
                                    {tableHeader.map((th, idx) => (
                                        <th key={idx} className="p-2.5">
                                            {renderInline(th.trim())}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                                {tableRows.map((tr, rIdx) => (
                                    <tr
                                        key={rIdx}
                                        className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                                    >
                                        {tr.map((td, cIdx) => (
                                            <td key={cIdx} className="p-2.5 text-neutral-800 dark:text-neutral-200">
                                                {renderInline(td.trim())}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>,
                );
                tableHeader = [];
                tableRows = [];
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith("```")) {
                if (inCodeBlock) {
                    inCodeBlock = false;
                    flushCodeBlock(`cb-${i}`);
                } else {
                    inCodeBlock = true;
                    codeBlockLang = line.replace("```", "").trim();
                }
                continue;
            }

            if (inCodeBlock) {
                codeBlockLines.push(line);
                continue;
            }

            // Table detection
            if (line.includes("|") && line.trim().startsWith("|") && line.trim().endsWith("|")) {
                const cells = line.split("|").slice(1, -1);
                if (!inTable) {
                    inTable = true;
                    tableHeader = cells;
                } else if (line.includes("---")) {
                    // separator line, skip
                } else {
                    tableRows.push(cells);
                }
                continue;
            } else if (inTable) {
                inTable = false;
                flushTable(`tbl-${i}`);
            }

            // Headings
            if (line.startsWith("# ")) {
                nodes.push(
                    <h1
                        key={`h1-${i}`}
                        className="text-xl font-bold text-neutral-900 dark:text-white mt-8 mb-4 pb-2 border-b border-neutral-200 dark:border-geist-hairline tracking-tight select-text first:mt-0"
                    >
                        {renderInline(line.replace("# ", ""))}
                    </h1>,
                );
                continue;
            }
            if (line.startsWith("## ")) {
                nodes.push(
                    <h2
                        key={`h2-${i}`}
                        className="text-base font-bold text-neutral-900 dark:text-white mt-7 mb-3 pb-1 border-b border-neutral-100 dark:border-geist-hairline tracking-tight select-text first:mt-0"
                    >
                        {renderInline(line.replace("## ", ""))}
                    </h2>,
                );
                continue;
            }
            if (line.startsWith("### ")) {
                nodes.push(
                    <h3
                        key={`h3-${i}`}
                        className="text-sm font-semibold text-neutral-900 dark:text-white mt-6 mb-2.5 tracking-tight select-text first:mt-0"
                    >
                        {renderInline(line.replace("### ", ""))}
                    </h3>,
                );
                continue;
            }

            // Blockquotes & Callouts
            if (line.startsWith("> ")) {
                const quoteText = line.replace("> ", "");
                let alertColor = "border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 text-neutral-700 dark:text-neutral-300";
                if (quoteText.includes("[!NOTE]") || quoteText.includes("[!INFO]")) {
                    alertColor = "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300";
                } else if (quoteText.includes("[!WARNING]") || quoteText.includes("[!CAUTION]")) {
                    alertColor = "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300";
                } else if (quoteText.includes("[!TIP]")) {
                    alertColor = "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300";
                }

                nodes.push(
                    <div
                        key={`bq-${i}`}
                        className={`my-4 p-3.5 border-l-2 rounded-r text-xs leading-relaxed select-text ${alertColor}`}
                    >
                        {renderInline(quoteText.replace(/\[!(NOTE|INFO|WARNING|CAUTION|TIP)\]/g, ""))}
                    </div>,
                );
                continue;
            }

            // Horizontal rule
            if (line.trim() === "---" || line.trim() === "***") {
                nodes.push(
                    <hr key={`hr-${i}`} className="my-6 border-neutral-200 dark:border-neutral-800" />,
                );
                continue;
            }

            // Unordered list items
            if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
                const itemText = line.trim().slice(2);
                nodes.push(
                    <div key={`li-${i}`} className="flex items-start gap-2 my-2.5 text-xs text-neutral-700 dark:text-neutral-300 pl-2 select-text">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600 mt-1.5 shrink-0" />
                        <span className="leading-relaxed">{renderInline(itemText)}</span>
                    </div>,
                );
                continue;
            }

            // Checkbox items
            if (line.trim().startsWith("- [ ] ") || line.trim().startsWith("- [x] ")) {
                const checked = line.trim().startsWith("- [x] ");
                const itemText = line.trim().slice(6);
                nodes.push(
                    <div key={`chk-${i}`} className="flex items-center gap-2.5 my-2.5 text-xs text-neutral-700 dark:text-neutral-300 pl-1 select-text">
                        <Checkbox
                            checked={checked}
                            disabled
                            className="pointer-events-none select-none shrink-0"
                        />
                        <span className={`leading-relaxed ${checked ? "line-through opacity-70" : ""}`}>
                            {renderInline(itemText)}
                        </span>
                    </div>,
                );
                continue;
            }

            // Normal paragraphs
            if (line.trim().length > 0) {
                nodes.push(
                    <p
                        key={`p-${i}`}
                        className="my-3 text-xs md:text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 select-text"
                    >
                        {renderInline(line)}
                    </p>,
                );
            }
        }

        if (inCodeBlock) flushCodeBlock("cb-final");
        if (inTable) flushTable("tbl-final");

        return nodes;
    }, [lines]);

    return <div className="space-y-1.5 select-text selection:bg-neutral-200 dark:selection:bg-neutral-800">{renderedNodes}</div>;
}

function LastSeenBadge({ isoStr }: { isoStr?: string }) {
    const formatLastSeen = (raw?: string) => {
        if (!raw) return "Never viewed";
        try {
            const date = new Date(raw);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < 1) return "Just now";
            if (diffMins < 60) return `${diffMins}m ago`;
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${diffHours}h ago`;
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString();
        } catch {
            return "Unknown";
        }
    };

    const text = formatLastSeen(isoStr);

    return (
        <span className="inline-flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-400 select-none">
            <Clock className="w-2.5 h-2.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <span
                key={text}
                className="inline-block animate-badge-fade transition-all duration-300"
            >
                {text}
            </span>
        </span>
    );
}

export function DocumentationView() {
    const {
        docCustomDirs,
        docLiveUpdate,
        setActiveView,
        setSettingsActiveTab,
        docActiveFilePath,
        setDocActiveFilePath,
        docContentCache,
        setDocCachedContent,
    } = useFlightStore();
    const [files, setFiles] = useState<DocFileRecord[]>([]);
    const [selectedFile, setSelectedFile] = useState<DocFileRecord | null>(null);
    const [fileContent, setFileContent] = useState<DocFileContent | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedSource, setSelectedSource] = useState<string>("all");
    const [selectedType, setSelectedType] = useState<string>("all");
    const [selectedTag, setSelectedTag] = useState<string>("all");
    const [sortBy, setSortBy] = useState<"latest" | "title" | "modified" | "size">("latest");

    // Metadata Edit Dialog State
    const [editingDoc, setEditingDoc] = useState<DocFileRecord | null>(null);
    const [editTitle, setEditTitle] = useState<string>("");
    const [editTagsInput, setEditTagsInput] = useState<string>("");
    const [isSavingMeta, setIsSavingMeta] = useState<boolean>(false);

    // Stable snapshot of last-seen timestamps during this page visit to prevent items jumping to top while viewing
    const initialLastSeenRef = useRef<Map<string, number>>(new Map());

    // Fetch and index files
    const loadIndexedFiles = useCallback(async () => {
        setIsRefreshing(true);
        const startTime = Date.now();
        try {
            const records = await safeInvoke<DocFileRecord[]>("get_documentation_files", {
                customDirs: docCustomDirs || [],
            });
            if (Array.isArray(records)) {
                records.forEach((r) => {
                    if (!initialLastSeenRef.current.has(r.path)) {
                        const seen = r.lastSeen || r.last_seen;
                        initialLastSeenRef.current.set(
                            r.path,
                            seen ? new Date(seen).getTime() : 0,
                        );
                    }
                });

                setFiles((prevFiles) => {
                    if (areDocListsEqual(prevFiles, records)) {
                        return prevFiles;
                    }
                    return records;
                });

                setSelectedFile((prevSelected) => {
                    if (!prevSelected) {
                        if (docActiveFilePath) {
                            const found = records.find((r) => r.path === docActiveFilePath);
                            if (found) return found;
                        }
                        return records.length > 0 ? records[0] : null;
                    }
                    const match = records.find((r) => r.path === prevSelected.path);
                    if (!match) {
                        return records.length > 0 ? records[0] : null;
                    }
                    if (
                        match.title !== prevSelected.title ||
                        match.lastSeen !== prevSelected.lastSeen ||
                        match.sizeBytes !== prevSelected.sizeBytes ||
                        (match.tags?.length || 0) !== (prevSelected.tags?.length || 0)
                    ) {
                        return match;
                    }
                    return prevSelected;
                });
            }
        } catch (err) {
            console.error("Failed to fetch documentation files:", err);
        } finally {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 650 - elapsed);
            if (remaining > 0) {
                setTimeout(() => {
                    setIsRefreshing(false);
                    setIsInitialLoading(false);
                }, remaining);
            } else {
                setIsRefreshing(false);
                setIsInitialLoading(false);
            }
        }
    }, [docCustomDirs, docActiveFilePath]);

    useEffect(() => {
        loadIndexedFiles();
    }, [docCustomDirs]);

    // Live update polling if enabled
    useEffect(() => {
        if (!docLiveUpdate) return;
        const interval = setInterval(() => {
            loadIndexedFiles();
        }, 15000);
        return () => clearInterval(interval);
    }, [docLiveUpdate, loadIndexedFiles]);

    // Load file content when a file is selected (with instant caching)
    useEffect(() => {
        if (!selectedFile) {
            setFileContent(null);
            return;
        }

        setDocActiveFilePath(selectedFile.path);

        const nowIso = new Date().toISOString();
        // Optimistically update in-memory state so "Just now" appears right away
        setFiles((prev) =>
            prev.map((f) =>
                f.path === selectedFile.path
                    ? { ...f, lastSeen: nowIso, last_seen: nowIso }
                    : f,
            ),
        );
        setSelectedFile((prev) =>
            prev && prev.path === selectedFile.path
                ? { ...prev, lastSeen: nowIso, last_seen: nowIso }
                : prev,
        );

        // Record last seen in database asynchronously
        safeInvoke("record_document_opened", { filePath: selectedFile.path }).catch(() => {});

        // 1. Check in-memory store cache first
        const cached = docContentCache[selectedFile.path];
        if (cached) {
            setFileContent(cached);
            setIsLoadingContent(false);
            return;
        }

        // 2. Cache miss -> load from disk
        let isMounted = true;
        setIsLoadingContent(true);

        const fetchContent = async () => {
            try {
                const content = await safeInvoke<DocFileContent>("read_document_file", {
                    filePath: selectedFile.path,
                });
                if (isMounted && content) {
                    setFileContent(content);
                    setDocCachedContent(selectedFile.path, content);
                }
            } catch (err) {
                console.error("Failed to read document:", err);
            } finally {
                if (isMounted) setIsLoadingContent(false);
            }
        };

        fetchContent();
        return () => {
            isMounted = false;
        };
    }, [selectedFile?.path, docContentCache, setDocActiveFilePath, setDocCachedContent]);

    // Collect all available tags across indexed files
    const allTags = useMemo(() => {
        const set = new Set<string>();
        files.forEach((f) => {
            f.tags?.forEach((t) => {
                if (t.trim()) set.add(t.trim());
            });
        });
        return Array.from(set).sort();
    }, [files]);

    // If active tag filter no longer exists in available tags, automatically reset to "all"
    useEffect(() => {
        if (selectedTag !== "all" && !allTags.includes(selectedTag)) {
            setSelectedTag("all");
        }
    }, [selectedTag, allTags]);

    // Filter and sort files
    const filteredFiles = useMemo(() => {
        return files
            .filter((file) => {
                // Search query
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const titleMatch = (file.title || "").toLowerCase().includes(q);
                    const nameMatch = file.name.toLowerCase().includes(q);
                    const tagMatch = file.tags?.some((t) => t.toLowerCase().includes(q));
                    const pathMatch = file.path.toLowerCase().includes(q);
                    if (!titleMatch && !nameMatch && !tagMatch && !pathMatch) return false;
                }

                // Source filter
                if (selectedSource !== "all" && file.source !== selectedSource) return false;

                // Type filter
                if (selectedType !== "all" && file.extension !== selectedType) return false;

                // Tag filter
                if (selectedTag !== "all") {
                    if (!file.tags || !file.tags.includes(selectedTag)) return false;
                }

                return true;
            })
            .sort((a, b) => {
                if (sortBy === "latest") {
                    const timeA =
                        initialLastSeenRef.current.get(a.path) ??
                        (a.lastSeen || a.last_seen ? new Date((a.lastSeen || a.last_seen)!).getTime() : 0);
                    const timeB =
                        initialLastSeenRef.current.get(b.path) ??
                        (b.lastSeen || b.last_seen ? new Date((b.lastSeen || b.last_seen)!).getTime() : 0);
                    if (timeA !== timeB) return timeB - timeA;
                    return (a.title || a.name).localeCompare(b.title || b.name);
                }
                if (sortBy === "title") {
                    return (a.title || a.name).localeCompare(b.title || b.name);
                }
                if (sortBy === "modified") {
                    const modA = a.modified ? new Date(a.modified).getTime() : 0;
                    const modB = b.modified ? new Date(b.modified).getTime() : 0;
                    return modB - modA;
                }
                if (sortBy === "size") {
                    const sizeA = a.sizeBytes ?? a.size_bytes ?? 0;
                    const sizeB = b.sizeBytes ?? b.size_bytes ?? 0;
                    return sizeB - sizeA;
                }
                return 0;
            });
    }, [files, searchQuery, selectedSource, selectedType, selectedTag, sortBy]);

    const handleOpenUserDocsFolder = async () => {
        try {
            await safeInvoke("open_user_docs_folder");
        } catch (err) {
            console.error("Failed to open user-docs folder:", err);
        }
    };

    const handleStartEditMeta = (doc: DocFileRecord, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setEditingDoc(doc);
        setEditTitle(doc.title || doc.name.replace(/\.[^/.]+$/, ""));
        setEditTagsInput((doc.tags || []).join(", "));
    };

    const handleSaveMeta = async () => {
        if (!editingDoc) return;
        setIsSavingMeta(true);
        try {
            const tags = editTagsInput
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            await safeInvoke("save_document_metadata", {
                filePath: editingDoc.path,
                title: editTitle.trim() || null,
                tags,
            });

            // Update in-memory state immediately
            setFiles((prev) =>
                prev.map((f) =>
                    f.path === editingDoc.path
                        ? {
                              ...f,
                              title: editTitle.trim() || undefined,
                              tags,
                          }
                        : f,
                ),
            );

            if (selectedFile?.path === editingDoc.path) {
                setSelectedFile((prev) =>
                    prev
                        ? {
                              ...prev,
                              title: editTitle.trim() || undefined,
                              tags,
                          }
                        : null,
                );
            }
            setEditingDoc(null);
        } catch (err) {
            console.error("Failed to save metadata:", err);
        } finally {
            setIsSavingMeta(false);
        }
    };

    const formatFileSize = (bytes?: number) => {
        if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 font-sans overflow-hidden select-none">
            {/* Header & Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-geist-hairline">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-sm bg-neutral-100 dark:bg-geist-card border border-neutral-200 dark:border-geist-hairline">
                        <BookOpen className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
                            Documentation & Briefings
                        </h1>
                        <p className="text-xs text-neutral-500 dark:text-geist-muted mt-0.5">
                            Read bundled app manuals, aircraft SOPs, and custom flight briefings in Markdown (.md) or PDF
                        </p>
                    </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
                    <Tooltip content="Open your %APPDATA%/user-docs directory in Windows Explorer to drop in new files">
                        <button
                            type="button"
                            onClick={handleOpenUserDocsFolder}
                            className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs transition-colors duration-150 select-none cursor-pointer"
                        >
                            <FolderOpen className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Open User Docs</span>
                        </button>
                    </Tooltip>

                    <Tooltip content="Configure custom documentation directories and live update preferences">
                        <button
                            type="button"
                            onClick={() => {
                                setSettingsActiveTab("settings-documentation");
                                setActiveView("settings");
                            }}
                            className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-sm border bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs transition-colors duration-150 select-none cursor-pointer"
                        >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-500" />
                            <span>Options</span>
                        </button>
                    </Tooltip>

                    <button
                        type="button"
                        onClick={loadIndexedFiles}
                        disabled={isRefreshing}
                        className="h-8 inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-sm border bg-white dark:bg-geist-surface hover:bg-neutral-100 dark:hover:bg-[#1f1f1f] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-geist-hairline shadow-xs transition-colors duration-150 disabled:opacity-70 select-none cursor-pointer"
                        title={isRefreshing ? "Checking for updates..." : "Refresh indexed files"}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-200 ${isRefreshing ? "animate-spin text-blue-500" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Main Content Area: Split Master-Detail Layout */}
            <div className="flex-1 flex min-h-0 border border-neutral-200 dark:border-geist-hairline rounded-sm overflow-hidden bg-white dark:bg-geist-surface shadow-xs">
                {/* Left File Browser Deck */}
                <div className="w-80 md:w-88 lg:w-96 border-r border-neutral-200 dark:border-geist-hairline flex flex-col bg-white dark:bg-geist-surface shrink-0">
                    {/* Search & Filter Controls */}
                    <div className="p-3 border-b border-neutral-200 dark:border-geist-hairline space-y-2 shrink-0">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search documents by title or tag..."
                                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-sm bg-neutral-50 dark:bg-[#111111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        {/* Filter Selects Row using custom Select component */}
                        <div className="grid grid-cols-3 gap-1.5">
                            <Select
                                value={selectedType}
                                onChange={(val) => setSelectedType(val)}
                                options={TYPE_OPTIONS}
                                size="sm"
                                ariaLabel="Filter by file format"
                            />
                            <Select
                                value={selectedSource}
                                onChange={(val) => setSelectedSource(val)}
                                options={SOURCE_OPTIONS}
                                size="sm"
                                ariaLabel="Filter by document source"
                            />
                            <Select
                                value={sortBy}
                                onChange={(val) => setSortBy(val as any)}
                                options={SORT_OPTIONS}
                                size="sm"
                                ariaLabel="Sort documents"
                            />
                        </div>

                        {/* Tag Chips Row */}
                        {allTags.length > 0 && (
                            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px]">
                                <button
                                    type="button"
                                    onClick={() => setSelectedTag("all")}
                                    className={`px-2 py-0.5 rounded font-medium transition-colors shrink-0 ${
                                        selectedTag === "all"
                                            ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                                    }`}
                                >
                                    All Tags
                                </button>
                                {allTags.map((tag) => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => setSelectedTag(tag === selectedTag ? "all" : tag)}
                                        className={`px-2 py-0.5 rounded font-medium transition-colors shrink-0 flex items-center gap-1 ${
                                            selectedTag === tag
                                                ? "bg-blue-600 text-white dark:bg-blue-500"
                                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                                        }`}
                                    >
                                        <Tag className="w-2.5 h-2.5" />
                                        <span>{tag}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* File List Items */}
                    <div className="flex-1 overflow-y-auto">
                        {isInitialLoading && files.length === 0 ? (
                            <div className="p-8 text-center text-xs text-neutral-500 space-y-2">
                                <RefreshCw className="w-4 h-4 animate-spin mx-auto text-neutral-400" />
                                <p>Scanning documentation folders...</p>
                            </div>
                        ) : filteredFiles.length === 0 ? (
                            <div className="p-8 text-center text-xs text-neutral-500 space-y-3">
                                <FileText className="w-6 h-6 mx-auto text-neutral-400" />
                                <div>
                                    <p className="font-semibold text-neutral-700 dark:text-neutral-300">
                                        {files.length > 0 ? "No matching documents" : "No documents found"}
                                    </p>
                                    <p className="text-[11px] text-neutral-400 mt-1">
                                        {files.length > 0
                                            ? "Try clearing your search query or resetting active filters."
                                            : "Drop your .md or .pdf files into the User Docs directory or add custom directories in Settings."}
                                    </p>
                                </div>
                                {files.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery("");
                                            setSelectedType("all");
                                            setSelectedSource("all");
                                            setSelectedTag("all");
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium text-[11px] hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        <span>Reset All Filters</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleOpenUserDocsFolder}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium text-[11px] hover:bg-blue-100 transition-colors"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                        <span>Open User Docs Folder</span>
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredFiles.map((file) => {
                                const isSelected = selectedFile?.path === file.path;
                                return (
                                    <div
                                        key={file.path}
                                        onClick={() => setSelectedFile(file)}
                                        className={`p-3 text-left transition-colors cursor-pointer group relative border-b border-neutral-100 dark:border-neutral-800/80 ${
                                            isSelected
                                                ? "bg-blue-50/70 dark:bg-blue-950/25"
                                                : "hover:bg-neutral-50 dark:hover:bg-[#161616]"
                                        }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600 dark:bg-blue-400" />
                                        )}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                                                    {file.title || file.name}
                                                </h3>
                                                {file.title && file.title !== file.name && (
                                                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                                                        {file.name}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Edit Metadata Button on Hover */}
                                            <button
                                                type="button"
                                                onClick={(e) => handleStartEditMeta(file, e)}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-opacity"
                                                title="Edit document title and tags"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {/* Badges & Meta info */}
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                                            <span
                                                className={`px-1.5 py-0.2 rounded font-medium ${
                                                    file.source === "user-docs"
                                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
                                                        : file.source === "docs"
                                                        ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700"
                                                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700"
                                                }`}
                                            >
                                                {file.source === "user-docs"
                                                    ? "User"
                                                    : file.source === "docs"
                                                    ? "App"
                                                    : "Custom"}
                                            </span>

                                            <span className="text-neutral-400 tabular-nums">
                                                {formatFileSize(file.sizeBytes ?? file.size_bytes)}
                                            </span>

                                            <span className="text-neutral-300 dark:text-neutral-700">·</span>

                                            <LastSeenBadge isoStr={file.lastSeen || file.last_seen} />

                                            {/* Tag badges */}
                                            {file.tags?.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-medium"
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Document Content Viewer */}
                <div className="flex-1 flex flex-col min-w-0 bg-neutral-50/50 dark:bg-black overflow-hidden select-text">
                    {selectedFile ? (
                        <>
                            {/* Document Viewer Header Bar */}
                            <div className="bg-white dark:bg-geist-surface border-b border-neutral-200 dark:border-geist-hairline px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                                selectedFile.extension === "pdf"
                                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                                    : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                            }`}
                                        >
                                            {selectedFile.extension}
                                        </span>
                                        <h2 className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                                            {selectedFile.title || selectedFile.name}
                                        </h2>
                                    </div>
                                    <p
                                        className="text-[10px] text-neutral-400 truncate mt-0.5"
                                        title={formatDisplayPath(selectedFile)}
                                    >
                                        {formatDisplayPath(selectedFile)}
                                    </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleStartEditMeta(selectedFile)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-200 transition-colors"
                                    >
                                        <Edit3 className="w-3 h-3 text-neutral-500" />
                                        <span>Customize</span>
                                    </button>
                                </div>
                            </div>

                            {/* Viewer Body */}
                            <div className="flex-1 overflow-y-auto p-4 md:p-6 select-text">
                                {isLoadingContent ? (
                                    <div className="h-full flex items-center justify-center text-xs text-neutral-500 space-y-2">
                                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
                                    </div>
                                ) : selectedFile.extension === "pdf" ? (
                                    fileContent?.base64Content || fileContent?.base64_content ? (
                                        <div className="w-full h-full min-h-[500px] rounded-sm overflow-hidden border border-neutral-200 dark:border-geist-hairline bg-neutral-900 shadow-sm flex flex-col">
                                            <iframe
                                                src={`data:application/pdf;base64,${fileContent.base64Content || fileContent.base64_content}#toolbar=1&navpanes=1`}
                                                className="w-full flex-1 border-0 rounded-sm"
                                                title={selectedFile.title || selectedFile.name}
                                            />
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-xs text-neutral-500">
                                            Failed to render PDF document content.
                                        </div>
                                    )
                                ) : (
                                    <div className="w-full min-h-full bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm p-6 md:p-8 shadow-xs select-text">
                                        {fileContent?.textContent || fileContent?.text_content ? (
                                            <MarkdownRenderer content={fileContent.textContent || fileContent.text_content || ""} />
                                        ) : (
                                            <div className="text-center text-xs text-neutral-500 py-8">
                                                No content available for this document.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-neutral-400">
                            <div>
                                <BookOpen className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-700 mb-2" />
                                <p className="font-semibold text-neutral-600 dark:text-neutral-400">
                                    Select a document from the left panel to begin reading
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Customization Metadata Modal */}
            {editingDoc && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-geist-surface border border-neutral-200 dark:border-geist-hairline rounded-sm shadow-xl max-w-md w-full p-4 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-geist-hairline">
                            <div className="flex items-center gap-2">
                                <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                                    Customize Document Metadata
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingDoc(null)}
                                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                    Document Title
                                </label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Enter a descriptive title..."
                                    className="w-full px-3 py-1.5 rounded-sm bg-neutral-50 dark:bg-[#111111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                                />
                                <span className="text-[10px] text-neutral-400 mt-0.5 block">
                                    Replaces the raw filename ({editingDoc.name}) across the interface.
                                </span>
                            </div>

                            <div>
                                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                                    Tags (comma separated)
                                </label>
                                <input
                                    type="text"
                                    value={editTagsInput}
                                    onChange={(e) => setEditTagsInput(e.target.value)}
                                    placeholder="e.g. Checklist, C172, SOP, IFR"
                                    className="w-full px-3 py-1.5 rounded-sm bg-neutral-50 dark:bg-[#111111] border border-neutral-200 dark:border-geist-hairline text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                                />
                                <span className="text-[10px] text-neutral-400 mt-0.5 block">
                                    Tags allow instant sorting, filtering, and organizing your library.
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-geist-hairline">
                            <button
                                type="button"
                                onClick={() => setEditingDoc(null)}
                                className="px-3 py-1.5 rounded-sm text-xs font-medium border border-neutral-200 dark:border-geist-hairline hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveMeta}
                                disabled={isSavingMeta}
                                className="px-3.5 py-1.5 rounded-sm text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-neutral-100 transition-colors disabled:opacity-50"
                            >
                                {isSavingMeta ? "Saving..." : "Save Metadata"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
