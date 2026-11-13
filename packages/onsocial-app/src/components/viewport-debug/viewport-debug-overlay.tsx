'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  resolveViewportDebug,
  VIEWPORT_DEBUG_STORAGE_KEY,
} from './viewport-debug-flag';
import './viewport-debug-overlay.css';

type Box = {
  top: number;
  bottom: number;
  height: number;
  width: number;
} | null;

type ViewportDebugSnapshot = {
  innerWidth: number;
  innerHeight: number;
  clientHeight: number;
  visualViewport: {
    height: number | null;
    offsetTop: number | null;
    pageTop: number | null;
    scale: number | null;
  };
  screenHeight: number;
  availHeight: number;
  devicePixelRatio: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  vh: number;
  svh: number;
  lvh: number;
  dvh: number;
  standalone: boolean;
  userAgentShort: string;
  userAgent: string;
  brave: boolean;
  portfolioDockBottom: string;
  portfolioViewportHeight: string;
  measuredLift: number;
  keyboardLift: string;
  keyboardOpen: boolean;
  portfolioFrame: Box;
  drawerRoot: Box;
  drawerPanel: Box;
  drawerFooter: Box;
  drawerRootPaddingBottom: string | null;
  drawerFooterPaddingBottom: string | null;
  dock: Box;
  gapBelowDrawer: number | null;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function boxOf(node: Element | null): Box {
  if (!(node instanceof HTMLElement)) return null;
  const rect = node.getBoundingClientRect();
  return {
    top: round(rect.top),
    bottom: round(rect.bottom),
    height: round(rect.height),
    width: round(rect.width),
  };
}

function probeHeight(name: string): number {
  const node = document.querySelector(`[data-probe='${name}']`);
  return node instanceof HTMLElement ? round(node.offsetHeight) : 0;
}

function shortUserAgent(ua: string): string {
  const platform = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : 'desktop';
  const token =
    ua.match(/Brave\/[\d.]+/)?.[0] ??
    ua.match(/Chrome\/[\d.]+/)?.[0] ??
    ua.match(/Version\/[\d.]+/)?.[0] ??
    'unknown';
  return `${platform} ${token}`;
}

function readViewportDebug(): ViewportDebugSnapshot {
  const vv = window.visualViewport;
  const rootStyle = getComputedStyle(document.documentElement);
  const panel =
    document.querySelector('.glass-sheet-panel.page-drawer-panel.is-open') ??
    document.querySelector('.glass-sheet-root.is-visible .glass-sheet-panel');
  const sheetRoot =
    panel instanceof HTMLElement ? panel.closest('.glass-sheet-root') : null;
  const footer =
    sheetRoot?.querySelector('.os-sheet-footer, .glass-sheet-footer') ?? null;
  const dock =
    document.querySelector('.feed-session-front .portfolio-summon-dock') ??
    document.querySelector('.portfolio-summon-dock');
  const frame = document.querySelector('.portfolio-frame');
  const panelBox = boxOf(panel);
  const measuredLift = Math.max(
    0,
    Math.round(
      window.innerHeight -
        (vv?.height ?? window.innerHeight) -
        (vv?.offsetTop ?? 0)
    )
  );
  const keyboardLift =
    (panel instanceof HTMLElement
      ? getComputedStyle(panel).getPropertyValue('--os-keyboard-lift')
      : rootStyle.getPropertyValue('--os-keyboard-lift')
    ).trim() || '0px';

  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    visualViewport: {
      height: vv ? round(vv.height) : null,
      offsetTop: vv ? round(vv.offsetTop) : null,
      pageTop: vv ? round(vv.pageTop) : null,
      scale: vv ? round(vv.scale) : null,
    },
    screenHeight: window.screen.height,
    availHeight: window.screen.availHeight,
    devicePixelRatio: window.devicePixelRatio,
    safeAreaTop: probeHeight('safe-top'),
    safeAreaBottom: probeHeight('safe-bottom'),
    vh: probeHeight('vh'),
    svh: probeHeight('svh'),
    lvh: probeHeight('lvh'),
    dvh: probeHeight('dvh'),
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches,
    userAgentShort: shortUserAgent(navigator.userAgent),
    userAgent: navigator.userAgent,
    brave: typeof navigator.brave !== 'undefined',
    portfolioDockBottom: rootStyle
      .getPropertyValue('--portfolio-dock-bottom')
      .trim(),
    portfolioViewportHeight: rootStyle
      .getPropertyValue('--portfolio-viewport-height')
      .trim(),
    measuredLift,
    keyboardLift,
    keyboardOpen: Boolean(document.querySelector('.is-keyboard-open')),
    portfolioFrame: boxOf(frame),
    drawerRoot: boxOf(sheetRoot),
    drawerPanel: panelBox,
    drawerFooter: boxOf(footer),
    drawerRootPaddingBottom:
      sheetRoot instanceof HTMLElement
        ? getComputedStyle(sheetRoot).paddingBottom
        : null,
    drawerFooterPaddingBottom:
      footer instanceof HTMLElement
        ? getComputedStyle(footer).paddingBottom
        : null,
    dock: boxOf(dock),
    gapBelowDrawer:
      panelBox == null ? null : round(window.innerHeight - panelBox.bottom),
  };
}

