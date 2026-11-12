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
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn.js';
import { useKeyboardDrawerFrame } from './keyboard-drawer-frame.js';
import {
  SHEET_DRAG_ACTIVATION_PX,
  sheetPullPointerCanDrag,
} from './sheet-body-pull.js';
import { useSheetSurfacePull } from './use-sheet-surface-pull.js';
import { useOverlayStackZ } from './overlay-stack.js';
import { MultiplyIcon } from './mage-stroke-icons.js';
import { resolveSheetMood, useMoodTheme } from './mood-theme.js';
import {
  decideSheetFocusCapture,
  decideSheetFocusRelease,
  readHandoffRestoreTarget,
  sheetHandoffFocusActive,
  stashHandoffRestoreTarget,
} from './sheet-handoff.js';
import {
  armCoverExitSuppression,
  baseOpeningBesides,
  claimAutoReplace,
  claimSheetPush,
  claimSheetReplace,
  clearCoverExitSuppression,
  handoffExitArmed,
  markSheetGone,
  reportSheetPresence,
  otherBaseSheetCount,
  SHEET_HANDOFF_COVER_MS,
  otherOpenSheetCount,
  registerOpenSheet,
  resolveSheetMotion,
  sheetIsCovered,
  subscribeOpenSheets,
  unregisterOpenSheet,
  type SheetOp,
  type SheetStackKind,
  type SheetStackRole,
} from './sheet-motion.js';
import { OsIconAction, osIconActionClassName } from './os-icon-action.js';
import { OsStableScrollHost } from './os-stable-scroll-host.js';

/**
 * Optional clip host for GlassSheet (e.g. OS phone card). When set, sheets
 * portal into that node instead of `document.body` so backdrop-filter blur
 * cannot paint past the desktop column edges.
 *
 * `resolveHost` runs only while `container` is empty, so a card already in
 * the DOM wins over the window during the commit before the host registers.
 */
type GlassSheetPortalContextValue = {
  container: HTMLElement | null;
  resolveHost: (() => HTMLElement | null) | null;
};

const GlassSheetPortalContext = createContext<GlassSheetPortalContextValue>({
  container: null,
  resolveHost: null,
});

export function GlassSheetPortalProvider({
  container,
  resolveHost = null,
  children,
}: {
  container: HTMLElement | null;
  resolveHost?: (() => HTMLElement | null) | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ container, resolveHost }),
    [container, resolveHost]
  );
  return (
    <GlassSheetPortalContext.Provider value={value}>
      <OsStableScrollHost />
      {children}
    </GlassSheetPortalContext.Provider>
  );
}

/** @deprecated Use {@link osIconActionClassName} from `./os-icon-action.js`. */
export const sheetIconActionClassName = osIconActionClassName;

export type GlassSheetTone = 'os' | 'mood-thread';
export type GlassSheetDetent = 'peek' | 'full';
export type GlassSheetPresentation = 'enter' | 'swap' | 'appear';
/**
 * `hug` = content-sized up to 90dvh; `full` = default near-viewport height;
 * `band` = fill a host whose height is owned outside the sheet (film thread).
 * Band renders in place: no viewport portal, no slide.
 */
export type GlassSheetSizing = 'hug' | 'full' | 'band';
/**
 * `glass` — frosted panel + dim/blur scrim.
 * `page` — opaque canvas (`--bg`, or an opaque mood mix when `data-mood` is
 * set). Never inherit a transparent `--mood-bg` (Glass/Carbon frames).
 */
export type GlassSheetSurface = 'glass' | 'page';

export const GLASS_SHEET_PEEK_RATIO = 0.62;
const DISMISS_GAP_PX = 96;

/**
 * A release always clears the drag offset. Past the dismiss gap the host is
 * asked to close; if the host keeps the sheet open, the cleared offset is
 * the settle back to rest.
 */
export function resolveSheetPointerRelease(input: {
  currentY: number;
  peekPx: number;
  dismissGapPx: number;
}): { requestClose: boolean; dragPx: null } {
  return {
    requestClose: input.currentY > input.peekPx + input.dismissGapPx,
    dragPx: null,
  };
}
const MOBILE_MAX_WIDTH_PX = 767;
const SHEET_TRANSITION_MS = 320;
/** Consecutive equal hug height samples before arming enter (avoids open→shrink). */
const HUG_ENTER_STABLE_MATCHES = 2;
/**
 * Stop waiting and slide in. A list that keeps changing height (skeleton,
 * then an error) must not leave the panel translated off-screen.
 */
export const HUG_ENTER_ARM_DEADLINE_MS = 80;
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

export type HugEnterSampleState = {
  lastHeightPx: number;
  matches: number;
};

/** Whether hug sheets should wait for a settled layout before the enter slide. */
export function hugEnterNeedsArming(
  sizing: GlassSheetSizing,
  presentation: GlassSheetPresentation
): boolean {
  return (
    sizing === 'hug' && (presentation === 'enter' || presentation === 'appear')
  );
}

/**
 * Track consecutive equal content heights. Arm once the hug panel has held
 * the same height for `neededMatches` samples (layout settle before enter).
 */
