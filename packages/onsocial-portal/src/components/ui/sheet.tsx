'use client';

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from 'framer-motion';
import {
  useEffect,
  useRef,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Responsive overlay shell: bottom drawer with drag-to-dismiss grip on
 * mobile, centered modal on md+ viewports. Owns the portal, backdrop, body
 * scroll lock, Escape handling, and dialog semantics — callers provide the
 * header/body content. Width/height variants go through `panelClassName`
 * (use `md:` prefixes so the mobile drawer keeps its own geometry).
 */
export const sheetShellClass =
  'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.25rem] border border-b-0 border-border/67 bg-background/98 pb-[env(safe-area-inset-bottom)] md:max-h-[min(640px,calc(100vh-2rem))] md:max-w-md md:rounded-2xl md:border-b md:pb-0';

/** Grip must travel this far before the panel follows (keeps taps inert). */
const DRAG_ACTIVATION_PX = 4;
/** Release past this pull distance dismisses the drawer. */
const DRAG_DISMISS_PX = 120;
/** Breathing room kept above the drawer while the keyboard is open. */
const KEYBOARD_TOP_INSET_PX = 12;
/** Retry pass after the keyboard animation settles. */
const KEYBOARD_SCROLL_RETRY_MS = 280;

/**
 * Keep a focused field visible above the mobile keyboard. Runs once
 * immediately and once after the keyboard animation; body scroll is locked
 * while a sheet is open, so only the sheet's own scroller moves.
 */
function scrollSheetFieldIntoView(element: HTMLElement) {
  const run = () => {
    if (document.activeElement !== element) return;
    const viewport = window.visualViewport;
    if (!viewport) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const rect = element.getBoundingClientRect();
    const topInset = viewport.offsetTop + 72;
    const bottomInset = viewport.offsetTop + viewport.height - 96;
    if (rect.top < topInset || rect.bottom > bottomInset) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };
  window.requestAnimationFrame(run);
  window.setTimeout(run, KEYBOARD_SCROLL_RETRY_MS);
}

export function Sheet({
  open,
  onOpenChange,
  ariaLabelledby,
  ariaLabel,
  dismissLabel = 'Close dialog',
  dismissDisabled = false,
  panelClassName,
  panelRef,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabelledby?: string;
  ariaLabel?: string;
  dismissLabel?: string;
  /** Block backdrop/Escape/drag dismiss (e.g. while a save is in flight). */
  dismissDisabled?: boolean;
  panelClassName?: string;
  /** Attach to the panel — e.g. useDropdown's panelRef so in-sheet taps don't close it. */
  panelRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  useBodyScrollLock(open);
  const viewport = useVisualViewportSheetMetrics(open && isMobile);

  /**
   * Single transform source for the mobile drawer: enter/exit animations,
   * grip drags, and snap-backs all write this motion value, so a release
   * mid-drag or a dismiss mid-pull can never fight a framer drag session.
   */
  const panelY = useMotionValue(0);
  const dragState = useRef<{
    startY: number;
    currentY: number;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dismissDisabled) onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange, dismissDisabled]);

  if (typeof document === 'undefined') return null;

  const onGripPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dismissDisabled) return;
    dragState.current = { startY: event.clientY, currentY: 0, active: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onGripPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state) return;
    const deltaY = event.clientY - state.startY;
    if (!state.active && Math.abs(deltaY) < DRAG_ACTIVATION_PX) return;
    if (!state.active) state.active = true;
    const next = Math.max(0, deltaY);
    state.currentY = next;
    panelY.set(next);
  };

  const onGripPointerEnd = () => {
    const state = dragState.current;
    if (!state) return;
    dragState.current = null;
    if (!state.active) return;
    if (!dismissDisabled && state.currentY > DRAG_DISMISS_PX) {
      onOpenChange(false);
      return;
    }
    animate(panelY, 0, {
      duration: reduceMotion ? 0 : 0.22,
      ease: 'easeOut',
    });
  };

  const onPanelFocusCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const target = event.target as HTMLElement;
    if (
      !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) &&
      !target.isContentEditable
    ) {
      return;
    }
    scrollSheetFieldIntoView(target);
  };

  const panelMotion = isMobile
    ? {
        initial: { y: '100%', opacity: reduceMotion ? 0 : 1 },
        animate: { y: 0, opacity: 1 },
        exit: { y: reduceMotion ? 0 : '100%', opacity: reduceMotion ? 0 : 1 },
        transition: {
          duration: reduceMotion ? 0 : 0.28,
          ease: 'easeOut' as const,
        },
      }
    : scaleFadeMotion(!!reduceMotion, {
        y: 14,
        scale: 0.98,
        duration: 0.22,
        exitY: 8,
        exitScale: 0.99,
      });

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483645] flex items-end justify-center md:items-center md:px-4 md:py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label={dismissLabel}
            disabled={dismissDisabled}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            {...panelMotion}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ariaLabelledby}
            aria-label={ariaLabelledby ? undefined : ariaLabel}
            onFocusCapture={onPanelFocusCapture}
            style={
              isMobile
                ? {
                    y: panelY,
                    ...(viewport.lift > 0
                      ? {
                          // Ride above the keyboard; cap height to the
                          // visible band so the grip/header stay on-screen.
                          marginBottom: `calc(${viewport.lift}px - env(safe-area-inset-bottom, 0px))`,
                          maxHeight: Math.max(
                            240,
                            viewport.height - KEYBOARD_TOP_INSET_PX
                          ),
                        }
                      : {}),
                  }
                : undefined
            }
            className={cn(
              sheetShellClass,
              portalElevatedShadowClass,
              panelClassName
            )}
          >
            {isMobile ? (
              <div
                className="flex h-5 w-full shrink-0 touch-none items-center justify-center"
                onPointerDown={onGripPointerDown}
                onPointerMove={onGripPointerMove}
                onPointerUp={onGripPointerEnd}
                onPointerCancel={onGripPointerEnd}
                aria-hidden
              >
                <span className="h-1 w-9 rounded-full bg-foreground/20" />
              </div>
            ) : null}
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
