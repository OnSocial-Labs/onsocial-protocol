'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

const MOBILE_MAX_WIDTH_PX = 767;

/**
 * A phone suggestion bar, or the caret chase, moves the viewport by less
 * than a real keyboard. Following those ticks shakes the field and the page
 * behind the drawer.
 */
export const KEYBOARD_VIEWPORT_SLOP_PX = 64;

export interface KeyboardDrawerMetrics {
  /** Pixels of the layout viewport covered below the visual viewport. */
  lift: number;
  /** Visible viewport height in CSS pixels. */
  height: number;
  isMobile: boolean;
}

const IDLE: KeyboardDrawerMetrics = { lift: 0, height: 0, isMobile: false };

/**
 * Keep the last settled frame while the keyboard is up and the viewport
 * only jitters. A caret pan changes `offsetTop`, which moves the computed
 * lift without the keyboard changing height — that must not reseat the
 * drawer or the page behind it. Opening, closing, and a real keyboard
 * resize still apply.
 */
export function settleKeyboardDrawerMetrics(
  current: KeyboardDrawerMetrics,
  next: KeyboardDrawerMetrics
): KeyboardDrawerMetrics {
  if (
    current.lift === next.lift &&
    current.height === next.height &&
    current.isMobile === next.isMobile
  ) {
    return current;
  }
  const keyboardHeld =
    current.isMobile && next.isMobile && current.lift > 0 && next.lift > 0;
  if (
    keyboardHeld &&
    Math.abs(current.height - next.height) < KEYBOARD_VIEWPORT_SLOP_PX
  ) {
    return current;
  }
  return next;
}

/**
 * Scroll while the keyboard height is unchanged is the caret. Layout and
 * resize passes still remeasure so the first seat can correct itself.
 */
export function keyboardFrameNeedsSeat(
  reason: 'scroll' | 'layout',
  metricsChanged: boolean
): boolean {
  if (reason === 'layout') return true;
  return metricsChanged;
}

function readKeyboardDrawerMetrics(): KeyboardDrawerMetrics {
  if (typeof window === 'undefined') return IDLE;
  const isMobile = window.matchMedia(
    `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`
  ).matches;
  const viewport = window.visualViewport;
  if (!isMobile || !viewport) {
    return { lift: 0, height: isMobile ? window.innerHeight : 0, isMobile };
  }
  const lift = Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  );
  return { lift, height: Math.round(viewport.height), isMobile: true };
}

/**
 * How far a sheet's box still hangs below the visible viewport.
 * A `100dvh` phone card shrinks with the keyboard, so the sheet is already
 * on the keys and the seat is 0. A card that stays full height still runs
 * under the keys, and the seat is that overlap. Never more than `lift`.
 */
export function keyboardSeatPx(input: {
  lift: number;
  /** Null until the sheet root is in the document. */
  rootBottom: number | null;
  rootHeight: number;
  /** Visible bottom, in the same coordinates as `rootBottom`. */
  visualBottom: number;
}): number {
  if (input.lift <= 0) return 0;
  if (input.rootBottom == null || input.rootHeight < 1) return input.lift;
  const gap = Math.round(input.rootBottom - input.visualBottom);
  return Math.max(0, Math.min(input.lift, gap));
}

/**
 * One drawer frame for every phone keyboard.
 * The bottom sits on the keys. The top may rest lower when the drawer is
 * short, and stops at the screen edge when it is tall. It does not climb
 * past that edge. `seatPx` is the measured overlap; omit it to use `lift`.
 */
export function keyboardDrawerFrameStyle(
  metrics: KeyboardDrawerMetrics,
  maxHeightPx = 736,
  seatPx?: number
): CSSProperties | undefined {
  if (!metrics.isMobile || metrics.height <= 0 || metrics.lift <= 0) {
    return undefined;
  }
  const cap = Math.min(metrics.height, maxHeightPx);
  const seat =
    seatPx == null
      ? metrics.lift
      : Math.max(0, Math.min(metrics.lift, Math.round(seatPx)));
  return {
    maxHeight: `${cap}px`,
    marginBottom: keyboardSheetMargin(seat),
  };
}

/**
 * Page sheets stay full bleed. Only the action's lift variable changes,
 * and only by the overlap that is still under the keys.
 */
