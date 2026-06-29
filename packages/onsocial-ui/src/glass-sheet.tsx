'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn.js';
import { MultiplyIcon } from './mage-stroke-icons.js';
import { OsIconAction, osIconActionClassName } from './os-icon-action.js';

/** @deprecated Use {@link osIconActionClassName} from `./os-icon-action.js`. */
export const sheetIconActionClassName = osIconActionClassName;

export type GlassSheetTone = 'os' | 'mood-thread';
export type GlassSheetDetent = 'peek' | 'full';
export type GlassSheetPresentation = 'enter' | 'swap';

export const GLASS_SHEET_PEEK_RATIO = 0.62;
const DISMISS_GAP_PX = 96;
const MOBILE_MAX_WIDTH_PX = 767;
const SHEET_TRANSITION_MS = 320;
/** Inline on sheet nodes — Tailwind/Lightning CSS drops unprefixed backdrop-filter. */
export const GLASS_SHEET_BACKDROP_OPACITY = 0.28;
export const GLASS_SHEET_BACKDROP_BLUR_PX = 16;
export const GLASS_SHEET_BACKDROP_SATURATE = 1.12;
const GLASS_SHEET_PANEL_BLUR_PX = 24;
const GLASS_SHEET_OS_PANEL_BLUR_PX = 24;
export const GLASS_SHEET_PANEL_SATURATE = 1.22;
const GLASS_SHEET_MOOD_GLASS_BLUR_PX = 24;
export const GLASS_SHEET_MOOD_GLASS_SATURATE = 1.35;
const SHEET_PRESENTATION_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 0 = fully presented, 1 = sheet fully translated down (portfolio revealed). */
export function resolveSheetCoverProgress(
  offsetPx: number,
  panelHeightPx: number
): number {
  if (panelHeightPx <= 0) {
    return 0;
  }
  return clamp01(offsetPx / panelHeightPx);
}

export function resolveSheetOffsetPx(
  dragPx: number | null,
  detent: GlassSheetDetent,
  panelHeightPx: number,
  peekRatio: number,
  isDesktop: boolean
): number {
  if (isDesktop || panelHeightPx <= 0) {
    return 0;
  }
  if (dragPx != null) {
    return dragPx;
  }
  if (detent === 'full') {
    return 0;
  }
  return Math.max(0, panelHeightPx - window.innerHeight * peekRatio);
}

export function resolveBackdropPresentation(
  coverProgress: number,
  options?: { reduceTransparency?: boolean }
): {
  opacity: number;
  filter: string;
} {
  const strength = 1 - clamp01(coverProgress);
  if (strength <= 0) {
    return { opacity: 0, filter: 'blur(0px)' };
  }

  if (options?.reduceTransparency) {
    return { opacity: strength, filter: 'blur(0px)' };
  }

  return {
    opacity: strength,
    filter: `blur(${GLASS_SHEET_BACKDROP_BLUR_PX * strength}px) saturate(${1 + (GLASS_SHEET_BACKDROP_SATURATE - 1) * strength})`,
  };
}

export function resolvePanelPresentation(
  coverProgress: number,
  tone: GlassSheetTone,
  moodId?: string,
  options?: { reduceTransparency?: boolean }
): string {
  if (options?.reduceTransparency) {
    return 'blur(0px)';
  }

  const strength = 1 - clamp01(coverProgress);
  const blurPx =
    tone === 'mood-thread' && moodId === 'glass'
      ? GLASS_SHEET_MOOD_GLASS_BLUR_PX
      : tone === 'os'
        ? GLASS_SHEET_OS_PANEL_BLUR_PX
        : GLASS_SHEET_PANEL_BLUR_PX;
  const saturate =
    tone === 'mood-thread' && moodId === 'glass'
      ? GLASS_SHEET_MOOD_GLASS_SATURATE
      : GLASS_SHEET_PANEL_SATURATE;

  if (strength <= 0) {
    return 'blur(0px)';
  }

  return `blur(${blurPx * strength}px) saturate(${1 + (saturate - 1) * strength})`;
}

