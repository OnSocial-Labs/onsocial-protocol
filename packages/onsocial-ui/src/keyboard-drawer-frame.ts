'use client';

import {
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

/** Chromium Virtual Keyboard API — exact IME rect when overlaysContent is on. */
interface VirtualKeyboardLike {
  overlaysContent: boolean;
  boundingRect: { x: number; y: number; width: number; height: number };
  addEventListener(
    type: 'geometrychange',
    listener: EventListenerOrEventListenerObject
  ): void;
  removeEventListener(
    type: 'geometrychange',
    listener: EventListenerOrEventListenerObject
  ): void;
}

let virtualKeyboardOverlayArmed = false;

function getVirtualKeyboard(): VirtualKeyboardLike | null {
  if (typeof navigator === 'undefined') return null;
  const keyboard = (
    navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike }
  ).virtualKeyboard;
  return keyboard ?? null;
}

/**
 * Opt into overlay IME so `boundingRect` is the real key top (Chromium /
 * Brave tab). Idempotent. No-op on Safari / unsupported browsers.
 */
export function ensureVirtualKeyboardOverlay(): boolean {
  const keyboard = getVirtualKeyboard();
  if (!keyboard) return false;
  if (virtualKeyboardOverlayArmed && keyboard.overlaysContent) return true;
  try {
    keyboard.overlaysContent = true;
    virtualKeyboardOverlayArmed = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * IME height in CSS px from the Virtual Keyboard API when overlaying.
 * Prefer this over visualViewport lift — VV often stops at browser chrome.
 */
export function readVirtualKeyboardInset(): number {
  const keyboard = getVirtualKeyboard();
  if (!keyboard?.overlaysContent) return 0;
  const rect = keyboard.boundingRect;
  if (!rect || rect.height < 1) return 0;
  // Key top → layout bottom. Prefer y so a short height cannot leave a gap.
  if (rect.y > 0) {
    return Math.max(0, Math.round(window.innerHeight - rect.y));
  }
  return Math.max(0, Math.round(rect.height));
}

/**
 * True when Chromium/Brave IME geometry is the seat source.
 * Those reads are exact — do not run them through suggestion-bar settle
 * (a ~40px first-paint correction looks identical to a suggestion twitch).
 */
export function virtualKeyboardSeatActive(): boolean {
  return readVirtualKeyboardInset() >= KEYBOARD_VIEWPORT_SLOP_PX;
}

/**
 * Visible bottom edge above the keys (layout coordinates).
 * Virtual Keyboard `boundingRect.y` when overlaying; else visualViewport.
 */
export function readKeyboardVisibleBottom(): number {
  const keyboard = getVirtualKeyboard();
  if (keyboard?.overlaysContent) {
    const rect = keyboard.boundingRect;
    if (rect && rect.height >= KEYBOARD_VIEWPORT_SLOP_PX) {
      // `y` is the key top when the IME box fills to the layout bottom.
      // When Brave leaves a shortfall under the box (toolbar / first paint),
      // `innerHeight - height` is the real key top — take the lower edge.
      const fromY = rect.y > 0 ? Math.round(rect.y) : 0;
      const fromHeight = Math.round(window.innerHeight - rect.height);
      if (fromY > 0 && fromHeight > 0) return Math.max(fromY, fromHeight);
      return fromY || fromHeight;
    }
  }
  const viewport = window.visualViewport;
  if (!viewport) return window.innerHeight;
  return Math.round(viewport.offsetTop + viewport.height);
}

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

/**
 * One seat for drawers and docks.
 * Prefer Virtual Keyboard IME geometry when overlaying; else visualViewport.
 */
export function readKeyboardDrawerMetrics(): KeyboardDrawerMetrics {
  if (typeof window === 'undefined') return IDLE;
  const isMobile = window.matchMedia(
    `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`
  ).matches;
  const viewport = window.visualViewport;
  if (!isMobile || !viewport) {
    return { lift: 0, height: isMobile ? window.innerHeight : 0, isMobile };
  }

  ensureVirtualKeyboardOverlay();
  if (virtualKeyboardSeatActive()) {
    const keyTop = readKeyboardVisibleBottom();
    const offsetTop = Math.round(viewport.offsetTop);
    const height = Math.max(0, keyTop - offsetTop);
    const lift = Math.max(0, Math.round(window.innerHeight - keyTop));
    return { lift, height, isMobile: true };
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
  // The card is already on the visual screen (hosted sheet). offsetTop is
  // the caret pan, not a gap inside this card. Adding it slides the sheet
  // down and uncovers a strip of the page.
  if (parentTop >= -1) {
    return { top: 0, height: Math.min(visualHeight, parentHeight) };
  }
  const top = Math.max(0, -parentTop);
  const room = Math.max(0, parentHeight - top);
  return { top, height: Math.min(visualHeight, room) };
}

/**
 * A suggestion bar or a paste pan changes the height by less than a real
 * keyboard. That frame stays put — including its top. Following the pan
 * slides the sheet down inside the visible screen.
 * A real keyboard resize still takes the new top and height.
 */
export function settleVisualKeyboardFrame(
  current: VisualKeyboardBox | null,
  next: VisualKeyboardBox
): VisualKeyboardBox {
  if (!current) return next;
  const heightHeld =
    Math.abs(current.height - next.height) < KEYBOARD_VIEWPORT_SLOP_PX;
  if (heightHeld) return current;
  const top = Math.abs(current.top - next.top) < 2 ? current.top : next.top;
  if (current.top === top && current.height === next.height) return current;
  return { top, height: next.height };
}

/**
 * CSS top that puts a sheet on the visual top.
 * `frameTop` is the sheet's visual top after `appliedTop` is already set.
 * A positive frameTop is the white strip (the sheet was pushed down).
 * A negative frameTop is the page lift (the sheet scrolled off the top).
 * The correction is not stacked once the sheet is back on screen.
 */
export function keyboardFrameTop(input: {
  appliedTop: number;
  frameTop: number;
  parentTop: number;
}): number {
  const frameTop = Math.round(input.frameTop);
  const parentTop = Math.round(input.parentTop);
  if (parentTop >= -1 && frameTop < -1) {
    return Math.max(0, -frameTop);
  }
  const desired = Math.max(0, parentTop);
  const error = desired - frameTop;
  if (Math.abs(error) < 2) return input.appliedTop;
  return Math.max(0, Math.round(input.appliedTop + error));
}

/**
 * Root box for a drawer while the keyboard is up.
 * Fill from the visible top to the layout bottom (`bottom: 0`) so the
 * backdrop covers any strip above the keys — that strip was the page
 * showing through when height stopped at a short IME top. The panel seats
 * on the keys with `marginBottom: lift`, not by clipping the root.
 */
export function keyboardRootFrameStyle(
  frame: VisualKeyboardBox
): CSSProperties {
  return {
    top: `${frame.top}px`,
    bottom: 0,
    height: 'auto',
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
  node.style.bottom = String(style.bottom ?? 0);
  node.style.height = String(style.height ?? 'auto');
  node.style.paddingBottom = '0';
}

/** Page sheets sitting in the same host as the drawer. They stay visible around a short hug. */
function pageSheetsSharingHost(drawerRoot: HTMLElement): HTMLElement[] {
  const host = drawerRoot.parentElement;
  if (!host) return [];
  const pages: HTMLElement[] = [];
  const children = host.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
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
function parentVisualTop(node: HTMLElement): number {
  const parent = node.offsetParent;
  if (!(parent instanceof HTMLElement)) return 0;
  return parent.getBoundingClientRect().top;
}

/**
 * Write the box and correct a missed top. The root fills to the layout
 * bottom so a short IME height cannot uncover the page above the keys.
 */
function commitVisibleBox(
  node: HTMLElement,
  box: VisualKeyboardBox
): VisualKeyboardBox {
  applyKeyboardRootFrame(node, box);
  const top = keyboardFrameTop({
    appliedTop: box.top,
    frameTop: node.getBoundingClientRect().top,
    parentTop: parentVisualTop(node),
  });
  if (top === box.top) return box;
  const next = { top, height: box.height };
  applyKeyboardRootFrame(node, next);
  return next;
}

function pinPagesBehindDrawer(
  drawerRoot: HTMLElement,
  box: VisualKeyboardBox | null
) {
  for (const page of pageSheetsSharingHost(drawerRoot)) {
    const pinned = box ? commitVisibleBox(page, box) : null;
    if (!pinned) applyKeyboardRootFrame(page, null);
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
    ensureVirtualKeyboardOverlay();
    const sync = (reason: 'scroll' | 'layout') => {
      const raw = readKeyboardDrawerMetrics();
      // Virtual Keyboard geometry is the key top — trust every tick. VV
      // settle still absorbs caret pans and suggestion-bar noise.
      const trustIme = virtualKeyboardSeatActive();
      const settled = trustIme
        ? raw
        : settleKeyboardDrawerMetrics(frameRef.current.metrics, raw);
      const metricsChanged = settled !== frameRef.current.metrics;
      const root = rootRef?.current ?? null;
      const viewport = window.visualViewport;
      const keyboardUp =
        settled.isMobile &&
        settled.lift >= KEYBOARD_VIEWPORT_SLOP_PX &&
        Boolean(viewport);
      // One visible box for the open surface and the page behind it.
      // A paste pan or a lower field (url keyboard) must not become CSS top.
      // `settled.height` is IME-aware (Virtual Keyboard) or VV fallback.
      if (keyboardUp && viewport) {
        const fixed =
          !root || window.getComputedStyle(root).position === 'fixed';
        const parentRect = fixed
          ? null
          : (root.offsetParent as HTMLElement | null)?.getBoundingClientRect();
        const proposed = visualKeyboardFrame({
          position: fixed ? 'fixed' : 'absolute',
          parentTop: parentRect?.top ?? 0,
          parentHeight: parentRect?.height ?? 0,
          offsetTop: viewport.offsetTop,
          visualHeight: settled.height,
        });
        let nextBox =
          mode === 'page' && activeDrawerBox
            ? activeDrawerBox
            : trustIme
              ? proposed
              : settleVisualKeyboardFrame(frameRef.current.box, proposed);
        if (root) {
          // Before paint. React's style commit is the frame the strip shows on.
          nextBox = commitVisibleBox(root, nextBox);
          pinPagesBehindDrawer(root, nextBox);
        }
        if (mode === 'drawer') activeDrawerBox = nextBox;
        if (
          settled === frameRef.current.metrics &&
          nextBox === frameRef.current.box &&
          frameRef.current.seat === 0
        ) {
          return;
        }
        const next = { metrics: settled, seat: 0, box: nextBox };
        frameRef.current = next;
        setFrame(next);
        return;
      }
      if (mode === 'drawer') {
        activeDrawerBox = null;
        if (root) {
          applyKeyboardRootFrame(root, null);
          pinPagesBehindDrawer(root, null);
        }
        if (
          settled === frameRef.current.metrics &&
          frameRef.current.box == null &&
          frameRef.current.seat === 0
        ) {
          return;
        }
        const next = { metrics: settled, seat: 0, box: null };
        frameRef.current = next;
        setFrame(next);
        return;
      }
      if (root && frameRef.current.box) {
        applyKeyboardRootFrame(root, null);
        pinPagesBehindDrawer(root, null);
      }
      if (!keyboardFrameNeedsSeat(reason, metricsChanged)) return;
      const rect = root?.getBoundingClientRect();
      const visibleBottom = readKeyboardVisibleBottom();
      const rootSeat = keyboardSeatPx({
        lift: settled.lift,
        rootBottom: rect ? rect.bottom : null,
        rootHeight: rect ? rect.height : 0,
        visualBottom: visibleBottom,
      });
      if (
        settled === frameRef.current.metrics &&
        rootSeat === frameRef.current.seat &&
        frameRef.current.box == null
      ) {
        return;
      }
      const next = { metrics: settled, seat: rootSeat, box: null };
      frameRef.current = next;
      setFrame(next);
    };
    const viewport = window.visualViewport;
    const virtualKeyboard = getVirtualKeyboard();
    const onLayout = () => sync('layout');
    const onScroll = () => sync('scroll');
    // Resize is the keyboard. Scroll is a caret or paste pan. The frame
    // keeps its top through that pan so the page is not pushed down.
    // geometrychange is the Chromium IME rect (Brave tab / Chrome).
    const onFocus = () => {
      window.requestAnimationFrame(onLayout);
    };
    viewport?.addEventListener('resize', onLayout);
    viewport?.addEventListener('scroll', onScroll);
    virtualKeyboard?.addEventListener('geometrychange', onLayout);
    window.addEventListener('resize', onLayout);
    document.addEventListener('focusin', onFocus);
    sync('layout');
    const frameId = window.requestAnimationFrame(onLayout);
    return () => {
      window.cancelAnimationFrame(frameId);
      viewport?.removeEventListener('resize', onLayout);
      viewport?.removeEventListener('scroll', onScroll);
      virtualKeyboard?.removeEventListener('geometrychange', onLayout);
      window.removeEventListener('resize', onLayout);
      document.removeEventListener('focusin', onFocus);
      if (mode === 'drawer') {
        activeDrawerBox = null;
        const root = rootRef?.current;
        if (root) pinPagesBehindDrawer(root, null);
      }
    };
  }, [active, frame.seat, mode, rootRef]);

  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return;
    if (!window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches) {
      return;
    }
    const root = rootRef?.current ?? null;
    // Freeze scrollers outside this sheet before a paste or url-field pan
    // can move them. Restoring scrollTop after paint is the bounce.
    const locked: Array<{
      node: HTMLElement;
      overflow: string;
      top: number;
    }> = [];
    const lock = (node: HTMLElement | null) => {
      if (!node || locked.some((item) => item.node === node)) return;
      if (root && (node === root || root.contains(node))) return;
      const top = node.scrollTop;
      locked.push({ node, overflow: node.style.overflow, top });
      node.style.overflow = 'hidden';
      if (node.scrollTop !== top) node.scrollTop = top;
    };
    lock(document.documentElement);
    const outside = document.querySelectorAll<HTMLElement>(
      '.os-app-screen-body, .portfolio-page, .glass-sheet-body'
    );
    for (let index = 0; index < outside.length; index += 1) {
      lock(outside[index] ?? null);
    }
    return () => {
      for (const item of locked) {
        item.node.style.overflow = item.overflow;
        if (item.node.scrollTop !== item.top) item.node.scrollTop = item.top;
      }
    };
  }, [active, rootRef]);

  const live = active ? frame.metrics : IDLE;
  const liveSeat = active ? frame.seat : 0;
  const liveBox = active ? frame.box : null;
  const style = useMemo(() => {
    if (mode === 'page') return pageKeyboardLiftStyle(live, liveSeat);
    if (!liveBox) return undefined;
    // Root fills under the keys; panel margin seats the hug on the IME top
    // so the backdrop covers the strip that used to show the page.
    return {
      maxHeight: `${liveBox.height}px`,
      marginBottom: `${live.lift}px`,
    };
  }, [live, liveBox, liveSeat, mode]);
  const rootStyle = useMemo(
    () => (liveBox ? keyboardRootFrameStyle(liveBox) : undefined),
    [liveBox]
  );
  return {
    style,
    rootStyle,
    keyboardOpen: live.isMobile && live.lift > 0,
  };
}
