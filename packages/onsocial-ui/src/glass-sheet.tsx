'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn.js';
import { MultiplyIcon } from './mage-stroke-icons.js';
import { OsIconAction, osIconActionClassName } from './os-icon-action.js';

/**
 * Optional clip host for GlassSheet (e.g. OS phone card). When set, sheets
 * portal into that node instead of `document.body` so backdrop-filter blur
 * cannot paint past the desktop column edges.
 */
const GlassSheetPortalContext = createContext<HTMLElement | null>(null);

export function GlassSheetPortalProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <GlassSheetPortalContext.Provider value={container}>
      {children}
    </GlassSheetPortalContext.Provider>
  );
}

/** @deprecated Use {@link osIconActionClassName} from `./os-icon-action.js`. */
export const sheetIconActionClassName = osIconActionClassName;

export type GlassSheetTone = 'os' | 'mood-thread';
export type GlassSheetDetent = 'peek' | 'full';
export type GlassSheetPresentation = 'enter' | 'swap' | 'appear';
/** `hug` = content-sized up to 90dvh; `full` = default near-viewport height. */
export type GlassSheetSizing = 'hug' | 'full';
/**
 * `glass` — frosted panel + dim/blur scrim.
 * `page` — opaque OS/slide-page fill (`--mood-bg` / `--bg`), no frost.
 */
export type GlassSheetSurface = 'glass' | 'page';

export const GLASS_SHEET_PEEK_RATIO = 0.62;
const DISMISS_GAP_PX = 96;
const MOBILE_MAX_WIDTH_PX = 767;
const SHEET_TRANSITION_MS = 320;
const DRAG_ACTIVATION_PX = 4;
/** Inline on sheet nodes — Tailwind/Lightning CSS drops unprefixed backdrop-filter. */
export const GLASS_SHEET_BACKDROP_OPACITY = 0.28;
export const GLASS_SHEET_BACKDROP_BLUR_PX = 16;
export const GLASS_SHEET_BACKDROP_SATURATE = 1.12;
export const GLASS_SHEET_PANEL_BLUR_PX = 12;
export const GLASS_SHEET_OS_PANEL_BLUR_PX = GLASS_SHEET_PANEL_BLUR_PX;
export const GLASS_SHEET_PANEL_SATURATE = 1.22;
export const GLASS_SHEET_MOOD_GLASS_SATURATE = GLASS_SHEET_PANEL_SATURATE;
/**
 * Snappy out-curve for sheet presentation — fast attack, soft settle. No
 * overshoot: bottom-anchored panels would briefly lift off the viewport edge.
 * Keep in sync with the enter/transition eases in glass-sheet.css.
 */
const SHEET_PRESENTATION_EASE = 'cubic-bezier(0.2, 0.9, 0.24, 1)';

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

/** Resting peek offset — 0 when content is shorter than the peek viewport window. */
export function resolveSheetPeekOffsetPx(
  panelHeightPx: number,
  peekRatio: number,
  viewportHeightPx: number
): number {
  if (panelHeightPx <= 0 || viewportHeightPx <= 0) {
    return 0;
  }

  return Math.max(0, panelHeightPx - viewportHeightPx * peekRatio);
}

export function resolveSheetOffsetPx(
  dragPx: number | null,
  detent: GlassSheetDetent,
  panelHeightPx: number,
  peekRatio: number,
  isDesktop: boolean,
  viewportHeightPx = typeof window !== 'undefined' ? window.innerHeight : 0
): number {
  if (panelHeightPx <= 0) {
    return 0;
  }
  // Drag wins on mobile and desktop — desktop only skips peek rest offset.
  if (dragPx != null) {
    return dragPx;
  }
  if (isDesktop || detent === 'full') {
    return 0;
  }
  return resolveSheetPeekOffsetPx(panelHeightPx, peekRatio, viewportHeightPx);
}