function glassSheetBackdropFilterStyle(
  filter: string,
  options?: { opacity?: number; transition?: string }
): CSSProperties {
  return {
    opacity: options?.opacity,
    transition: options?.transition,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
  };
}

type Detent = GlassSheetDetent;

export interface GlassSheetProps {
  open: boolean;
  onClose: () => void;
  /** Fired after the exit animation completes and the sheet unmounts. */
  onClosed?: () => void;
  tone?: GlassSheetTone;
  /** Mood preset id when tone is mood-thread. */
  moodId?: string;
  panelStyle?: CSSProperties;
  peekRatio?: number;
  /** Mobile resting detent when the sheet opens. Desktop always opens full height. */
  initialDetent?: GlassSheetDetent;
  /** `enter` slides the sheet up; `swap` keeps the shell mounted for in-place panel changes. */
  presentation?: GlassSheetPresentation;
  zIndex?: number;
  ariaLabelledBy: string;
  backdropLabel?: string;
  header?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  /** Scroll container for nested infinite lists (`.glass-sheet-body`). */
  bodyRef?: RefObject<HTMLDivElement | null>;
  panelClassName?: string;
  rootClassName?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ')
    )
  ).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true'
  );
}

function useSheetFocusTrap(
  enabled: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>
) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusables = getFocusableElements(panel);
    const initialTarget = focusables[0] ?? panel;
    if (initialTarget === panel) {
      panel.tabIndex = -1;
    }
    initialTarget.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const items = getFocusableElements(panel);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', handleKeyDown);
    return () => {
      panel.removeEventListener('keydown', handleKeyDown);
      if (panel.tabIndex === -1) {
        panel.removeAttribute('tabindex');
      }

      const restoreTarget = restoreFocusRef.current;
      if (
        restoreTarget &&
        document.contains(restoreTarget) &&
        typeof restoreTarget.focus === 'function'
      ) {
        restoreTarget.focus();
      }
    };
  }, [enabled, panelRef]);
}

function useSheetGesture(
  open: boolean,
  onClose: () => void,
  peekRatio: number,
  initialDetent: GlassSheetDetent,
  panelRef: React.RefObject<HTMLDivElement | null>
) {
  const dragState = useRef<{
    startY: number;
    baseY: number;
    panelH: number;
  } | null>(null);

  const [detent, setDetent] = useState<Detent>(initialDetent);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setDetent(initialDetent);
      setDragPx(null);
      setDragging(false);
      dragState.current = null;
    }
  }, [initialDetent, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const mq = window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH_PX + 1}px)`);
    const syncDesktopDetent = () => {
      if (mq.matches) {
        setDetent('full');
        setDragPx(null);
      }
    };

    syncDesktopDetent();
    mq.addEventListener('change', syncDesktopDetent);
    return () => mq.removeEventListener('change', syncDesktopDetent);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const isMobile = useCallback(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches,
    []
  );

  const peekPxFor = useCallback(
    (panelH: number) => Math.max(0, panelH - window.innerHeight * peekRatio),
    [peekRatio]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobile()) {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const panelH = panel.offsetHeight;
      const baseY = dragPx ?? (detent === 'full' ? 0 : peekPxFor(panelH));
      dragState.current = { startY: event.clientY, baseY, panelH };
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [detent, dragPx, isMobile, panelRef, peekPxFor]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state) {
        return;
      }
      const next = Math.min(
        state.panelH,
        Math.max(0, state.baseY + (event.clientY - state.startY))
      );
      setDragPx(next);
    },
    []
  );

  const handlePointerEnd = useCallback(() => {
    const state = dragState.current;
    if (!state) {
      return;
    }
    dragState.current = null;
    setDragging(false);

    const peekPx = peekPxFor(state.panelH);
    const current = dragPx ?? peekPx;

    if (current > peekPx + DISMISS_GAP_PX) {
      onClose();
      return;
    }

    setDragPx(null);
    setDetent(current < peekPx / 2 ? 'full' : 'peek');
  }, [dragPx, onClose, peekPxFor]);

  const isDesktopSheet = useCallback(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH_PX + 1}px)`).matches,
    []
  );

  const sheetY = useMemo(() => {
    if (dragPx != null) {
      return `${dragPx}px`;
    }
    if (isDesktopSheet() || detent === 'full') {
      return '0px';
    }
    return `calc(100% - ${Math.round(peekRatio * 100)}dvh)`;
  }, [detent, dragPx, isDesktopSheet, peekRatio]);

  return {
    detent,
    dragging,
    dragPx,
    sheetY,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  };
}

