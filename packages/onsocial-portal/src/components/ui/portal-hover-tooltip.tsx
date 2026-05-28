'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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

const TOOLTIP_MARGIN = 12;
const TOOLTIP_GAP = 7;

type TooltipPlacement = 'top' | 'bottom';

interface TooltipPosition {
  x: number;
  y: number;
  placement: TooltipPlacement;
}

function measureTooltipPosition(
  anchor: DOMRect,
  tip: DOMRect
): TooltipPosition {
  const halfWidth = tip.width / 2;
  let x = anchor.left + anchor.width / 2;
  x = Math.min(
    window.innerWidth - TOOLTIP_MARGIN - halfWidth,
    Math.max(TOOLTIP_MARGIN + halfWidth, x)
  );

  const fitsBelow =
    anchor.bottom + TOOLTIP_GAP + tip.height <=
    window.innerHeight - TOOLTIP_MARGIN;
  const fitsAbove =
    anchor.top - TOOLTIP_GAP - tip.height >= TOOLTIP_MARGIN;

  let placement: TooltipPlacement = 'bottom';
  if (!fitsBelow && fitsAbove) {
    placement = 'top';
  } else if (!fitsBelow && !fitsAbove) {
    placement =
      anchor.top > window.innerHeight - anchor.bottom ? 'top' : 'bottom';
  }

  const y =
    placement === 'top' ? anchor.top - TOOLTIP_GAP : anchor.bottom + TOOLTIP_GAP;

  return { x, y, placement };
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
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [openedByTouch, setOpenedByTouch] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    x: 0,
    y: 0,
    placement: 'bottom',
  });

  const updatePosition = useCallback(() => {
    if (!ref.current || !tooltipRef.current) return;
    const anchor = ref.current.getBoundingClientRect();
    const tip = tooltipRef.current.getBoundingClientRect();
    setPosition(measureTooltipPosition(anchor, tip));
  }, []);

  const showTooltip = useCallback(
    (touch = false) => {
      if (!tooltip || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + TOOLTIP_GAP,
        placement: 'bottom',
      });
      setOpenedByTouch(touch);
      setOpen(true);
    },
    [tooltip]
  );

  const hideTooltip = useCallback(() => {
    setOpen(false);
    setOpenedByTouch(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, tooltip, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      hideTooltip();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideTooltip();
    };
    const handleViewportChange = () => {
      updatePosition();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    const timeout = openedByTouch
      ? window.setTimeout(hideTooltip, 2800)
      : undefined;

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [hideTooltip, open, openedByTouch, updatePosition]);

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
            ref={tooltipRef}
            className="pointer-events-none fixed z-[2147483647] w-max max-w-[15rem] rounded-lg border border-border/55 bg-background/95 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-muted-foreground shadow-[0_14px_36px_-22px_rgba(15,23,42,0.65)] backdrop-blur-md"
            style={{
              left: position.x,
              top: position.y,
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