export function nextHugEnterStableSample(
  state: HugEnterSampleState,
  heightPx: number,
  neededMatches = HUG_ENTER_STABLE_MATCHES
): { state: HugEnterSampleState; armed: boolean } {
  if (heightPx <= 0) {
    return { state: { lastHeightPx: 0, matches: 0 }, armed: false };
  }
  if (heightPx === state.lastHeightPx) {
    const matches = state.matches + 1;
    return {
      state: { lastHeightPx: heightPx, matches },
      armed: matches >= neededMatches,
    };
  }
  return {
    state: { lastHeightPx: heightPx, matches: 1 },
    armed: neededMatches <= 1,
  };
}

/** Arm on a settled height, or once the wait has run long enough to slide in. */
export function hugEnterShouldArm(
  sampleArmed: boolean,
  elapsedMs: number,
  deadlineMs = HUG_ENTER_ARM_DEADLINE_MS
): boolean {
  return sampleArmed || elapsedMs >= deadlineMs;
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
  options?: { opacity?: number; transition?: string; pointerEvents?: 'none' }
): CSSProperties {
  return {
    opacity: options?.opacity,
    transition: options?.transition,
    pointerEvents: options?.pointerEvents,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
  };
}

export type BackdropEnterStyle = {
  opacity?: number;
  filter: string;
  transition?: string;
};

/**
 * Scrim for one open.
 * A hug drawer stays off-screen until its height settles. The page stays
 * clear for that wait, then the enter animation fades the scrim once.
 * Drawer replace keeps one dim (`handoffScrim`) on the sheet that is arriving.
 * The sheet that is leaving drops its copy (`suppressScrim`) in that same
 * paint, so two blurs never stack and the page does not pulse.
 */
export function resolveBackdropEnterStyle(input: {
  holdScrim: boolean;
  /** Replace handoff — inherit resting dim/blur, do not clear the column. */
  handoffScrim?: boolean;
  /** Leaving drawer. The successor already owns the column scrim. */
  suppressScrim?: boolean;
  showEnterAnimation: boolean;
  presented: { opacity: number; filter: string };
  transition: string;
}): BackdropEnterStyle {
  if (input.suppressScrim) {
    return { opacity: 0, filter: 'blur(0px)', transition: 'none' };
  }
  if (input.handoffScrim) {
    return {
      opacity: input.presented.opacity,
      filter: input.presented.filter,
      transition: 'none',
    };
  }
  if (input.holdScrim) {
    return { opacity: 0, filter: 'blur(0px)', transition: 'none' };
  }
  if (input.showEnterAnimation) {
    return { filter: input.presented.filter };
  }
  return {
    opacity: input.presented.opacity,
    filter: input.presented.filter,
    transition: input.transition,
  };
}

/**
 * Opaque page sheets skip the scrim at rest. While `appear` is running the
 * panel is still transparent — keep drawer-grade dim/blur underneath.
 */
export function pageTransitionScrimActive(input: {
  opaquePage: boolean;
  presentation: GlassSheetPresentation;
  visible: boolean;
  enterAnimationDone: boolean;
}): boolean {
  return (
    input.opaquePage &&
    input.presentation === 'appear' &&
    input.visible &&
    !input.enterAnimationDone
  );
}

/** Drawer replace must stay dim before enter paints visible (two rAFs). */
export function sheetBackdropCoverProgress(input: {
  visible: boolean;
  coverProgressWhenVisible: number;
  keepsColumnDim: boolean;
}): number {
  if (!input.visible) {
    return input.keepsColumnDim ? 0 : 1;
  }
  return input.coverProgressWhenVisible;
}

/** Photo / listen face band. Sheets opened while a face is already up rise by this. */
export const GLASS_SHEET_MEDIA_FACE_LIFT = 80;

/**
 * A sheet that opens under an already-open media face sits above the film.
 * A sheet that was already open stays on its own band — a face opened later
 * must not lift the parent over the stage.
 */
export function resolveGlassSheetZIndex(
  zIndex: number,
  openedAboveMediaFace: boolean
): number {
  if (!openedAboveMediaFace) return zIndex;
  return zIndex + GLASS_SHEET_MEDIA_FACE_LIFT;
}

function mediaFaceAlreadyOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector('[data-os-slide-over="true"]:not(.is-closing)')
  );
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
  /**
   * Preset CSS vars for this sheet. When omitted, a `MoodThemeProvider`
   * ancestor supplies the page mood. An explicit `moodId` still wins.
   */
  moodStyle?: CSSProperties;
  panelStyle?: CSSProperties;
  peekRatio?: number;
  /** Mobile resting detent when the sheet opens. Desktop always opens full height. */
  initialDetent?: GlassSheetDetent;
  /**
   * Held only for an in-place page (`swap`) or an explicit fade (`appear`).
   * The stack otherwise decides: present, push, replace, or cover.
   */
  presentation?: GlassSheetPresentation;
  /**
   * `overlay` is a cover. `auto` is a sheet the stack places.
   */
  stack?: SheetStackRole;
  /**
   * `page` fades onto an empty column and slides when it pushes.
   * `sheet` slides onto an empty column.
   */
  sheetSurface?: 'sheet' | 'page';
  zIndex?: number;
  ariaLabelledBy: string;
  backdropLabel?: string;
  header?: ReactNode;
  /**
   * Grip rendered when `dragDismiss` is false. Band sheets pass the host's
   * resize slider so the sheet does not own the drag.
   */
  grip?: ReactNode;
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
   * Hold a hug sheet off-screen until the host has the list that sizes it.
   * The first slide uses that height. A loading stand-in must not open the
   * frame and then grow when the rows arrive.
   */
  deferEnter?: boolean;
  /**
   * When false, hide the grip and disable drag-to-dismiss (page-like overlays).
   * Close still works via header control, backdrop, and Escape. Default true.
   */
  dragDismiss?: boolean;
  /**
   * Portal mount node. Defaults to {@link GlassSheetPortalProvider} host, then
   * that provider's `resolveHost`, then `document.body`. Prefer the OS column
   * host so frost blur stays inside the page frame. Pass `null` to force the window.
   */
  portalContainer?: HTMLElement | null;
  /**
   * Panel material. `page` is an opaque canvas (`--bg` / opaque mood mix)
   * with no frost and no scrim. Default `glass` (frost + dim scrim).
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

    const handed = sheetHandoffFocusActive()
      ? readHandoffRestoreTarget()
      : null;
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    restoreFocusRef.current = decideSheetFocusCapture(handed, activeElement);

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

      const decision = decideSheetFocusRelease({
        handoffActive: sheetHandoffFocusActive(),
        panelConnected: panel.isConnected,
        restoreTarget: restoreFocusRef.current,
      });
      if (decision.stashTarget) stashHandoffRestoreTarget(decision.stashTarget);
      const restoreTarget = decision.focusTarget;
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
    pointerId: number;
  } | null>(null);
  const dragWindowCleanup = useRef<(() => void) | null>(null);

  const [detent, setDetent] = useState<Detent>(initialDetent);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const clearDragWindowListeners = useCallback(() => {
    dragWindowCleanup.current?.();
    dragWindowCleanup.current = null;
  }, []);

  useEffect(() => {
    // Re-apply on every open so HMR / prior peeks cannot leave a stale detent.
    setDetent(initialDetent);
    setDragPx(null);
    setDragging(false);
    dragState.current = null;
    clearDragWindowListeners();
  }, [clearDragWindowListeners, initialDetent, open]);

  useEffect(() => () => clearDragWindowListeners(), [clearDragWindowListeners]);

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

  const handlePointerMove = useCallback((event: { clientY: number }) => {
    const state = dragState.current;
    if (!state) {
      return;
    }
    const deltaY = event.clientY - state.startY;
    if (!state.active && Math.abs(deltaY) < SHEET_DRAG_ACTIVATION_PX) {
      return;
    }
    if (!state.active) {
      state.active = true;
      setDragging(true);
    }
    const next = Math.min(state.panelH, Math.max(0, state.baseY + deltaY));
    state.currentY = next;
    setDragPx(next);
  }, []);

  const handlePointerEnd = useCallback(() => {
    const state = dragState.current;
    if (!state) {
      return;
    }
    dragState.current = null;
    clearDragWindowListeners();
    setDragging(false);

    if (!state.active) {
      setDragPx(null);
      return;
    }

    // Desktop rests at full — dismiss after a short pull; mobile keeps peek.
    const peekPx = isMobile() ? peekPxFor(state.panelH) : 0;
    const release = resolveSheetPointerRelease({
      currentY: state.currentY,
      peekPx,
      dismissGapPx: DISMISS_GAP_PX,
    });
    if (release.requestClose) onClose();
    setDragPx(release.dragPx);
    if (release.requestClose) return;

    if (peekPx <= 0) {
      setDetent('full');
      return;
    }

    setDetent(state.currentY < peekPx / 2 ? 'full' : 'peek');
  }, [clearDragWindowListeners, isMobile, onClose, peekPxFor]);

  const beginPointerDrag = useCallback(
    (
      startY: number,
      capture: { setPointerCapture?: (pointerId: number) => void } | null,
      pointerId: number
    ) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      clearDragWindowListeners();
      const panelH = panel.offsetHeight;
      const baseY = dragPx ?? (detent === 'full' ? 0 : peekPxFor(panelH));
      dragState.current = {
        startY,
        baseY,
        panelH,
        currentY: baseY,
        active: false,
        pointerId,
      };
      // Window listeners keep the drag alive when setPointerCapture fails
      // (Playwright mouse, synthetic pointers, nested portals).
      const onWindowMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        handlePointerMove(event);
      };
      const onWindowUp = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        handlePointerEnd();
      };
      window.addEventListener('pointermove', onWindowMove);
      window.addEventListener('pointerup', onWindowUp);
      window.addEventListener('pointercancel', onWindowUp);
      dragWindowCleanup.current = () => {
        window.removeEventListener('pointermove', onWindowMove);
        window.removeEventListener('pointerup', onWindowUp);
        window.removeEventListener('pointercancel', onWindowUp);
      };
      try {
        capture?.setPointerCapture?.(pointerId);
      } catch {
        // Capture is optional — window listeners own the gesture.
      }
    },
    [
      clearDragWindowListeners,
      detent,
      dragPx,
      handlePointerEnd,
      handlePointerMove,
      panelRef,
      peekPxFor,
    ]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!sheetPullPointerCanDrag(event.pointerType)) return;
      beginPointerDrag(event.clientY, event.currentTarget, event.pointerId);
    },
    [beginPointerDrag]
  );

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
    beginPointerDrag,
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
  const portal = useContext(GlassSheetPortalContext);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setBody(document.body);
  }, []);

  const probed = portal.resolveHost?.() ?? null;
  return resolveGlassPortalNode({
    explicit: portalContainer,
    registered: portal.container,
    probed,
    body,
    yieldRegistered: portal.container
      ? portalHostShouldYield(portal.container)
      : false,
  });
}

/**
 * A feed card kept under the next screen is not a portal host. `covered`
 * is the steady state; `live` still steals clicks until that attribute
 * flips, because the front card’s page is what elementFromPoint hits.
 */
