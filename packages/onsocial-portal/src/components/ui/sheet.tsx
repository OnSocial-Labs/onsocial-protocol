'use client';

import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from 'framer-motion';
import { useEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const dragControls = useDragControls();
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dismissDisabled) onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange, dismissDisabled]);

  if (typeof document === 'undefined') return null;

  const panelMotion = isMobile
    ? {
        initial: {
          y: reduceMotion ? 0 : '100%',
          opacity: reduceMotion ? 0 : 1,
        },
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
            drag={isMobile ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragMomentum={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_event, info) => {
              if (dismissDisabled) return;
              if (info.offset.y > 120 || info.velocity.y > 600) {
                onOpenChange(false);
              }
            }}
            className={cn(
              sheetShellClass,
              portalElevatedShadowClass,
              panelClassName
            )}
          >
            {isMobile ? (
              <div
                className="flex h-5 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                onPointerDown={(event) => dragControls.start(event)}
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
