'use client';

import {
  ensureVirtualKeyboardOverlay,
  keyboardFrameTop,
  keyboardSeatPx,
  readKeyboardDrawerMetrics,
  readKeyboardVisibleBottom,
  settleKeyboardDrawerMetrics,
  virtualKeyboardSeatActive,
  visualKeyboardFrame,
} from '@onsocial/ui';
import { useEffect, useState, type CSSProperties } from 'react';

/** One lift token for every layout-pinned bar (write dock, messages, create). */
export const OS_KEYBOARD_LIFT_VAR = '--os-keyboard-lift';

/**
 * Pixels to publish as `--os-keyboard-lift`.
 * Pass the measured seat (`readScreenKeyboardSeat`), not the raw overlap,
 * so a card that already ends on the keys does not lift the action again.
 */
export function keyboardLiftCssVars(
  open: boolean,
  liftPx: number
): CSSProperties {
  return {
    [OS_KEYBOARD_LIFT_VAR]: open
      ? `${Math.max(0, Math.round(liftPx))}px`
      : '0px',
  } as CSSProperties;
}

/** The screen that owns a pinned footer or dock. */
export function screenForKeyboardSeat(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const fromField = active.closest<HTMLElement>('.os-app-screen');
    if (fromField) return fromField;
  }
  return (
    document.querySelector<HTMLElement>('.feed-session-front .os-app-screen') ??
    document.querySelector<HTMLElement>('.os-app-screen')
  );
}

/**
 * How far `node` still hangs under the visible viewport.
 * A `100dvh` screen that already shrunk onto the keys returns 0.
 */
export function readScreenKeyboardSeat(
  lift: number,
  node: HTMLElement | null
): number {
  const rect = node?.getBoundingClientRect();
  return keyboardSeatPx({
    lift,
    rootBottom: rect ? rect.bottom : null,
    rootHeight: rect ? rect.height : 0,
    visualBottom: readKeyboardVisibleBottom(),
  });
}

/**
 * Seat for a footer positioned against the screen. Until the screen is
 * measured, the raw overlap is used so the button does not flash under
 * the keys. Fixed docks publish the raw overlap themselves.
 */
export function useMeasuredKeyboardSeat(active: boolean, lift: number): number {
  const [measured, setMeasured] = useState<{
    lift: number;
    seat: number;
  } | null>(null);

  useEffect(() => {
    if (!active || lift <= 0 || typeof window === 'undefined') return;
    ensureVirtualKeyboardOverlay();
    const measure = () => {
      const next = readScreenKeyboardSeat(lift, screenForKeyboardSeat());
      setMeasured((current) =>
        current && current.lift === lift && current.seat === next
          ? current
          : { lift, seat: next }
      );
    };
    const frame = window.requestAnimationFrame(measure);
    const visual = window.visualViewport;
    const virtualKeyboard = (
      navigator as Navigator & {
        virtualKeyboard?: {
          addEventListener(type: 'geometrychange', listener: () => void): void;
          removeEventListener(
            type: 'geometrychange',
            listener: () => void
          ): void;
        };
      }
    ).virtualKeyboard;
    visual?.addEventListener('resize', measure);
    virtualKeyboard?.addEventListener('geometrychange', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', measure);
      virtualKeyboard?.removeEventListener('geometrychange', measure);
      window.removeEventListener('resize', measure);
    };
  }, [active, lift]);

  if (!active || lift <= 0) return 0;
  return measured && measured.lift === lift ? measured.seat : lift;
}

export interface VisualViewportSheetMetrics {
  /** Pixels of layout viewport covered below the visual viewport (keyboard). */
  lift: number;
  /** Visible viewport height in CSS pixels. */
  height: number;
  isMobile: boolean;
}

const IDLE: VisualViewportSheetMetrics = {
  lift: 0,
  height: 0,
  isMobile: false,
};

/**
 * Pin a full page to the visible viewport while the keyboard is up.
 * The box is the visible screen: the header stays under the status bar
 * and the footer ends on the keys, so the footer lift stays 0.
 */
export function visualFramePin(input: {
  position: 'fixed' | 'absolute';
  parentTop: number;
  parentHeight: number;
  offsetTop: number;
  visualHeight: number;
}): { top: number; height: number } {
  return visualKeyboardFrame(input);
}

/**
 * Slide top that keeps the header on the visible screen.
 * The geometric pin is enough when the card's box moves with the scroll.
 * When the card stays put and the page itself has scrolled above the
 * screen, one correction from the frame's real top brings it back.
 * That correction is not stacked, so a top the browser ignores cannot run away.
 */
export function correctedFrameTop(input: {
  appliedTop: number;
  frameTop: number;
  parentTop: number;
}): number {
  return keyboardFrameTop(input);
}

/** Keyboard overlap with the layout viewport. Same pixels drawers use. */
export function readKeyboardOverlapPx(): number {
  return readKeyboardDrawerMetrics().lift;
}

function readMetrics(): VisualViewportSheetMetrics {
  return readKeyboardDrawerMetrics();
}

/**
 * Tracks visualViewport so bottom sheets can shrink/lift above the mobile
 * keyboard (iOS often leaves layout `dvh` unchanged).
 * Resize is the keyboard. Scroll is the caret chase, and a suggestion bar
 * is smaller than a keyboard — neither should move a pinned action.
 */
export function useVisualViewportSheetMetrics(
  active: boolean
): VisualViewportSheetMetrics {
  const [metrics, setMetrics] = useState<VisualViewportSheetMetrics>(IDLE);

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      return;
    }

    ensureVirtualKeyboardOverlay();
    const sync = () => {
      setMetrics((current) => {
        const next = readMetrics();
        // Brave/Chrome IME geometry is exact — skip suggestion-bar settle.
        if (virtualKeyboardSeatActive()) return next;
        return settleKeyboardDrawerMetrics(current, next);
      });
    };

    const viewport = window.visualViewport;
    const virtualKeyboard = (
      navigator as Navigator & {
        virtualKeyboard?: {
          addEventListener(type: 'geometrychange', listener: () => void): void;
          removeEventListener(
            type: 'geometrychange',
            listener: () => void
          ): void;
        };
      }
    ).virtualKeyboard;
    viewport?.addEventListener('resize', sync);
    virtualKeyboard?.addEventListener('geometrychange', sync);
    window.addEventListener('resize', sync);
    // Defer initial read so we don't sync setState in the effect body.
    const frame = window.requestAnimationFrame(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', sync);
      virtualKeyboard?.removeEventListener('geometrychange', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active]);

  return active ? metrics : IDLE;
}