export function pageKeyboardLiftStyle(
  metrics: KeyboardDrawerMetrics,
  seatPx: number
): CSSProperties | undefined {
  if (!metrics.isMobile || metrics.lift <= 0) return undefined;
  const seat = Math.max(0, Math.min(metrics.lift, Math.round(seatPx)));
  return {
    ['--os-keyboard-lift' as string]: `${seat}px`,
  };
}

/**
 * Raw keyboard overlap, in pixels. The sheet root drops its home-indicator
 * padding while this is set (`.glass-sheet-panel.is-keyboard-open`), so the
 * drawer bottom lands on the keys. Layout-pinned bars use the same overlap
 * as `--os-keyboard-lift`.
 */
export function keyboardSheetMargin(liftPx: number): string {
  return `${liftPx}px`;
}

export interface VisualKeyboardBox {
  top: number;
  height: number;
}

/**
 * The on-screen box for one keyboard surface.
 * Its top is the top of the visible viewport and its bottom is the top of
 * the keyboard. The footer lives in that box with its own padding, so a
 * second keyboard margin cannot open a gap or push the header away.
 *
 * A fixed layer uses the visual offset directly. An absolute layer inside a
 * card that still fills the layout moves down by the pan. A card that has
 * already shrunk to the visible screen is left alone.
 */
export function visualKeyboardFrame(input: {
  position: 'fixed' | 'absolute';
  parentTop: number;
  parentHeight: number;
  offsetTop: number;
  visualHeight: number;
}): VisualKeyboardBox {
  const visualHeight = Math.max(0, Math.round(input.visualHeight));
  const offsetTop = Math.max(0, Math.round(input.offsetTop));
  if (input.position === 'fixed') {
    return { top: offsetTop, height: visualHeight };
  }
  const parentTop = Math.round(input.parentTop);
  const parentHeight = Math.max(0, Math.round(input.parentHeight));
  if (parentHeight < 1) {
    return { top: offsetTop, height: visualHeight };
  }
  const fillsVisible = parentTop >= -1 && parentHeight <= visualHeight + 1;
  if (fillsVisible) {
    return { top: 0, height: parentHeight };
  }
  const top = Math.max(0, Math.max(offsetTop, -parentTop));
  const room = Math.max(0, parentHeight - top);
  return { top, height: Math.min(visualHeight, room) };
}

/**
 * Follow the visible top so a keyboard pan cannot leave a gap.
 * A suggestion bar changes the height by less than a real keyboard, and
 * that height stays put. A one-pixel top twitch does not move the frame.
 */
export function settleVisualKeyboardFrame(
  current: VisualKeyboardBox | null,
  next: VisualKeyboardBox
): VisualKeyboardBox {
  if (!current) return next;
  const height =
    Math.abs(current.height - next.height) < KEYBOARD_VIEWPORT_SLOP_PX
      ? current.height
      : next.height;
  const top = Math.abs(current.top - next.top) < 2 ? current.top : next.top;
  if (current.top === top && current.height === height) return current;
  return { top, height };
}

/** Root box for a drawer. The panel then ends on the keys with no margin. */
export function keyboardRootFrameStyle(
  frame: VisualKeyboardBox
): CSSProperties {
  return {
    top: `${frame.top}px`,
    height: `${frame.height}px`,
    bottom: 'auto',
    paddingBottom: 0,
  };
}

/**
 * The drawer writes this before paint. Page sheets in the same host read it
 * in the same viewport event and drop their own keyboard margin.
 */
let activeDrawerBox: VisualKeyboardBox | null = null;

export function activeDrawerKeyboardBox(): VisualKeyboardBox | null {
  return activeDrawerBox;
}

/** Same-frame pin. A React state update lands after paint and the drawer jumps. */
function applyKeyboardRootFrame(
  node: HTMLElement,
  box: VisualKeyboardBox | null
) {
  if (!box) {
    node.style.top = '';
    node.style.height = '';
    node.style.bottom = '';
    node.style.paddingBottom = '';
    return;
  }
  const style = keyboardRootFrameStyle(box);
  node.style.top = String(style.top);
  node.style.height = String(style.height);
  node.style.bottom = String(style.bottom);
  node.style.paddingBottom = '0';
}

/** Page sheets sitting in the same host as the drawer. They stay visible around a short hug. */
function pageSheetsSharingHost(drawerRoot: HTMLElement): HTMLElement[] {
  const host = drawerRoot.parentElement;
  if (!host) return [];
  const pages: HTMLElement[] = [];
  for (const child of host.children) {
    if (!(child instanceof HTMLElement) || child === drawerRoot) continue;
    if (
      child.classList.contains('glass-sheet-root') &&
      child.getAttribute('data-surface') === 'page'
    ) {
      pages.push(child);
    }
  }
  return pages;
}

