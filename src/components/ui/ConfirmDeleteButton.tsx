import React, { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

export interface ConfirmDeleteButtonProps {
  /** Callback fired when user confirms the destructive action */
  onConfirm: () => void | Promise<void>;
  /** Optional label shown beside the icon (e.g. "Empty Recycle Bin") */
  label?: React.ReactNode;
  /** Confirmation prompt text, defaults to "Really?" */
  confirmLabel?: string;
  /** Custom icon, defaults to Lucide Trash2 */
  icon?: React.ReactNode;
  /** Tooltip title before confirmation */
  title?: string;
  /** Tooltip title during confirmation */
  confirmTitle?: string;
  /** Visual variant: 'icon' (compact table action) or 'button' (labeled pill) */
  variant?: 'icon' | 'button';
  /** Additional CSS classes */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Reusable two-stage destructive button with smooth "Really?" confirmation.
 * Automatically handles click-outside dismissal, Escape key cancellation,
 * and a 15-second auto-timeout.
 */
export const ConfirmDeleteButton: React.FC<ConfirmDeleteButtonProps> = ({
  onConfirm,
  label,
  confirmLabel = 'Really?',
  icon = <Trash2 className="w-3.5 h-3.5 shrink-0" />,
  title = 'Delete',
  confirmTitle = 'Click again to confirm',
  variant = label ? 'button' : 'icon',
  className = '',
  disabled = false,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isConfirming) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsConfirming(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsConfirming(false);
      }
    };

    const timer = setTimeout(() => {
      setIsConfirming(false);
    }, 15000);

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isConfirming]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled) return;

    if (isConfirming) {
      onConfirm();
      setIsConfirming(false);
    } else {
      setIsConfirming(true);
    }
  };

  const isButtonVariant = variant === 'button' || Boolean(label);

  const baseClasses = isButtonVariant
    ? `flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm border transition-all duration-200 ease-in-out cursor-pointer shadow-2xs select-none ${
        isConfirming
          ? 'bg-red-600 hover:bg-red-500 text-white border-red-600 shadow-xs'
          : 'bg-white dark:bg-[#181818] border-neutral-300 dark:border-geist-hairline text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
      }`
    : `h-7 rounded-sm flex items-center justify-center transition-all duration-200 ease-in-out border text-xs cursor-pointer select-none ${
        isConfirming
          ? 'px-2.5 bg-red-600 hover:bg-red-500 text-white border-red-600 shadow-2xs'
          : 'px-1.5 border-neutral-200 dark:border-geist-hairline text-neutral-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/20'
      }`;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`${baseClasses} ${className}`}
      title={isConfirming ? confirmTitle : title}
    >
      <span
        className={`overflow-hidden transition-all duration-200 ease-in-out text-[11px] font-semibold whitespace-nowrap select-none inline-block ${
          isConfirming
            ? 'max-w-[60px] opacity-100 mr-1.5 translate-x-0'
            : 'max-w-0 opacity-0 mr-0 -translate-x-1 pointer-events-none'
        }`}
      >
        {confirmLabel}
      </span>
      {icon}
      {label && <span className="text-xs">{label}</span>}
    </button>
  );
};
