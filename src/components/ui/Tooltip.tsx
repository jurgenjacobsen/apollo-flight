import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    ReactNode,
    ReactElement,
} from "react";
import { createPortal } from "react-dom";

export type TooltipPlacement = "auto" | "top" | "bottom" | "left" | "right";

export interface TooltipProps {
    /** The content shown inside the tooltip (string, JSX, or component) */
    content: ReactNode;
    /** The trigger element that activates the tooltip on hover / focus */
    children: ReactElement;
    /**
     * Preferred placement relative to the trigger.
     * "auto" (default) chooses the optimal side based on available viewport space.
     * "top" | "bottom" | "left" | "right" explicitly sets the side.
     */
    placement?: TooltipPlacement;
    /** When true, the tooltip will not appear */
    disabled?: boolean;
    /** Delay in milliseconds before showing on hover (defaults to 120ms) */
    delay?: number;
    /** Distance in pixels between the trigger element and the tooltip (defaults to 6px) */
    offset?: number;
    /** Optional additional classes for the tooltip container */
    className?: string;
    /** Whether to render a pointing caret arrow (defaults to true) */
    showArrow?: boolean;
}

interface Coords {
    top: number;
    left: number;
    actualPlacement: "top" | "bottom" | "left" | "right";
    arrowOffset?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    placement = "auto",
    disabled = false,
    delay = 120,
    offset = 6,
    className = "",
    showArrow = true,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState<Coords | null>(null);

    const triggerRef = useRef<HTMLElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const computePosition = useCallback((): Coords | null => {
        if (!triggerRef.current || !tooltipRef.current) return null;

        const triggerRect = triggerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const spaceAbove = triggerRect.top;
        const spaceBelow = viewportHeight - triggerRect.bottom;
        const spaceLeft = triggerRect.left;
        const spaceRight = viewportWidth - triggerRect.right;

        let resolved: "top" | "bottom" | "left" | "right" = "top";

        if (placement === "auto") {
            // If near left edge (e.g. sidebar), right is optimal
            if (spaceLeft < 90 && spaceRight >= tooltipRect.width + offset + 8) {
                resolved = "right";
            } else if (spaceRight < 90 && spaceLeft >= tooltipRect.width + offset + 8) {
                resolved = "left";
            } else if (spaceAbove >= tooltipRect.height + offset + 8) {
                resolved = "top";
            } else if (spaceBelow >= tooltipRect.height + offset + 8) {
                resolved = "bottom";
            } else if (spaceRight >= tooltipRect.width + offset + 8) {
                resolved = "right";
            } else {
                resolved = "left";
            }
        } else {
            // Manual choice: flip if chosen placement overflows the screen
            if (placement === "top" && spaceAbove < tooltipRect.height + offset + 8 && spaceBelow > spaceAbove) {
                resolved = "bottom";
            } else if (placement === "bottom" && spaceBelow < tooltipRect.height + offset + 8 && spaceAbove > spaceBelow) {
                resolved = "top";
            } else if (placement === "left" && spaceLeft < tooltipRect.width + offset + 8 && spaceRight > spaceLeft) {
                resolved = "right";
            } else if (placement === "right" && spaceRight < tooltipRect.width + offset + 8 && spaceLeft > spaceRight) {
                resolved = "left";
            } else {
                resolved = placement;
            }
        }

        let top = 0;
        let left = 0;

        switch (resolved) {
            case "top":
                top = triggerRect.top - tooltipRect.height - offset;
                left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
                break;
            case "bottom":
                top = triggerRect.bottom + offset;
                left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
                break;
            case "left":
                top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
                left = triggerRect.left - tooltipRect.width - offset;
                break;
            case "right":
                top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
                left = triggerRect.right + offset;
                break;
        }

        // Clamp to viewport edges with 8px margin
        const clampMargin = 8;
        const clampedLeft = Math.max(clampMargin, Math.min(left, viewportWidth - tooltipRect.width - clampMargin));
        const clampedTop = Math.max(clampMargin, Math.min(top, viewportHeight - tooltipRect.height - clampMargin));

        return {
            top: clampedTop,
            left: clampedLeft,
            actualPlacement: resolved,
        };
    }, [placement, offset]);