function usePrefersReducedTransparency(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const sync = () => setPrefersReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return prefersReduced;
}

function useDocumentBodyPortalTarget(): HTMLElement | null {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  return portalTarget;
}

function useSheetPresence(
  open: boolean,
  onClosed?: () => void,
  presentation: GlassSheetPresentation = 'enter'
) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeFinishedRef = useRef(false);
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;

  useEffect(() => {
    if (open) {
      closeFinishedRef.current = false;
      setMounted(true);
      if (presentationRef.current === 'swap') {
        setVisible(true);
        return;
      }
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }

    setVisible(false);
  }, [open]);

  const finishClose = useCallback(() => {
    if (closeFinishedRef.current) {
      return;
    }
    closeFinishedRef.current = true;
    setMounted(false);
    onClosed?.();
  }, [onClosed]);

  useEffect(() => {
    if (visible || !mounted) {
      return;
    }

    const timer = window.setTimeout(finishClose, SHEET_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [finishClose, mounted, visible]);

  const handlePanelTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.propertyName !== 'transform' || visible) {
        return;
      }
      finishClose();
    },
    [finishClose, visible]
  );

  return {
    mounted,
    visible,
    handlePanelTransitionEnd,
  };
}

/** Frosted bottom sheet — peek / drag / dismiss. Pair with glass-sheet.css. */
export function GlassSheet({
  open,
  onClose,
  onClosed,
  tone = 'os',
  moodId,
  panelStyle,
  peekRatio = GLASS_SHEET_PEEK_RATIO,
  initialDetent = 'peek',
  presentation = 'enter',
  zIndex = 50,
  ariaLabelledBy,
  backdropLabel = 'Close',
  header,
  children,
  bodyClassName,
  bodyRef,
  panelClassName,
  rootClassName,
}: GlassSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const portalTarget = useDocumentBodyPortalTarget();
  const reduceTransparency = usePrefersReducedTransparency();
  const sheetReady = open && !!portalTarget;
  const [enterAnimationDone, setEnterAnimationDone] = useState(false);
  const [panelHeightPx, setPanelHeightPx] = useState(0);
  const [isDesktopSheet, setIsDesktopSheet] = useState(false);
  const { mounted, visible, handlePanelTransitionEnd } = useSheetPresence(
    sheetReady,
    onClosed,
    presentation
  );
  const {
    detent,
    dragging,
    dragPx,
    sheetY,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  } = useSheetGesture(
    open && mounted,
    onClose,
    peekRatio,
    initialDetent,
    panelRef
  );

  useLayoutEffect(() => {
    if (!mounted) {
      setPanelHeightPx(0);
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const syncHeight = () => {
      setPanelHeightPx(panel.offsetHeight);
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [mounted, open]);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH_PX + 1}px)`);
    const syncDesktop = () => setIsDesktopSheet(mq.matches);
    syncDesktop();
    mq.addEventListener('change', syncDesktop);
    return () => mq.removeEventListener('change', syncDesktop);
  }, []);

  const coverProgress = useMemo(() => {
    if (!visible) {
      return 1;
    }

    const offsetPx = resolveSheetOffsetPx(
      dragPx,
      detent,
      panelHeightPx,
      peekRatio,
      isDesktopSheet
    );

    return resolveSheetCoverProgress(offsetPx, panelHeightPx);
  }, [detent, dragPx, isDesktopSheet, panelHeightPx, peekRatio, visible]);

  const presentationTransition = dragging
    ? 'none'
    : `opacity ${SHEET_TRANSITION_MS}ms ${SHEET_PRESENTATION_EASE}, backdrop-filter ${SHEET_TRANSITION_MS}ms ${SHEET_PRESENTATION_EASE}`;

  const backdropPresentation = resolveBackdropPresentation(coverProgress, {
    reduceTransparency,
  });
  const panelFilter = resolvePanelPresentation(coverProgress, tone, moodId, {
    reduceTransparency,
  });

  useEffect(() => {
    if (!open) {
      setEnterAnimationDone(false);
    }
  }, [open]);

  const showEnterAnimation =
    presentation === 'enter' && visible && !enterAnimationDone;

  const handlePanelAnimationEnd = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (event.animationName !== 'glass-sheet-enter') {
        return;
      }
      setEnterAnimationDone(true);
    },
    []
  );

  useSheetFocusTrap(visible, panelRef);

  if (!mounted || !portalTarget) {
    return null;
  }

  const sheet = (
    <div
      className={cn(
        'glass-sheet-root',
        visible && 'is-visible',
        showEnterAnimation && 'glass-sheet-root--enter',
        rootClassName
      )}
      data-tone={tone}
      data-mood={tone === 'mood-thread' ? moodId : undefined}
      style={{ zIndex }}
      role="presentation"
    >
      <button
        type="button"
        className="glass-sheet-backdrop"
        onClick={onClose}
        aria-label={backdropLabel}
        style={glassSheetBackdropFilterStyle(backdropPresentation.filter, {
          opacity: showEnterAnimation
            ? undefined
            : backdropPresentation.opacity,
          transition: showEnterAnimation ? undefined : presentationTransition,
        })}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        className={cn(
          'glass-sheet-panel',
          visible && 'is-open',
          showEnterAnimation && 'glass-sheet-panel--enter',
          dragging && 'is-dragging',
          panelClassName
        )}
        data-tone={tone}
        data-mood={tone === 'mood-thread' ? moodId : undefined}
        style={
          {
            '--sheet-y': sheetY,
            ...glassSheetBackdropFilterStyle(panelFilter, {
              transition: presentationTransition,
            }),
            ...panelStyle,
          } as CSSProperties
        }
        onTransitionEnd={handlePanelTransitionEnd}
        onAnimationEnd={handlePanelAnimationEnd}
      >
        <div
          className="glass-sheet-drag"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <span className="glass-sheet-grip" aria-hidden />
        </div>

        {header}

        <div ref={bodyRef} className={cn('glass-sheet-body', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, portalTarget);
}

export interface SheetCloseButtonProps {
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}

export function SheetCloseButton({
  onClick,
  ariaLabel,
  className,
}: SheetCloseButtonProps) {
  return (
    <OsIconAction onClick={onClick} ariaLabel={ariaLabel} className={className}>
      <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}

export interface SheetHeaderProps {
  titleId?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  closeAriaLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export function SheetHeader({
  titleId,
  title,
  subtitle,
  onClose,
  closeAriaLabel,
  actions,
  className,
}: SheetHeaderProps) {
  const closeControl =
    actions ??
    (onClose && closeAriaLabel ? (
      <SheetCloseButton onClick={onClose} ariaLabel={closeAriaLabel} />
    ) : null);

  return (
    <header className={cn('glass-sheet-header', className)}>
      <div className="glass-sheet-header-copy">
        <h2 id={titleId} className="glass-sheet-header-title">
          {title}
        </h2>
        {subtitle ? (
          <p className="glass-sheet-header-subtitle">{subtitle}</p>
        ) : null}
      </div>
      {closeControl}
    </header>
  );
}