export function portalHostShouldYield(node: HTMLElement): boolean {
  if (node.closest('[data-feed-session="covered"]')) return true;
  if (!node.closest('[data-feed-session]')) return false;
  return Boolean(
    document.querySelector(
      '.feed-session-front .os-app-screen, .feed-session-front .portfolio-frame'
    )
  );
}

export function resolveGlassPortalNode(input: {
  /** `undefined` means "use the context host". `null` means document body. */
  explicit?: HTMLElement | null;
  registered: HTMLElement | null;
  probed: HTMLElement | null;
  body: HTMLElement | null;
  yieldRegistered: boolean;
}): HTMLElement | null {
  if (input.explicit !== undefined) return input.explicit ?? input.body;
  if (input.registered && !input.yieldRegistered) return input.registered;
  return input.probed ?? input.body;
}

/**
 * Opening keeps the sheet mounted and invisible for two frames. That window
 * must not arm the close timer — a busy frame (the kept Home feed, a slow
 * profile) lets the 320ms timer fire before the enter frames, and `onClosed`
 * tears the sheet down as a flash.
 */
export function sheetPresenceCloseShouldFinish(input: {
  open: boolean;
  mounted: boolean;
  visible: boolean;
}): boolean {
  return input.mounted && !input.open && !input.visible;
}

/**
 * Swap and appear must be on screen for this paint. Waiting for an effect
 * leaves a frame where the previous drawer is gone and the page shows —
 * the jump from guild settings into edit.
 */
export function sheetPresenceNeedsSwapReveal(input: {
  open: boolean;
  presentation: GlassSheetPresentation;
  visible: boolean;
}): boolean {
  return (
    input.open &&
    !input.visible &&
    (input.presentation === 'swap' || input.presentation === 'appear')
  );
}

/** True when open should paint this frame (fade or cut), not wait two rAFs. */
export function sheetPresenceOpensVisible(
  presentation: GlassSheetPresentation
): boolean {
  return presentation === 'swap' || presentation === 'appear';
}

/** Post-card ⋯ mounts `<ActionDrawer open />` — no closed→open transition on first paint. */
export function sheetPresenceInitialState(input: {
  open: boolean;
  presentation: GlassSheetPresentation;
}): { mounted: boolean; visible: boolean } {
  return {
    mounted: input.open,
    visible: input.open && sheetPresenceOpensVisible(input.presentation),
  };
}

function useSheetPresence(
  open: boolean,
  onClosed?: () => void,
  presentation: GlassSheetPresentation = 'enter'
) {
  const [mounted, setMounted] = useState(
    () => sheetPresenceInitialState({ open, presentation }).mounted
  );
  const [visible, setVisible] = useState(
    () => sheetPresenceInitialState({ open, presentation }).visible
  );
  const [trackedOpen, setTrackedOpen] = useState(open);
  const [holdingExit, setHoldingExit] = useState(false);
  const closeFinishedRef = useRef(false);
  const holdExitRef = useRef(false);
  const presentationRef = useRef(presentation);
  const openRef = useRef(open);
  presentationRef.current = presentation;
  openRef.current = open;

  // Appear and swap paint this frame. Enter still waits two rAFs so the slide
  // can start from off-screen.
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (open) {
      closeFinishedRef.current = false;
      holdExitRef.current = false;
      setHoldingExit(false);
      setMounted(true);
      setVisible(sheetPresenceOpensVisible(presentation));
    }
  } else if (sheetPresenceNeedsSwapReveal({ open, presentation, visible })) {
    setMounted(true);
    setVisible(true);
  } else if (open && !mounted) {
    // Parent mounted us already open (`open ? <ActionDrawer open />`).
    setMounted(true);
    if (sheetPresenceOpensVisible(presentation)) setVisible(true);
  }

  const holdExit = useCallback(() => {
    holdExitRef.current = true;
    setHoldingExit(true);
  }, []);

  useEffect(() => {
    if (!open || sheetPresenceOpensVisible(presentationRef.current)) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!openRef.current) return;
        setVisible(true);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);
  // Identity must stay stable. A parent that passes a fresh `onClosed`
  // every render was clearing the close timer before the sheet could leave,
  // so a dying drawer stayed under the pointer for the whole test.
  const finishClose = useCallback(() => {
    if (closeFinishedRef.current || openRef.current) {
      return;
    }
    closeFinishedRef.current = true;
    holdExitRef.current = false;
    setHoldingExit(false);
    setMounted(false);
    onClosedRef.current?.();
  }, []);

  useEffect(() => {
    if (open) return;
    if (holdExitRef.current) {
      const timer = window.setTimeout(finishClose, SHEET_HANDOFF_COVER_MS);
      return () => window.clearTimeout(timer);
    }
    holdExitRef.current = false;
    setHoldingExit(false);
    setVisible(false);
  }, [finishClose, open]);

  useEffect(() => {
    if (!sheetPresenceCloseShouldFinish({ open, mounted, visible })) {
      return;
    }

    const timer = window.setTimeout(finishClose, SHEET_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [finishClose, mounted, open, visible]);

  const handlePanelTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const closeProp =
        presentationRef.current === 'appear' ? 'opacity' : 'transform';
      if (event.propertyName !== closeProp || visible || openRef.current) {
        return;
      }
      finishClose();
    },
    [finishClose, visible]
  );

  return {
    mounted,
    visible,
    holdingExit,
    finishClose,
    holdExit,
    handlePanelTransitionEnd,
  };
}