function formatSnapshot(snapshot: ViewportDebugSnapshot): string {
  const vv = snapshot.visualViewport;
  const lines = [
    `inner ${snapshot.innerWidth}×${snapshot.innerHeight} client ${snapshot.clientHeight}`,
    `vv h ${vv.height} off ${vv.offsetTop} page ${vv.pageTop} scale ${vv.scale}`,
    `screen ${snapshot.screenHeight} avail ${snapshot.availHeight} dpr ${snapshot.devicePixelRatio}`,
    `safe ${snapshot.safeAreaTop} / ${snapshot.safeAreaBottom}`,
    `vh ${snapshot.vh} svh ${snapshot.svh} lvh ${snapshot.lvh} dvh ${snapshot.dvh}`,
    `standalone ${snapshot.standalone ? 'yes' : 'no'} ${snapshot.userAgentShort} brave ${snapshot.brave ? 'yes' : 'no'}`,
    `frame ${snapshot.portfolioViewportHeight || 'unset'} dock ${snapshot.portfolioDockBottom || '0px'}`,
    `lift ${snapshot.measuredLift} keyboard ${snapshot.keyboardLift} open ${snapshot.keyboardOpen ? 'yes' : 'no'}`,
  ];
  if (snapshot.drawerPanel) {
    lines.push(
      `drawer bottom ${snapshot.drawerPanel.bottom} h ${snapshot.drawerPanel.height} gap ${snapshot.gapBelowDrawer}`,
      `root pad ${snapshot.drawerRootPaddingBottom} footer pad ${snapshot.drawerFooterPaddingBottom ?? 'none'}`
    );
    if (snapshot.dock) lines.push(`dock bottom ${snapshot.dock.bottom}`);
  }
  return lines.join('\n');
}

/** Temporary. Remove before merge. `?viewport-debug=1` persists for the tab. */
export function ViewportDebugOverlay() {
  const flag = useSearchParams().get('viewport-debug');
  const [stored, setStored] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(VIEWPORT_DEBUG_STORAGE_KEY);
  });
  const [text, setText] = useState('');
  const [snapshot, setSnapshot] = useState<ViewportDebugSnapshot | null>(null);
  const [copied, setCopied] = useState(false);
  const resolved = resolveViewportDebug(flag, stored);
  if (resolved.persist === '1' && stored !== '1') {
    window.sessionStorage.setItem(VIEWPORT_DEBUG_STORAGE_KEY, '1');
    setStored('1');
  } else if (resolved.persist === '0' && stored !== null) {
    window.sessionStorage.removeItem(VIEWPORT_DEBUG_STORAGE_KEY);
    setStored(null);
  }
  const enabled = resolved.enabled;

  const braveRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const publish = () => {
      frame = 0;
      const next = readViewportDebug();
      if (braveRef.current != null) next.brave = braveRef.current;
      setSnapshot(next);
      setText(formatSnapshot(next));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(publish);
    };
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
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
    const braveApi = navigator.brave;
    if (braveApi && typeof braveApi.isBrave === 'function') {
      void braveApi.isBrave().then((isBrave) => {
        braveRef.current = isBrave;
        schedule();
      });
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      observer.disconnect();
    };
  }, [enabled]);

  const copy = () => {
    if (!snapshot) return;
    const write = navigator.clipboard?.writeText(
      JSON.stringify(snapshot, null, 2)
    );
    void write?.then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  if (!enabled) return null;

  return (
    <aside className="viewport-debug" data-viewport-debug="on">
      <div className="viewport-debug-probes" aria-hidden>
        <div data-probe="safe-top" />
        <div data-probe="safe-bottom" />
        <div data-probe="vh" />
        <div data-probe="svh" />
        <div data-probe="lvh" />
        <div data-probe="dvh" />
      </div>
      <div className="viewport-debug-bar">
        <p className="viewport-debug-title">Viewport debug · temporary</p>
        <button type="button" className="viewport-debug-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="viewport-debug-readout">{text}</pre>
    </aside>
  );
}

declare global {
  interface Navigator {
    brave?: { isBrave?: () => Promise<boolean> };
  }
}
