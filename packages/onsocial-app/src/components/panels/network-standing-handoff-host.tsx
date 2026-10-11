'use client';

import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { accountIdFromPath, parseOverlayPanelKey } from '@/lib/overlay-routes';
import { NetworkStandingEarlySheet } from '@/components/panels/network-standing-early-sheet';
import {
  clearNetworkStandingHandoff,
  clearStandingSheetCovered,
  getNetworkStandingHandoffOpenTarget,
  getNetworkStandingHandoffPhase,
  isStandingHandoffPortfolioFace,
  markStandingSheetCovered,
  networkStandingHandoffBlocksFace,
  peekNetworkStandingHandoff,
  releaseNetworkStandingFrame,
  subscribeNetworkStandingHandoff,
  takeNetworkStandingHandoff,
} from '@/components/panels/network-standing-handoff';

const HANDOFF_STYLE = `
html[data-standing-handoff='open'] .portfolio-page,
html[data-standing-handoff='close'] .network-orbit-screen > .os-app-screen-column {
  visibility: hidden;
}
html[data-standing-early='open'] .glass-sheet-root:not(.standing-early-sheet) {
  visibility: hidden;
}
#standing-handoff-hold {
  position: fixed;
  inset: 0;
  z-index: 49;
  pointer-events: none;
  overflow: hidden;
  transform: translateZ(0);
}
#standing-handoff-hold .os-app-screen > :not(.standing-early-sheet),
#standing-handoff-hold .os-app-screen > :not(.standing-early-sheet) * {
  animation: none !important;
  pointer-events: none !important;
}
#standing-handoff-hold .os-app-screen {
  height: 100%;
  min-height: 100%;
}
#standing-handoff-hold .standing-early-sheet,
#standing-handoff-hold .standing-early-sheet * {
  pointer-events: auto;
}
`;

function installHandoffStyle() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('standing-handoff-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'standing-handoff-style';
    document.head.appendChild(style);
  }
  if (style.textContent !== HANDOFF_STYLE) style.textContent = HANDOFF_STYLE;
}

installHandoffStyle();

function subscribe(listener: () => void) {
  return subscribeNetworkStandingHandoff(listener);
}

function phaseSnapshot() {
  return getNetworkStandingHandoffPhase();
}

function prefetchFull(
  prefetch: (href: string, options?: { kind: 'full' }) => void,
  href: string
) {
  prefetch(href, { kind: 'full' });
}

/**
 * Face taps leave Next on the first map. Opening that person's standing
 * from the map reuses the map as the page under the sheet. Move onto their
 * portfolio, then open the list there. The profile stays hidden until the
 * standing sheet is up, so the face name never flashes ahead of the sheet.
 */
export function NetworkStandingHandoffHost() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const phase = useSyncExternalStore(subscribe, phaseSnapshot, () => null);

  useLayoutEffect(() => {
    installHandoffStyle();
    const root = document.documentElement;
    if (phase) root.dataset.standingHandoff = phase;
    else {
      delete root.dataset.standingHandoff;
      releaseNetworkStandingFrame();
    }
  }, [phase]);

  useLayoutEffect(() => {
    const accountId = accountIdFromPath(pathname);
    if (!accountId || parseOverlayPanelKey(pathname)) return;
    const href = peekNetworkStandingHandoff(accountId);
    if (!href) return;
    const next = takeNetworkStandingHandoff(accountId);
    if (!next) return;
    prefetchFull(
      router.prefetch as (href: string, options?: { kind: 'full' }) => void,
      next
    );
    router.push(next);
  }, [pathname, router]);

  useEffect(() => {
    if (phase === 'open') return;
    if (!pathname.includes('/standing/')) clearStandingSheetCovered();
  }, [pathname, phase]);

  useEffect(() => {
    if (!phase || networkStandingHandoffBlocksFace(pathname)) return;
    clearNetworkStandingHandoff();
  }, [pathname, phase]);

  useEffect(() => {
    if (parseOverlayPanelKey(pathname) !== 'network') return;
    if (getNetworkStandingHandoffPhase() === 'open') return;
    clearStandingSheetCovered();
    if (getNetworkStandingHandoffPhase() === 'close') {
      clearNetworkStandingHandoff();
    }
  }, [pathname]);

  useEffect(() => {
    if (!phase) return;
    let frames = 0;
    let id = 0;
    const tick = () => {
      frames += 1;
      if (phase === 'open') {
        const accountId = accountIdFromPath(window.location.pathname);
        const stillPending = accountId
          ? peekNetworkStandingHandoff(accountId)
          : null;
        const routePanel = document.querySelector(
          '.glass-sheet-root.is-visible:not(.standing-early-sheet) .glass-sheet-panel.is-open'
        );
        const routeOpacity = routePanel
          ? Number(getComputedStyle(routePanel).opacity)
          : 0;
        if (routePanel) markStandingSheetCovered();
        const earlyPanel = document.querySelector(
          '.standing-early-sheet .glass-sheet-panel'
        );
        const earlySettled = earlyPanel
          ? Number(getComputedStyle(earlyPanel).opacity) >= 0.98
          : frames > 24;
        const routeSheet = document.querySelector(
          '.glass-sheet-root.is-visible:not(.standing-early-sheet)'
        );
        const sheetReady = Boolean(
          routeSheet?.querySelector(
            '.standing-sheet-header:not(.overlay-header-fallback)'
          )
        );
        // The opening sheet is another skeleton. Wait until that route has
        // the list, an empty state, or an error, then swap once.
        const listSettled = Boolean(
          routeSheet?.querySelector(
            '.standing-row:not(.standing-row--skeleton), .standing-panel-empty-state, .standing-panel-error'
          )
        );
        const underlayReady = Boolean(
          document.querySelector('.portfolio-page')
        );
        // Drop the frozen map only once the sheet covers it and the face is behind it.
        if (
          (sheetReady &&
            listSettled &&
            !stillPending &&
            routeOpacity >= 0.98 &&
            underlayReady &&
            earlySettled) ||
          frames > 240
        ) {
          clearNetworkStandingHandoff();
          return;
        }
      } else {
        const accountId = accountIdFromPath(window.location.pathname);
        const faceReady =
          accountId != null &&
          isStandingHandoffPortfolioFace(window.location.pathname, accountId) &&
          document.querySelector('.portfolio-page');
        if (faceReady || frames > 240) {
          clearNetworkStandingHandoff();
          return;
        }
      }
      id = window.requestAnimationFrame(tick);
    };
    id = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(id);
  }, [phase]);

  const target =
    phase === 'open' ? getNetworkStandingHandoffOpenTarget() : null;
  return target ? <NetworkStandingEarlySheet target={target} /> : null;
}