/** 0 = fully presented, 1 = sheet fully translated down (portfolio revealed).
 * Backdrop dims + blurs the page under the sheet. Safe inside a hosted OS card
 * (`glass-sheet-root--hosted`) — blur stays clipped to the phone frame.
 */
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

  const blurPx = GLASS_SHEET_BACKDROP_BLUR_PX * strength;
  const saturate = 1 + (GLASS_SHEET_BACKDROP_SATURATE - 1) * strength;

  return {
    opacity: strength,
    filter: `blur(${blurPx}px) saturate(${saturate})`,
  };
}

export function resolvePanelPresentation(
  coverProgress: number,
  _tone: GlassSheetTone,
  _moodId?: string,
  options?: { reduceTransparency?: boolean }
): string {
  if (options?.reduceTransparency) {
    return 'blur(0px)';
  }

  const strength = 1 - clamp01(coverProgress);
  const blurPx = GLASS_SHEET_PANEL_BLUR_PX;
  const saturate = GLASS_SHEET_PANEL_SATURATE;

  if (strength <= 0) {
    return 'blur(0px)';
  }

  return `blur(${blurPx * strength}px) saturate(${1 + (saturate - 1) * strength})`;
}

export function glassSheetBackdropFilterStyle(
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

/** Highest visible glass sheet — nested Escape should not dismiss the parent. */
export function isTopmostVisibleGlassSheet(root: HTMLElement): boolean {
  const roots = Array.from(
    root.ownerDocument.querySelectorAll<HTMLElement>(
      '.glass-sheet-root.is-visible'
    )
  );
  if (roots.length === 0) return true;
  let top: HTMLElement | null = null;
  let topZ = Number.NEGATIVE_INFINITY;
  for (const el of roots) {
    const z = Number.parseFloat(el.style.zIndex || getComputedStyle(el).zIndex);
    const zValue = Number.isFinite(z) ? z : 0;
    if (zValue >= topZ) {
      topZ = zValue;
      top = el;
    }
  }
  return top === root;
}

/** Static scrim blur for custom sheets (e.g. OS launcher). */
export function resolveGlassScrimBackdropFilter(options?: {
  reduceTransparency?: boolean;
}): string {
  if (options?.reduceTransparency) {
    return 'blur(0px)';
  }

  return `blur(${GLASS_SHEET_BACKDROP_BLUR_PX}px) saturate(${GLASS_SHEET_BACKDROP_SATURATE})`;
}

/** Static OS panel blur for custom sheets (e.g. OS launcher). */
export function resolveOsGlassPanelFilter(options?: {
  reduceTransparency?: boolean;
}): string {
  if (options?.reduceTransparency) {
    return 'blur(0px)';
  }

  return `blur(${GLASS_SHEET_OS_PANEL_BLUR_PX}px) saturate(${GLASS_SHEET_PANEL_SATURATE})`;
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
  /**
   * `enter` slides the sheet up; `appear` fades in place (page-like);
   * `swap` keeps the shell mounted for in-place panel changes.
   */
  presentation?: GlassSheetPresentation;
  zIndex?: number;
  ariaLabelledBy: string;
  backdropLabel?: string;
  header?: ReactNode;
  /** Slot below the scroll body (e.g. action dock). */
  footer?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  /** Scroll container for nested infinite lists (`.glass-sheet-body`). */
  bodyRef?: Ref<HTMLDivElement | null>;
  panelClassName?: string;
  rootClassName?: string;
  /**
   * Panel height mode. `hug` opens to content (max 90dvh) and grows as needed;
   * `full` (default) uses the near-viewport sheet height.
   */
  sizing?: GlassSheetSizing;
  /**
   * When false, hide the grip and disable drag-to-dismiss (page-like overlays).
   * Close still works via header control, backdrop, and Escape. Default true.
   */
  dragDismiss?: boolean;
  /**
   * Portal mount node. Defaults to {@link GlassSheetPortalProvider} host, then
   * `document.body`. Prefer the OS column host so frost blur stays inside the page frame.
   */
  portalContainer?: HTMLElement | null;
  /**
   * Panel material. `page` is opaque OS/slide fill (`--mood-bg` / `--bg`) with
   * no frost and no scrim. Default `glass`.
   */
  surface?: GlassSheetSurface;
  /**
   * When true, portfolio summon dock stays visible above this sheet
   * (`data-keep-dock` — opt out of overlay dock tuck).
   */
  keepDock?: boolean;
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
    const autoFocusTarget = focusables.find((element) =>
      element.hasAttribute('autofocus')
    );
    // Skip chrome search (and similar) so opening a page sheet does not
    // land focus in the nav field.
    const preferredTarget = focusables.find(
      (element) => !element.closest('[data-sheet-initial-focus-skip]')
    );
    const initialTarget = autoFocusTarget ?? preferredTarget ?? panel;
    if (initialTarget === panel) {
      panel.tabIndex = -1;
    }
    initialTarget.focus({ preventScroll: true });

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
  panelRef: React.RefObject<HTMLDivElement | null>,
  panelHeightPx: number
) {
  const dragState = useRef<{
    startY: number;
    baseY: number;
    panelH: number;
    currentY: number;
    active: boolean;
  } | null>(null);

  const [detent, setDetent] = useState<Detent>(initialDetent);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // Re-apply on every open so HMR / prior peeks cannot leave a stale detent.
    setDetent(initialDetent);
    setDragPx(null);
    setDragging(false);
    dragState.current = null;
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
      if (event.key !== 'Escape') return;
      const root =
        panelRef.current?.closest<HTMLElement>('.glass-sheet-root') ?? null;
      if (!root || !isTopmostVisibleGlassSheet(root)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
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
    (panelH: number) =>
      resolveSheetPeekOffsetPx(panelH, peekRatio, window.innerHeight),
    [peekRatio]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const panelH = panel.offsetHeight;
      const baseY = dragPx ?? (detent === 'full' ? 0 : peekPxFor(panelH));
      dragState.current = {
        startY: event.clientY,
        baseY,
        panelH,
        currentY: baseY,
        active: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [detent, dragPx, panelRef, peekPxFor]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state) {
        return;
      }
      const deltaY = event.clientY - state.startY;
      if (!state.active && Math.abs(deltaY) < DRAG_ACTIVATION_PX) {
        return;
      }
      if (!state.active) {
        state.active = true;
        setDragging(true);
      }
      const next = Math.min(state.panelH, Math.max(0, state.baseY + deltaY));
      state.currentY = next;
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

    if (!state.active) {
      setDragPx(null);
      return;
    }

    // Desktop rests at full — dismiss after a short pull; mobile keeps peek.
    const peekPx = isMobile() ? peekPxFor(state.panelH) : 0;
    const current = state.currentY;

    if (current > peekPx + DISMISS_GAP_PX) {
      onClose();
      return;
    }

    setDragPx(null);
    if (peekPx <= 0) {
      setDetent('full');
      return;
    }

    setDetent(current < peekPx / 2 ? 'full' : 'peek');
  }, [isMobile, onClose, peekPxFor]);

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
    if (panelHeightPx > 0 && typeof window !== 'undefined') {
      return `${resolveSheetPeekOffsetPx(panelHeightPx, peekRatio, window.innerHeight)}px`;
    }
    return `calc(100% - ${Math.round(peekRatio * 100)}dvh)`;
  }, [detent, dragPx, isDesktopSheet, panelHeightPx, peekRatio]);

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