function useClaimedStackOp(
  open: boolean,
  stack: SheetStackRole,
  menuOpen: boolean,
  id: symbol
): { replace: boolean; push: boolean } {
  const replaceRef = useRef(false);
  const pushRef = useRef(false);
  const menuHandoffRef = useRef(false);
  const wasOpenRef = useRef(false);
  const [, setLatchEpoch] = useState(0);
  if (stack !== 'overlay' && open && !wasOpenRef.current) {
    // Latch once. A menu unregisters on the next layout, and a sibling
    // drawer may not have reported its close until this render finishes.
    const claimed = claimSheetReplace();
    const leaving = claimAutoReplace(id);
    if (menuOpen || leaving || claimed) {
      armCoverExitSuppression();
      menuHandoffRef.current = true;
    }
    replaceRef.current = claimed || menuOpen || leaving;
    pushRef.current = replaceRef.current ? false : claimSheetPush();
  } else if (!open) {
    replaceRef.current = false;
    pushRef.current = false;
    menuHandoffRef.current = false;
  }
  wasOpenRef.current = open;
  useLayoutEffect(() => {
    if (!open || stack === 'overlay' || replaceRef.current) return;
    if (!claimAutoReplace(id)) return;
    replaceRef.current = true;
    pushRef.current = false;
    armCoverExitSuppression();
    menuHandoffRef.current = true;
    setLatchEpoch((epoch) => epoch + 1);
  }, [id, open, stack]);
  useLayoutEffect(() => {
    if (!open || !menuHandoffRef.current) return;
    const timer = window.setTimeout(
      clearCoverExitSuppression,
      SHEET_HANDOFF_COVER_MS
    );
    return () => window.clearTimeout(timer);
  }, [open]);
  return {
    replace: open && replaceRef.current,
    push: open && pushRef.current,
  };
}

function stackKindFor(
  stack: SheetStackRole,
  sheetSurface: 'sheet' | 'page'
): SheetStackKind {
  if (stack === 'overlay') return 'cover';
  return sheetSurface === 'page' ? 'page' : 'sheet';
}