/**
 * The page behind a drawer uses the same visible box. A caret pan then
 * moves them together, so the page does not slide up under the keys and
 * the drawer does not jump back.
 */
function pinPagesBehindDrawer(
  drawerRoot: HTMLElement,
  box: VisualKeyboardBox | null
) {
  for (const page of pageSheetsSharingHost(drawerRoot)) {
    applyKeyboardRootFrame(page, box);
    const panel = page.querySelector<HTMLElement>('.glass-sheet-panel');
    if (!panel) continue;
    if (box) panel.style.setProperty('--os-keyboard-lift', '0px');
    else panel.style.removeProperty('--os-keyboard-lift');
  }
}

/**
 * Seat that puts the drawer panel on the keys.
 * `appliedSeat` is the margin already on the panel. The error is how far
 * that panel still misses the visible bottom, in the same coordinates.
 * A card that already ended on the keys stays at 0. A double lift shrinks
 * back to the keys instead of keeping the full overlap.
 */
export function correctedKeyboardSeat(input: {
  lift: number;
  appliedSeat: number;
  panelBottom: number | null;
  visibleBottom: number;
  fallbackSeat: number;
}): number {
  if (input.lift <= 0) return 0;
  if (input.panelBottom == null) {
    return Math.max(0, Math.min(input.lift, Math.round(input.fallbackSeat)));
  }
  const error = Math.round(input.panelBottom - input.visibleBottom);
  if (Math.abs(error) < 2) {
    return Math.max(0, Math.min(input.lift, Math.round(input.appliedSeat)));
  }
  return Math.max(
    0,
    Math.min(input.lift, Math.round(input.appliedSeat + error))
  );
}

export type KeyboardDrawerFrameMode = 'drawer' | 'page';