export function usePrefersReducedTransparency(): boolean {
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

function useGlassSheetPortalTarget(
  portalContainer?: HTMLElement | null
): HTMLElement | null {
  const contextHost = useContext(GlassSheetPortalContext);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setBody(document.body);
  }, []);

  if (portalContainer !== undefined) {
    return portalContainer ?? body;
  }

  return contextHost ?? body;
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
      const closeProp =
        presentationRef.current === 'appear' ? 'opacity' : 'transform';
      if (event.propertyName !== closeProp || visible) {
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

/** Frosted sheet — peek/drag dismiss, or page-like with dragDismiss={false}. */
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
  footer,
  children,
  bodyClassName,
  bodyRef,
  panelClassName,
  rootClassName,
  sizing = 'full',
  dragDismiss = true,
  portalContainer,
  surface = 'glass',
  keepDock = false,
}: GlassSheetProps) {
  const opaquePage = surface === 'page';
  const panelRef = useRef<HTMLDivElement>(null);
  const portalTarget = useGlassSheetPortalTarget(portalContainer);
  const hostedInClipHost =
    portalTarget != null &&
    typeof document !== 'undefined' &&
    portalTarget !== document.body;
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
    panelRef,
    panelHeightPx
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

  const backdropPresentation = opaquePage
    ? { opacity: 0, filter: 'blur(0px)' }
    : resolveBackdropPresentation(coverProgress, {
        reduceTransparency,
      });
  const panelFilter = opaquePage
    ? 'blur(0px)'
    : resolvePanelPresentation(coverProgress, tone, moodId, {
        reduceTransparency,
      });
  const moodAttr = moodId ? moodId : undefined;

  useEffect(() => {
    if (!open) {
      setEnterAnimationDone(false);
    }
  }, [open]);

  const showEnterAnimation =
    (presentation === 'enter' || presentation === 'appear') &&
    visible &&
    !enterAnimationDone;

  const handlePanelAnimationEnd = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (
        event.animationName !== 'glass-sheet-enter' &&
        event.animationName !== 'glass-sheet-appear'
      ) {
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
        hostedInClipHost && 'glass-sheet-root--hosted',
        rootClassName
      )}
      data-tone={tone}
      data-mood={moodAttr}
      data-surface={surface}
      data-presentation={presentation}
      data-keep-dock={keepDock ? 'true' : undefined}
      style={{ zIndex }}
      role="presentation"
    >
      {opaquePage ? null : (
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
      )}

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
        data-mood={moodAttr}
        data-surface={surface}
        data-presentation={presentation}
        data-sizing={sizing}
        style={
          {
            '--sheet-y': sheetY,
            ...(dragging ? { transform: `translateY(${sheetY})` } : {}),
            ...panelStyle,
          } as CSSProperties
        }
        onTransitionEnd={handlePanelTransitionEnd}
        onAnimationEnd={handlePanelAnimationEnd}
      >
        {opaquePage ? null : (
          <div
            className="glass-sheet-frost"
            aria-hidden
            style={glassSheetBackdropFilterStyle(panelFilter, {
              transition: presentationTransition,
            })}
          />
        )}

        {dragDismiss ? (
          <div
            className="glass-sheet-drag"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <span className="glass-sheet-grip" aria-hidden />
          </div>
        ) : null}

        {header}

        <div ref={bodyRef} className={cn('glass-sheet-body', bodyClassName)}>
          {children}
        </div>

        {footer ? <div className="glass-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );

  return createPortal(sheet, portalTarget);
}