function useResolvedSheetMotion(
  open: boolean,
  band: boolean,
  requested: GlassSheetPresentation,
  stack: SheetStackRole,
  sheetSurface: 'sheet' | 'page'
): {
  presentation: GlassSheetPresentation;
  op: SheetOp;
  covered: boolean;
  shouldHoldExit: () => boolean;
} {
  const id = useRef(Symbol('glass-sheet')).current;
  const otherSheetsOpen = useSyncExternalStore(
    subscribeOpenSheets,
    () => otherOpenSheetCount(id),
    () => 0
  );
  const otherBaseSheets = useSyncExternalStore(
    subscribeOpenSheets,
    () => otherBaseSheetCount(id),
    () => 0
  );
  const covered = useSyncExternalStore(
    subscribeOpenSheets,
    () => open && sheetIsCovered(id),
    () => false
  );
  const kind = stackKindFor(stack, sheetSurface);
  const hadOpenRef = useRef(false);
  if (!band && (open || hadOpenRef.current)) {
    reportSheetPresence(id, kind, open);
    if (open) hadOpenRef.current = true;
    else hadOpenRef.current = false;
  }
  const claimed = useClaimedStackOp(
    open,
    stack,
    otherSheetsOpen > otherBaseSheets,
    id
  );
  const shouldHoldExit = useCallback(
    () => handoffExitArmed() || baseOpeningBesides(id),
    [id]
  );

  useLayoutEffect(() => {
    if (!open) return;
    registerOpenSheet(id, kind);
    return () => {
      unregisterOpenSheet(id);
      markSheetGone(id);
    };
  }, [id, kind, open]);

  const motion = resolveSheetMotion({
    band,
    requested,
    stack,
    kind: sheetSurface,
    claimedReplace: claimed.replace,
    claimedPush: claimed.push,
    otherSheetsOpen,
    otherBaseSheets,
  });
  return { ...motion, covered, shouldHoldExit };
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
  stack = 'auto',
  sheetSurface = 'sheet',
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
  deferEnter = false,
  dragDismiss = true,
  portalContainer,
  surface = 'glass',
  keepDock = false,
  moodStyle,
  grip,
}: GlassSheetProps) {
  const opaquePage = surface === 'page';
  const band = sizing === 'band';
  const rootRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardDrawerFrame(
    open && sizing !== 'band',
    rootRef,
    sheetSurface === 'page' ? 'page' : 'drawer'
  );
  const motion = useResolvedSheetMotion(
    open,
    band,
    presentation,
    stack,
    sheetSurface
  );
  const effectivePresentation = motion.presentation;
  const stackOp = motion.op;
  const stackCovered = motion.covered;
  const shouldHoldExit = motion.shouldHoldExit;
  const inheritedMood = useMoodTheme();
  const resolvedMood = resolveSheetMood(
    { moodId, style: moodStyle },
    inheritedMood
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const [sheetBodyNode, setSheetBodyNode] = useState<HTMLDivElement | null>(
    null
  );
  const setSheetBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      setSheetBodyNode((current) => (current === node ? current : node));
      if (typeof bodyRef === 'function') bodyRef(node);
      else if (bodyRef) bodyRef.current = node;
    },
    [bodyRef]
  );
  const bodyPullApi = useRef({
    keyboardOpen: false,
    beginPointerDrag: (
      _startY: number,
      _capture: { setPointerCapture?: (pointerId: number) => void } | null,
      _pointerId: number
    ) => {},
    handlePointerMove: (_event: { clientY: number }) => {},
    handlePointerEnd: () => {},
  });

  useSheetSurfacePull({
    enabled: Boolean(dragDismiss && !band && sheetBodyNode),
    panel: sheetBodyNode?.parentElement ?? null,
    scrollBody: sheetBodyNode,
    apiRef: bodyPullApi,
  });
  const portalTarget = useGlassSheetPortalTarget(portalContainer);
  const hostedInClipHost =
    portalTarget != null &&
    typeof document !== 'undefined' &&
    portalTarget !== document.body;
  const reduceTransparency = usePrefersReducedTransparency();
  const [openedAboveMediaFace, setOpenedAboveMediaFace] = useState(false);
  const [enterAnimationDone, setEnterAnimationDone] = useState(false);
  const [hugEnterArmed, setHugEnterArmed] = useState(false);
  const [panelHeightPx, setPanelHeightPx] = useState(0);
  const [isDesktopSheet, setIsDesktopSheet] = useState(false);
  // Presence follows the caller's `open`, not portal readiness. A one-frame
  // host gap must not run the close timer — that calls `onClosed` and a
  // choice menu stays shut after the option unmounts.
  const { mounted, visible, holdingExit, holdExit, handlePanelTransitionEnd } =
    useSheetPresence(open, onClosed, effectivePresentation);

  const wasSheetOpenRef = useRef(open);
  useLayoutEffect(() => {
    const wasOpen = wasSheetOpenRef.current;
    wasSheetOpenRef.current = open;
    // Hold the drawer that is leaving. Sliding it off uncovers the page
    // before the next one has covered the slot.
    if (wasOpen && !open && shouldHoldExit()) {
      holdExit();
    }
  }, [holdExit, open, shouldHoldExit]);
  const {
    detent,
    dragging,
    dragPx,
    sheetY,
    beginPointerDrag,
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
  bodyPullApi.current = {
    keyboardOpen: keyboard.keyboardOpen,
    beginPointerDrag,
    handlePointerMove,
    handlePointerEnd,
  };

  // Post-card and guild feed ⋯ menus are overlay hugs — skip height settle.
  const skipHugEnterSettle =
    stack === 'overlay' &&
    sizing === 'hug' &&
    (effectivePresentation === 'enter' || effectivePresentation === 'appear');
  const hugEnterPending =
    !skipHugEnterSettle &&
    hugEnterNeedsArming(sizing, effectivePresentation) &&
    !enterAnimationDone;
  const panelIsOpen =
    visible &&
    !deferEnter &&
    (skipHugEnterSettle || !hugEnterPending || hugEnterArmed);
  const replaceEnterCover =
    !opaquePage &&
    !band &&
    open &&
    stackOp === 'replace' &&
    effectivePresentation === 'enter' &&
    (!enterAnimationDone || !visible || !panelIsOpen);
  const showEnterAnimation =
    !band &&
    (effectivePresentation === 'enter' || effectivePresentation === 'appear') &&
    panelIsOpen &&
    !enterAnimationDone;
  const draggingRef = useRef(dragging);
  const detentRef = useRef(detent);
  draggingRef.current = dragging;
  detentRef.current = detent;

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
      const nextHeight = panel.offsetHeight;
      // Drag math only. A resting sheet must not rewrite this on every
      // content pixel — that re-render is what shifts the lines.
      setPanelHeightPx((current) => {
        if (
          current > 0 &&
          !draggingRef.current &&
          detentRef.current === 'full'
        ) {
          return current;
        }
        return current === nextHeight ? current : nextHeight;
      });
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(panel);
    if (panel.parentElement) observer.observe(panel.parentElement);
    window.addEventListener('resize', syncHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, [mounted, open]);

  useLayoutEffect(() => {
    if (
      !mounted ||
      !visible ||
      deferEnter ||
      !hugEnterPending ||
      hugEnterArmed
    ) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    let cancelled = false;
    let sampleState: HugEnterSampleState = { lastHeightPx: 0, matches: 0 };
    let raf = 0;
    const startedAt = performance.now();

    const arm = () => {
      if (cancelled) return;
      setHugEnterArmed(true);
    };

    const sample = () => {
      if (cancelled) return;
      const next = nextHugEnterStableSample(sampleState, panel.offsetHeight);
      sampleState = next.state;
      if (hugEnterShouldArm(next.armed, performance.now() - startedAt)) {
        arm();
        return;
      }
      raf = window.requestAnimationFrame(sample);
    };

    const startSampling = () => {
      if (cancelled) return;
      raf = window.requestAnimationFrame(sample);
    };

    // Prefer fonts settled, but never block open — short fallback.
    let fontsTimer = 0;
    const fonts = document.fonts;
    if (fonts?.status === 'loaded') {
      startSampling();
    } else if (fonts?.ready) {
      void fonts.ready.then(() => {
        if (!cancelled) startSampling();
      });
      fontsTimer = window.setTimeout(startSampling, 48);
    } else {
      startSampling();
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (fontsTimer) window.clearTimeout(fontsTimer);
    };
  }, [
    deferEnter,
    mounted,
    visible,
    hugEnterPending,
    hugEnterArmed,
    portalTarget,
  ]);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH_PX + 1}px)`);
    const syncDesktop = () => setIsDesktopSheet(mq.matches);
    syncDesktop();
    mq.addEventListener('change', syncDesktop);
    return () => mq.removeEventListener('change', syncDesktop);
  }, []);

  const leavingReplaceHandoff =
    !opaquePage &&
    !band &&
    !open &&
    mounted &&
    visible &&
    (holdingExit || handoffExitArmed());
  const keepsColumnDim = replaceEnterCover || leavingReplaceHandoff;

  const coverProgress = useMemo(() => {
    const offsetPx = resolveSheetOffsetPx(
      dragPx,
      detent,
      panelHeightPx,
      peekRatio,
      isDesktopSheet
    );
    const whenVisible = resolveSheetCoverProgress(offsetPx, panelHeightPx);
    return sheetBackdropCoverProgress({
      visible,
      coverProgressWhenVisible: whenVisible,
      keepsColumnDim,
    });
  }, [
    detent,
    dragPx,
    isDesktopSheet,
    keepsColumnDim,
    panelHeightPx,
    peekRatio,
    visible,
  ]);

  const presentationTransition = dragging
    ? 'none'
    : `opacity ${SHEET_TRANSITION_MS}ms ${SHEET_PRESENTATION_EASE}, backdrop-filter ${SHEET_TRANSITION_MS}ms ${SHEET_PRESENTATION_EASE}`;

  const pageTransitionScrim = pageTransitionScrimActive({
    opaquePage,
    presentation: effectivePresentation,
    visible,
    enterAnimationDone,
  });
  const restingPageScrim = { opacity: 0, filter: 'blur(0px)' };
  const backdropPresentation = opaquePage
    ? pageTransitionScrim
      ? resolveBackdropPresentation(0, { reduceTransparency })
      : restingPageScrim
    : resolveBackdropPresentation(coverProgress, {
        reduceTransparency,
      });
  const backdropEnter = resolveBackdropEnterStyle({
    holdScrim: visible && !panelIsOpen && !replaceEnterCover && !keepsColumnDim,
    handoffScrim: replaceEnterCover || pageTransitionScrim,
    suppressScrim: leavingReplaceHandoff,
    showEnterAnimation:
      showEnterAnimation && !pageTransitionScrim && !keepsColumnDim,
    presented: backdropPresentation,
    transition: presentationTransition,
  });
  const panelFilter = opaquePage
    ? 'blur(0px)'
    : resolvePanelPresentation(coverProgress, tone, resolvedMood.moodId, {
        reduceTransparency,
      });
  const moodAttr = resolvedMood.moodId;

  useEffect(() => {
    if (open) return;
    // Do not tear down hug enter state while the panel is held for a replace —
    // that flickers panelIsOpen and jumps the column.
    if (handoffExitArmed()) return;
    setEnterAnimationDone(false);
    setHugEnterArmed(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!visible) return;
    const panel = panelRef.current;
    if (!panel) return;
    const children = panel.children;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (
        child instanceof HTMLElement &&
        child.classList.contains('glass-sheet-body')
      ) {
        child.scrollTop = 0;
      }
    }
  }, [visible]);

  const finishEnterAnimation = useCallback(() => {
    setEnterAnimationDone(true);
  }, []);

  const handlePanelAnimationEnd = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (
        event.animationName !== 'glass-sheet-enter' &&
        event.animationName !== 'glass-sheet-appear'
      ) {
        return;
      }
      finishEnterAnimation();
    },
    [finishEnterAnimation]
  );

  // Reduced-motion sets animation:none — animationend may never fire.
  useEffect(() => {
    if (!showEnterAnimation) return;
    const timer = window.setTimeout(
      finishEnterAnimation,
      SHEET_TRANSITION_MS + 48
    );
    return () => window.clearTimeout(timer);
  }, [finishEnterAnimation, showEnterAnimation]);

  const overlayFloor = resolveGlassSheetZIndex(zIndex, openedAboveMediaFace);
  // Stack as soon as the sheet is mounted. Waiting for the panel to arm
  // left the drawer at its floor, under the page or the sheet it covers.
  const overlayActive = mounted && !band && portalTarget != null;
  const overlay = useOverlayStackZ(overlayActive, overlayFloor, keepDock);
  const overlayTop = overlayActive && overlay.top;

  useSheetFocusTrap(
    overlayTop && panelIsOpen && portalTarget != null && !band,
    panelRef
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || band) return;
    // A close stays out of the tree even when it is still the top overlay.
    // Clearing inert here put the dying controls back under the pointer.
    // Only a closed or covered sheet leaves the tree. Waiting for the hug
    // slide made the name field inert while Playwright typed, then the
    // controlled value was wiped.
    if (!open || !overlayTop) {
      root.inert = true;
      return;
    }
    if (root.style.visibility === 'hidden') return;
    root.inert = false;
  }, [band, open, overlayTop]);

  useLayoutEffect(() => {
    if (!mounted) {
      setOpenedAboveMediaFace(false);
      return;
    }
    if (!open) return;
    // Sample once per open. A face that appears later must not lift this sheet.
    const faceOpen = mediaFaceAlreadyOpen();
    setOpenedAboveMediaFace((sampled) => sampled || faceOpen);
  }, [mounted, open]);

  if (band) {
    if (!open) return null;
  } else if (!mounted || !portalTarget) {
    return null;
  }

  const bandScrimStyle = glassSheetBackdropFilterStyle(
    reduceTransparency
      ? 'blur(0px)'
      : `blur(calc(${GLASS_SHEET_BACKDROP_BLUR_PX}px * var(--feed-thread-cover, 1))) saturate(${GLASS_SHEET_BACKDROP_SATURATE})`
  );

  const sheet = (
    <div
      className={cn(
        'glass-sheet-root',
        panelIsOpen && 'is-visible',
        showEnterAnimation &&
          stackOp !== 'replace' &&
          'glass-sheet-root--enter',
        hostedInClipHost && !band && 'glass-sheet-root--hosted',
        band && 'glass-sheet-root--band',
        rootClassName
      )}
      data-tone={tone}
      data-mood={moodAttr}
      data-surface={surface}
      data-presentation={effectivePresentation}
      data-stack-op={stackOp}
      data-stack-covered={stackCovered ? 'true' : undefined}
      data-sizing={sizing}
      data-sheet-leaving={!open && mounted ? 'true' : undefined}
      data-sheet-top={open && overlayTop ? 'true' : undefined}
      inert={!open && mounted ? true : undefined}
      ref={rootRef}
      data-keep-dock={keepDock ? 'true' : undefined}
      style={{
        zIndex: overlayActive ? overlay.z : overlayFloor,
        ...resolvedMood.style,
      }}
      role="presentation"
    >
      {opaquePage && !pageTransitionScrim ? null : pageTransitionScrim ? (
        <div
          className="glass-sheet-backdrop"
          aria-hidden
          style={glassSheetBackdropFilterStyle(backdropEnter.filter, {
            opacity: backdropEnter.opacity,
            transition: backdropEnter.transition,
            pointerEvents: 'none',
          })}
        />
      ) : band ? (
        <div
          className="glass-sheet-backdrop glass-sheet-band-scrim"
          aria-hidden
          style={bandScrimStyle}
        />
      ) : (
        <button
          type="button"
          className="glass-sheet-backdrop"
          onClick={() => {
            // Off-screen while hug enter is still arming — a click here is
            // the gesture that opened the menu, not a dismiss.
            if (!panelIsOpen) return;
            onClose();
          }}
          aria-label={backdropLabel}
          style={glassSheetBackdropFilterStyle(backdropEnter.filter, {
            opacity: backdropEnter.opacity,
            transition: backdropEnter.transition,
            pointerEvents: panelIsOpen ? undefined : 'none',
          })}
        />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal={band ? undefined : true}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          'glass-sheet-panel',
          panelIsOpen && 'is-open',
          showEnterAnimation && 'glass-sheet-panel--enter',
          dragging && 'is-dragging',
          keyboard.keyboardOpen && 'is-keyboard-open',
          panelClassName
        )}
        data-tone={tone}
        data-mood={moodAttr}
        data-surface={surface}
        data-presentation={effectivePresentation}
        data-stack-op={stackOp}
        data-stack-covered={stackCovered ? 'true' : undefined}
        data-sizing={sizing}
        style={
          {
            '--sheet-y': sheetY,
            ...(dragging ? { transform: `translateY(${sheetY})` } : {}),
            ...panelStyle,
            ...keyboard.style,
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

        {dragDismiss && !band ? (
          <div
            className="glass-sheet-drag"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <span className="glass-sheet-grip" aria-hidden />
          </div>
        ) : (
          grip
        )}

        {header}

        <div
          ref={setSheetBodyRef}
          className={cn('glass-sheet-body os-stable-scroll', bodyClassName)}
          // App Lenis may add `lenis` before nested hydration finishes.
          suppressHydrationWarning
        >
          {children}
        </div>

        {footer ? <div className="glass-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );

  if (band) return sheet;
  return createPortal(sheet, portalTarget as HTMLElement);
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
  /** Accessible name when the visible title is not the dialog name. */
  titleLabel?: string;
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
  titleLabel,
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
            <h2
              id={titleId}
              className="glass-sheet-header-title"
              {...(titleLabel ? { 'aria-label': titleLabel } : {})}
            >
              {title}
            </h2>
            {subtitle ? (
              <div className="glass-sheet-header-subtitle">{subtitle}</div>
            ) : null}
          </div>
          {titleAccessory}
          {closeControl}
        </div>
      </div>
    </header>
  );
}
