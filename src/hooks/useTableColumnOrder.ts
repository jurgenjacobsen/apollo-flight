import { useState, useEffect, useCallback, useMemo } from "react";

export interface ColumnDefinition {
    id: string;
    label: string;
    defaultVisible?: boolean;
    required?: boolean;
    defaultWidth?: number;
    minWidth?: number;
}

export interface ColumnState {
    id: string;
    label: string;
    visible: boolean;
    required?: boolean;
    width?: number;
    defaultWidth?: number;
    minWidth?: number;
}

interface StoredColumnConfig {
    id: string;
    visible: boolean;
    width?: number;
}

export function useTableColumnOrder(
    storageKey: string,
    defaultColumns: ColumnDefinition[],
) {
    const initializeColumns = (): ColumnState[] => {
        const defaultMap = new Map<string, ColumnDefinition>(
            defaultColumns.map((col) => [col.id, col]),
        );

        if (typeof window !== "undefined") {
            try {
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    const parsed: StoredColumnConfig[] = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const restored: ColumnState[] = [];
                        const seenIds = new Set<string>();

                        // First add columns that were saved, in their saved order and with custom widths
                        for (const item of parsed) {
                            const def = defaultMap.get(item.id);
                            if (def) {
                                restored.push({
                                    id: def.id,
                                    label: def.label,
                                    visible: def.required ? true : Boolean(item.visible),
                                    required: def.required,
                                    width: typeof item.width === "number" && item.width > 0 ? item.width : def.defaultWidth,
                                    defaultWidth: def.defaultWidth,
                                    minWidth: def.minWidth ?? 50,
                                });
                                seenIds.add(def.id);
                            }
                        }

                        // Then append any newly introduced default columns that weren't in saved storage
                        for (const def of defaultColumns) {
                            if (!seenIds.has(def.id)) {
                                restored.push({
                                    id: def.id,
                                    label: def.label,
                                    visible: def.defaultVisible !== false,
                                    required: def.required,
                                    width: def.defaultWidth,
                                    defaultWidth: def.defaultWidth,
                                    minWidth: def.minWidth ?? 50,
                                });
                            }
                        }

                        if (restored.length > 0) {
                            return restored;
                        }
                    }
                }
            } catch (err) {
                console.warn(`[useTableColumnOrder] Failed to read ${storageKey}:`, err);
            }
        }

        // Fallback: default column configuration
        return defaultColumns.map((col) => ({
            id: col.id,
            label: col.label,
            visible: col.defaultVisible !== false,
            required: col.required,
            width: col.defaultWidth,
            defaultWidth: col.defaultWidth,
            minWidth: col.minWidth ?? 50,
        }));
    };

    const [columns, setColumns] = useState<ColumnState[]>(initializeColumns);

    // Persist to localStorage whenever columns change
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const toStore: StoredColumnConfig[] = columns.map((col) => ({
                id: col.id,
                visible: col.visible,
                width: col.width,
            }));
            localStorage.setItem(storageKey, JSON.stringify(toStore));
        } catch (err) {
            console.warn(`[useTableColumnOrder] Failed to save ${storageKey}:`, err);
        }
    }, [columns, storageKey]);

    const visibleColumnIds = useMemo(() => {
        return columns.filter((col) => col.visible).map((col) => col.id);
    }, [columns]);

    const isColumnVisible = useCallback(
        (id: string) => {
            const col = columns.find((c) => c.id === id);
            return col ? col.visible : false;
        },
        [columns],
    );

    const getColumnWidth = useCallback(
        (id: string) => {
            const col = columns.find((c) => c.id === id);
            return col?.width;
        },
        [columns],
    );

    const setColumnWidth = useCallback((id: string, width: number | undefined) => {
        setColumns((prev) =>
            prev.map((col) => {
                if (col.id !== id) return col;
                const min = col.minWidth ?? 50;
                const finalWidth = width !== undefined ? Math.max(min, width) : undefined;
                return { ...col, width: finalWidth };
            }),
        );
    }, []);

    const resetColumnWidth = useCallback((id: string) => {
        setColumns((prev) =>
            prev.map((col) => (col.id === id ? { ...col, width: col.defaultWidth } : col)),
        );
    }, []);

    const resetColumnWidths = useCallback(() => {
        setColumns((prev) =>
            prev.map((col) => ({ ...col, width: col.defaultWidth })),
        );
    }, []);

    const hasCustomWidths = useMemo(() => {
        return columns.some(
            (col) =>
                col.width !== undefined &&
                col.defaultWidth !== undefined &&
                col.width !== col.defaultWidth,
        );
    }, [columns]);

    const toggleColumnVisibility = useCallback((id: string) => {
        setColumns((prev) => {
            const currentlyVisibleCount = prev.filter((c) => c.visible).length;
            return prev.map((col) => {
                if (col.id !== id) return col;
                if (col.required || (col.visible && currentlyVisibleCount <= 1)) {
                    return col;
                }
                return { ...col, visible: !col.visible };
            });
        });
    }, []);

    const moveColumn = useCallback((fromIndex: number, toIndex: number) => {
        setColumns((prev) => {
            if (
                fromIndex < 0 ||
                fromIndex >= prev.length ||
                toIndex < 0 ||
                toIndex >= prev.length ||
                fromIndex === toIndex
            ) {
                return prev;
            }
            const copy = [...prev];
            const [moved] = copy.splice(fromIndex, 1);
            copy.splice(toIndex, 0, moved);
            return copy;
        });
    }, []);

    const moveColumnUp = useCallback((id: string) => {
        setColumns((prev) => {
            const index = prev.findIndex((c) => c.id === id);
            if (index <= 0) return prev;
            const copy = [...prev];
            const [item] = copy.splice(index, 1);
            copy.splice(index - 1, 0, item);
            return copy;
        });
    }, []);

    const moveColumnDown = useCallback((id: string) => {
        setColumns((prev) => {
            const index = prev.findIndex((c) => c.id === id);
            if (index < 0 || index >= prev.length - 1) return prev;
            const copy = [...prev];
            const [item] = copy.splice(index, 1);
            copy.splice(index + 1, 0, item);
            return copy;
        });
    }, []);

    const resetToDefaults = useCallback(() => {
        const defaults = defaultColumns.map((col) => ({
            id: col.id,
            label: col.label,
            visible: col.defaultVisible !== false,
            required: col.required,
            width: col.defaultWidth,
            defaultWidth: col.defaultWidth,
            minWidth: col.minWidth ?? 50,
        }));
        setColumns(defaults);
        if (typeof window !== "undefined") {
            try {
                localStorage.removeItem(storageKey);
            } catch {}
        }
    }, [defaultColumns, storageKey]);

    return {
        columns,
        visibleColumnIds,
        isColumnVisible,
        getColumnWidth,
        setColumnWidth,
        resetColumnWidth,
        resetColumnWidths,
        hasCustomWidths,
        toggleColumnVisibility,
        moveColumn,
        moveColumnUp,
        moveColumnDown,
        resetToDefaults,
    };
}
