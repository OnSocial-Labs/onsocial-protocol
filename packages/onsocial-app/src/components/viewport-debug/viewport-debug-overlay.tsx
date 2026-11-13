'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  resolveViewportDebug,
  VIEWPORT_DEBUG_STORAGE_KEY,
} from './viewport-debug-flag';
import './viewport-debug-overlay.css';

type ViewportDebugSnapshot = {
  innerHeight: number;
  vvHeight: number | null;
  offsetTop: number | null;
  measuredLift: number;
  pin: boolean;
  rootBottom: number | null;
  visualBottom: number | null;
  scrollY: number;
};

function topSheetRoot(): HTMLElement | null {
  const nodes = document.querySelectorAll('.glass-sheet-root.is-visible');
  let best: HTMLElement | null = null;
  let bestZ = -1;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!(node instanceof HTMLElement)) continue;
    const z = Number.parseInt(getComputedStyle(node).zIndex, 10);
    const score = Number.isFinite(z) ? z : 0;
    if (!best || score >= bestZ) {
      best = node;
      bestZ = score;
    }
  }
  return best;
}

function readViewportDebug(): ViewportDebugSnapshot {
  const vv = window.visualViewport;
  const vvHeight = vv ? Math.round(vv.height) : null;
  const offsetTop = vv ? Math.round(vv.offsetTop) : null;
  const measuredLift = Math.max(
    0,
    Math.round(
      window.innerHeight -
        (vv?.height ?? window.innerHeight) -
        (vv?.offsetTop ?? 0)
    )
  );
  const root = topSheetRoot();
  const rootBottom = root
    ? Math.round(root.getBoundingClientRect().bottom)
    : null;
  const visualBottom =
    vvHeight == null || offsetTop == null ? null : offsetTop + vvHeight;
  const pin = root?.style.bottom === 'auto' && root.style.height !== '';

  return {
    innerHeight: window.innerHeight,
    vvHeight,
    offsetTop,
    measuredLift,
    pin,
    rootBottom,
    visualBottom,
    scrollY: Math.round(window.scrollY),
  };
}

function formatSnapshot(snapshot: ViewportDebugSnapshot): string {
  return [
    `inner ${snapshot.innerHeight}`,
    `vv ${snapshot.vvHeight ?? '—'}`,
    `off ${snapshot.offsetTop ?? '—'}`,
    `lift ${snapshot.measuredLift}`,
    `pin ${snapshot.pin ? 'on' : 'off'}`,
    `root ${snapshot.rootBottom ?? '—'} / keys ${snapshot.visualBottom ?? '—'}`,
    `scroll ${snapshot.scrollY}`,
  ].join('\n');
}

/** Temporary. Remove before merge. `?viewport-debug=1` persists for the tab. */
export function ViewportDebugOverlay() {
  const flag = useSearchParams().get('viewport-debug');
  const [stored, setStored] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(VIEWPORT_DEBUG_STORAGE_KEY);
  });
  const [text, setText] = useState('');
  const resolved = resolveViewportDebug(flag, stored);
  if (resolved.persist === '1' && stored !== '1') {
    window.sessionStorage.setItem(VIEWPORT_DEBUG_STORAGE_KEY, '1');
    setStored('1');
  } else if (resolved.persist === '0' && stored !== null) {
    window.sessionStorage.removeItem(VIEWPORT_DEBUG_STORAGE_KEY);
    setStored(null);
  }
  const enabled = resolved.enabled;

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const publish = () => {
      frame = 0;
      setText(formatSnapshot(readViewportDebug()));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(publish);
    };
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (target?.closest('.viewport-debug')) continue;
        schedule();
        return;
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      observer.disconnect();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <aside className="viewport-debug" data-viewport-debug="on">
      <pre className="viewport-debug-readout">{text}</pre>
    </aside>
  );
}