export interface SheetCloseButtonProps {
  onClick: () => void;
  ariaLabel: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

export function SheetCloseButton({
  onClick,
  ariaLabel,
  className,
  ref,
}: SheetCloseButtonProps) {
  return (
    <OsIconAction
      ref={ref}
      onClick={onClick}
      ariaLabel={ariaLabel}
      className={className}
    >
      <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}

export interface SheetHeaderProps {
  titleId?: string;
  title: ReactNode;
  /** Quiet kind line above the title (facts: Hub / Guild / Account). */
  eyebrow?: ReactNode;
  /** Sibling of the title (e.g. Clear) — stays outside the heading. */
  titleAccessory?: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  closeAriaLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export function SheetHeader({
  titleId,
  title,
  eyebrow,
  titleAccessory,
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
        <div className="glass-sheet-header-title-row">
          <div className="glass-sheet-header-heading">
            {eyebrow ? (
              <p className="glass-sheet-header-eyebrow">{eyebrow}</p>
            ) : null}
            <h2 id={titleId} className="glass-sheet-header-title">
              {title}
            </h2>
            {subtitle ? (
              <p className="glass-sheet-header-subtitle">{subtitle}</p>
            ) : null}
          </div>
          {titleAccessory}
          {closeControl}
        </div>
      </div>
    </header>
  );
}