    const updatePosition = useCallback(() => {
        const next = computePosition();
        if (next) setCoords(next);
    }, [computePosition]);

    const show = useCallback(() => {
        if (disabled || !content) return;
        if (timerRef.current) clearTimeout(timerRef.current);

        if (delay > 0) {
            timerRef.current = setTimeout(() => {
                setIsVisible(true);
            }, delay);
        } else {
            setIsVisible(true);
        }
    }, [disabled, content, delay]);

    const hide = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setIsVisible(false);
    }, []);

    // Recalculate position whenever visible changes
    useEffect(() => {
        if (isVisible) {
            // First render hidden measurement, then position
            updatePosition();
            const handleScrollOrResize = () => updatePosition();
            window.addEventListener("scroll", handleScrollOrResize, true);
            window.addEventListener("resize", handleScrollOrResize);

            return () => {
                window.removeEventListener("scroll", handleScrollOrResize, true);
                window.removeEventListener("resize", handleScrollOrResize);
            };
        }
    }, [isVisible, updatePosition]);

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") hide();
        };
        if (isVisible) {
            window.addEventListener("keydown", handleKeyDown);
            return () => window.removeEventListener("keydown", handleKeyDown);
        }
    }, [isVisible, hide]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    // Clone child to attach ref and handlers without extra wrapper nodes
    const child = React.isValidElement(children) ? children : <span>{children}</span>;

    const mergedProps: Record<string, any> = {
        ref: (node: HTMLElement | null) => {
            triggerRef.current = node;
            const originalRef = (child as any).ref;
            if (typeof originalRef === "function") {
                originalRef(node);
            } else if (originalRef && "current" in originalRef) {
                originalRef.current = node;
            }
        },
        onMouseEnter: (e: React.MouseEvent) => {
            (child.props as any)?.onMouseEnter?.(e);
            show();
        },
        onMouseLeave: (e: React.MouseEvent) => {
            (child.props as any)?.onMouseLeave?.(e);
            hide();
        },
        onFocus: (e: React.FocusEvent) => {
            (child.props as any)?.onFocus?.(e);
            show();
        },
        onBlur: (e: React.FocusEvent) => {
            (child.props as any)?.onBlur?.(e);
            hide();
        },
    };

    const triggerElement = React.cloneElement(child, mergedProps);

    const tooltipPortal =
        isVisible && !disabled && content && typeof document !== "undefined"
            ? createPortal(
                  <div
                      ref={tooltipRef}
                      role="tooltip"
                      style={{
                          position: "fixed",
                          top: coords ? `${coords.top}px` : "-9999px",
                          left: coords ? `${coords.left}px` : "-9999px",
                          opacity: coords ? 1 : 0,
                          pointerEvents: "none",
                      }}
                      className={`z-[9999] px-2.5 py-1 text-xs font-sans rounded-md shadow-md select-none transition-opacity duration-150 border bg-neutral-900 text-white border-neutral-700/80 dark:bg-[#1a1a1a] dark:text-[#ededed] dark:border-[#383838] ${className}`}
                  >
                      {content}

                      {/* Optional Arrow */}
                      {showArrow && coords && (
                          <div
                              className={`absolute w-1.5 h-1.5 rotate-45 bg-neutral-900 dark:bg-[#1a1a1a] border-neutral-700/80 dark:border-[#383838] ${
                                  coords.actualPlacement === "top"
                                      ? "bottom-[-4px] left-1/2 -translate-x-1/2 border-r border-b"
                                      : coords.actualPlacement === "bottom"
                                        ? "top-[-4px] left-1/2 -translate-x-1/2 border-l border-t"
                                        : coords.actualPlacement === "left"
                                          ? "right-[-4px] top-1/2 -translate-y-1/2 border-t border-r"
                                          : "left-[-4px] top-1/2 -translate-y-1/2 border-b border-l"
                              }`}
                          />
                      )}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
            {triggerElement}
            {tooltipPortal}
        </>
    );
};
