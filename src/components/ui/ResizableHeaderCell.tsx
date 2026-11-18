import React, { useRef, useCallback } from "react";

export interface ResizableHeaderCellProps {
    columnId: string;
    width?: number;
    minWidth?: number;
    onResize: (id: string, width: number) => void;
    onResetWidth?: (id: string) => void;
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
    onClick?: (e: React.MouseEvent) => void;
    align?: "left" | "center" | "right";
    isResizable?: boolean;
}

export const ResizableHeaderCell: React.FC<ResizableHeaderCellProps> = ({
    columnId,
    width,
    minWidth = 50,
    onResize,
    onResetWidth,
    children,
    className = "",
    style = {},
    title,
    onClick,
    align = "left",
    isResizable = true,
}) => {
    const thRef = useRef<HTMLTableCellElement>(null);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (!thRef.current) return;
            const startX = e.clientX;
            const startWidth = thRef.current.getBoundingClientRect().width;

            // Prevent text selection during drag
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";

            let currentWidth = startWidth;

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const newWidth = Math.round(Math.max(minWidth, startWidth + deltaX));
                currentWidth = newWidth;
                onResize(columnId, newWidth);
            };

            const handleMouseUp = () => {
                document.body.style.userSelect = "";
                document.body.style.cursor = "";
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
                onResize(columnId, currentWidth);
            };

            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        },
        [columnId, minWidth, onResize],
    );

    const handleDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onResetWidth?.(columnId);
        },
        [columnId, onResetWidth],
    );

    const cellStyle: React.CSSProperties = {
        ...style,
        ...(width ? { width: `${width}px`, minWidth: `${width}px` } : {}),
    };

    return (
        <th
            ref={thRef}
            style={cellStyle}
            title={title}
            onClick={onClick}
            className={`relative group/th select-none ${className}`}
        >
            <div
                className={`w-full h-full flex items-center ${
                    align === "center"
                        ? "justify-center"
                        : align === "right"
                          ? "justify-end"
                          : "justify-start"
                }`}
            >
                {children}
            </div>

            {/* Interactive Column Resize Handle */}
            {isResizable && (
                <div
                    onMouseDown={handleMouseDown}
                    onDoubleClick={handleDoubleClick}
                    onClick={(e) => e.stopPropagation()}
                    title="Drag to resize column · Double-click to reset width"
                    className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 group/handle flex items-center justify-center hover:bg-neutral-400/40 dark:hover:bg-neutral-600/40 active:bg-neutral-500 transition-colors"
                >
                    <div className="w-px h-3.5 bg-neutral-300 dark:bg-neutral-700 group-hover/handle:bg-neutral-500 dark:group-hover/handle:bg-neutral-400" />
                </div>
            )}
        </th>
    );
};