/** Tracks the keyboard while `active` (the sheet is open). */
export function useKeyboardDrawerFrame(
  active: boolean,
  rootRef?: { readonly current: HTMLElement | null },
  mode: KeyboardDrawerFrameMode = 'drawer'
): {
  style: CSSProperties | undefined;
  rootStyle: CSSProperties | undefined;
  keyboardOpen: boolean;
} {
  const frameRef = useRef<{
    metrics: KeyboardDrawerMetrics;
    seat: number;
    box: VisualKeyboardBox | null;
  }>({ metrics: IDLE, seat: 0, box: null });
  const [frame, setFrame] = useState(frameRef.current);

  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const sync = (reason: 'scroll' | 'layout') => {
      const raw = readKeyboardDrawerMetrics();
      const settled = settleKeyboardDrawerMetrics(
        frameRef.current.metrics,
        raw
      );
      const metricsChanged = settled !== frameRef.current.metrics;
      const root = rootRef?.current ?? null;
      const viewport = window.visualViewport;
      if (mode === 'drawer') {
        // The drawer root IS the visible viewport. A pan updates the top.
        // A margin on top of that pan is the gap above the keys.
        const keyboardUp =
          settled.isMobile &&
          settled.lift >= KEYBOARD_VIEWPORT_SLOP_PX &&
          viewport;
        const fixed =
          !root || window.getComputedStyle(root).position === 'fixed';
        const parentRect = fixed
          ? null
          : (root.offsetParent as HTMLElement | null)?.getBoundingClientRect();
        const nextBox = keyboardUp
          ? settleVisualKeyboardFrame(
              frameRef.current.box,
              visualKeyboardFrame({
                position: fixed ? 'fixed' : 'absolute',
                parentTop: parentRect?.top ?? 0,
                parentHeight: parentRect?.height ?? 0,
                offsetTop: viewport.offsetTop,
                visualHeight: viewport.height,
              })
            )
          : null;
        activeDrawerBox = nextBox;
        if (root) {
          // Before paint. Waiting for React lets the caret pan show for a frame.
          applyKeyboardRootFrame(root, nextBox);
          pinPagesBehindDrawer(root, nextBox);
        }
        if (
          settled === frameRef.current.metrics &&
          nextBox === frameRef.current.box
        ) {
          return;
        }
        const next = { metrics: settled, seat: 0, box: nextBox };
        frameRef.current = next;
        setFrame(next);
        return;
      }
      // The drawer already owns this keyboard. The page keeps its footer down.
      if (activeDrawerBox) {
        if (
          settled === frameRef.current.metrics &&
          frameRef.current.seat === 0
        ) {
          return;
        }
        const next = { metrics: settled, seat: 0, box: null };
        frameRef.current = next;
        setFrame(next);
        return;
      }
      if (!keyboardFrameNeedsSeat(reason, metricsChanged)) return;
      const rect = root?.getBoundingClientRect();
      const visibleBottom = viewport ? viewport.offsetTop + viewport.height : 0;
      // Class lands a paint after the drawer box. The box is the same-frame signal.
      const drawerOwnsKeyboard =
        activeDrawerBox != null ||
        Boolean(
          document.querySelector(
            '.glass-sheet-panel[data-sizing="hug"].is-keyboard-open'
          )
        );
      const rootSeat = drawerOwnsKeyboard
        ? 0
        : keyboardSeatPx({
            lift: settled.lift,
            rootBottom: rect ? rect.bottom : null,
            rootHeight: rect ? rect.height : 0,
            visualBottom: visibleBottom,
          });
      if (
        settled === frameRef.current.metrics &&
        rootSeat === frameRef.current.seat
      ) {
        return;
      }
      const next = { metrics: settled, seat: rootSeat, box: null };
      frameRef.current = next;
      setFrame(next);
    };
    const viewport = window.visualViewport;
    const onLayout = () => sync('layout');
    const onScroll = () => sync('scroll');
    // Resize is the keyboard. Scroll is a pan of the visible viewport.
    // Drawers follow that pan so the footer stays on the keys. Pages ignore
    // a scroll that does not change the keyboard height, so a caret does
    // not lift the page behind a drawer.
    const onFocus = () => {
      window.requestAnimationFrame(onLayout);
    };
    viewport?.addEventListener('resize', onLayout);
    viewport?.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onLayout);
    document.addEventListener('focusin', onFocus);
    sync('layout');
    const frameId = window.requestAnimationFrame(onLayout);
    return () => {
      window.cancelAnimationFrame(frameId);
      viewport?.removeEventListener('resize', onLayout);
      viewport?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onLayout);
      document.removeEventListener('focusin', onFocus);
      if (mode === 'drawer') {
        activeDrawerBox = null;
        const root = rootRef?.current;
        if (root) pinPagesBehindDrawer(root, null);
      }
    };
  }, [active, frame.seat, mode, rootRef]);

  useEffect(() => {
    if (!active || mode !== 'drawer' || frame.metrics.lift <= 0) return;
    const root = rootRef?.current;
    if (!root) return;
    // Freeze the page body. Snapping scrollTop after the browser paints a
    // caret pan is the bounce: the page lifts, then jumps back, and the
    // drawer follows both.
    const locked: Array<{ node: HTMLElement; overflow: string }> = [];
    const lock = (node: HTMLElement | null) => {
      if (!node || locked.some((item) => item.node === node)) return;
      locked.push({ node, overflow: node.style.overflow });
      node.style.overflow = 'hidden';
    };
    for (const page of pageSheetsSharingHost(root)) {
      lock(page.querySelector<HTMLElement>('.glass-sheet-body'));
    }
    lock(
      document.scrollingElement instanceof HTMLElement
        ? document.scrollingElement
        : null
    );
    return () => {
      for (const item of locked) item.node.style.overflow = item.overflow;
    };
  }, [active, frame.metrics.lift, mode, rootRef]);

  const live = active ? frame.metrics : IDLE;
  const liveSeat = active ? frame.seat : 0;
  const liveBox = active ? frame.box : null;
  const style = useMemo(() => {
    if (mode === 'page') return pageKeyboardLiftStyle(live, liveSeat);
    if (!liveBox) return undefined;
    // Last style on the panel. Clears a margin another caller already set,
    // so the root pin is the only keyboard movement.
    return { maxHeight: `${liveBox.height}px`, marginBottom: '0px' };
  }, [live, liveBox, liveSeat, mode]);
  const rootStyle = useMemo(
    () =>
      mode === 'drawer' && liveBox
        ? keyboardRootFrameStyle(liveBox)
        : undefined,
    [liveBox, mode]
  );
  return {
    style,
    rootStyle,
    keyboardOpen: live.isMobile && live.lift > 0,
  };
}
