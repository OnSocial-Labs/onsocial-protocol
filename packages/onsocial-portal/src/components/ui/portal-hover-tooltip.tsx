'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface PortalHoverTooltipProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  stopPropagation?: boolean;
  tooltip?: ReactNode;
}

export function PortalHoverTooltip({
  children,
  stopPropagation = false,
  tooltip,
  className,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onPointerDown,
  onClick,
  tabIndex,
  ...props
}: PortalHoverTooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [openedByTouch, setOpenedByTouch] = useState(false);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    placement: 'top' | 'bottom';
  }>({ x: 0, y: 0, placement: 'bottom' });

  const showTooltip = useCallback((touch = false) => {
    if (!tooltip) return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const x = Math.min(
        window.innerWidth - 12,
        Math.max(12, rect.left + rect.width / 2)
      );
      const opensAbove = rect.bottom > window.innerHeight - 72;
      setPosition({
        x,
        y: opensAbove ? rect.top : rect.bottom,
        placement: opensAbove ? 'top' : 'bottom',
      });
    }
    setOpenedByTouch(touch);
    setOpen(true);
  }, [tooltip]);

  const hideTooltip = useCallback(() => {
    setOpen(false);
    setOpenedByTouch(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      hideTooltip();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideTooltip();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('keydown', handleKeyDown);
    const timeout = openedByTouch
      ? window.setTimeout(hideTooltip, 2800)
      : undefined;

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('keydown', handleKeyDown);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [hideTooltip, open, openedByTouch]);

  return (
    <>
      <span
        ref={ref}
        className={cn(className)}
        tabIndex={tooltip ? (tabIndex ?? 0) : tabIndex}
        onMouseEnter={(event) => {
          showTooltip(false);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          hideTooltip();
          onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          showTooltip(false);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          hideTooltip();
          onBlur?.(event);
        }}
        onPointerDown={(event) => {
          if (tooltip && event.pointerType !== 'mouse') {
            if (stopPropagation) event.stopPropagation();
            showTooltip(true);
          }
          onPointerDown?.(event);
        }}
        onClick={(event) => {
          if (tooltip && stopPropagation) event.stopPropagation();
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </span>
      {open &&
        tooltip &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            className="pointer-events-none fixed z-[2147483647] w-max max-w-[15rem] -translate-x-1/2 rounded-lg border border-border/55 bg-background/95 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-muted-foreground shadow-[0_14px_36px_-22px_rgba(15,23,42,0.65)] backdrop-blur-md"
            style={{
              left: position.x,
              top:
                position.placement === 'top'
                  ? position.y - 7
                  : position.y + 7,
              transform:
                position.placement === 'top'
                  ? 'translate(-50%, -100%)'
                  : 'translateX(-50%)',
            }}
          >
            {tooltip}
          </span>,
          document.body
        )}
    </>
  );
}
