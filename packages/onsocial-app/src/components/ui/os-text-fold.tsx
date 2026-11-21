'use client';

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { useOsReveal } from '@onsocial/ui';

/** Closed peek height from line metrics. */
export function textFoldPeekPx(lineHeight: number, closedLines: number): number {
  return Math.ceil(lineHeight * closedLines);
}

/** True when full content exceeds the closed peek by more than 1px. */
export function textFoldOverflows(
  scrollHeight: number,
  peekPx: number
): boolean {
  return scrollHeight > peekPx + 1;
}

function resolveLineHeight(style: CSSStyleDeclaration): number {
  let lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    lineHeight = Number.parseFloat(style.fontSize) * 1.5;
  }
  return lineHeight;
}

function setHostVar(host: HTMLElement, name: string, value: string) {
  if (host.style.getPropertyValue(name) === value) return;
  host.style.setProperty(name, value);
}

/**
 * One body, peeked then opened with the shared post fold (`useOsReveal`).
 * Short copy stays at its own height. Longer copy clips to `closedLines`
 * until `open`, and the lines already on screen do not reflow.
 *
 * Layout measure runs on mount, when `contentKey` / fold constraints change,
 * and when the inner box resizes — not on every parent redraw.
 */
export function OsTextFold({
  open,
  closedLines,
  capped = false,
  contentKey,
  onOverflow,
  children,
}: {
  open: boolean;
  closedLines: number;
  /** Cap at `closedLines` before measure. Short copy keeps its own height. */
  capped?: boolean;
  /**
   * Remeasure when this identity changes (post body text). Parent redraws
   * alone must not force layout; box size changes still use ResizeObserver.
   */
  contentKey?: string | number;
  onOverflow?: (overflows: boolean) => void;
  children: ReactNode;
}) {
  const {
    hostRef,
    clipRef: clipElementRef,
    innerRef: innerElementRef,
    measure,
  } = useOsReveal<HTMLDivElement>();
  const clipRef = clipElementRef as RefObject<HTMLDivElement | null>;
  const innerRef = innerElementRef as RefObject<HTMLDivElement | null>;

  const cappedRef = useRef(capped);
  const closedLinesRef = useRef(closedLines);
  const onOverflowRef = useRef(onOverflow);
  const measureRef = useRef(measure);
  const lastOverflowRef = useRef<boolean | null>(null);
  cappedRef.current = capped;
  closedLinesRef.current = closedLines;
  onOverflowRef.current = onOverflow;
  measureRef.current = measure;

  const syncRef = useRef(() => {});
  syncRef.current = () => {
    const host = hostRef.current;
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!host || !clip || !inner) return;

    const text =
      inner.firstElementChild instanceof HTMLElement
        ? inner.firstElementChild
        : inner;
    const lineHeight = resolveLineHeight(getComputedStyle(text));
    const peekPx = textFoldPeekPx(lineHeight, closedLinesRef.current);
    const overflows = textFoldOverflows(inner.scrollHeight, peekPx);

    // Capped folds keep the CSS `--os-fold-lines` seat on first paint.
    // Measure only drives open height + overflow ink — never rewrite the
    // closed seat (px vs em mismatch) or flip it to `auto`.
    if (cappedRef.current) {
      const openPx = Math.ceil(inner.scrollHeight);
      if (host.style.getPropertyValue('--os-reveal-closed')) {
        host.style.removeProperty('--os-reveal-closed');
      }
      setHostVar(host, '--os-reveal-open', `${openPx}px`);
    } else {
      measureRef.current({ closedPx: peekPx });
      if (!overflows) {
        setHostVar(host, '--os-reveal-closed', 'auto');
        setHostVar(host, '--os-reveal-open', 'auto');
      }
    }

    if (lastOverflowRef.current !== overflows) {
      lastOverflowRef.current = overflows;
      onOverflowRef.current?.(overflows);
    }
  };

  useLayoutEffect(() => {
    lastOverflowRef.current = null;
    syncRef.current();
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      syncRef.current();
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [capped, closedLines, contentKey, innerRef]);

  const capStyle = capped
    ? ({ '--os-fold-lines': String(closedLines) } as CSSProperties)
    : undefined;

  return (
    <div
      ref={hostRef}
      className={`os-reveal${capped ? ' os-reveal--capped' : ''}${
        open ? ' is-open' : ''
      }`}
      style={capStyle}
    >
      <div ref={clipRef} className="os-reveal-clip">
        <div ref={innerRef} className="os-reveal-inner">
          {children}
        </div>
      </div>
    </div>
  );
}
