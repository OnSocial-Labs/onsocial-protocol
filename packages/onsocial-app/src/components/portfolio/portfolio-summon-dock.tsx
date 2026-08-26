'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  useComposeLauncher,
  useWriteDockPinned,
} from '@/contexts/compose-launcher-context';
import { OsWriteDock } from '@/components/os/os-write-dock';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { accountIdsEqual } from '@/lib/account-match';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import { ownerPortfolioOsApps, visitorPortfolioOsApps } from '@/lib/os-apps';
import { CollectiblesNowPlayingDockChip } from '@/components/os/collectibles-now-playing-dock-chip';
import { SummonLauncher } from '@/components/os/summon-launcher';
import { PortfolioSummonComposeButton } from '@/components/portfolio/portfolio-summon-compose-button';
import { OsDockPill } from '@/components/wallet/os-dock-pill';

const DOCK_HINT_KEY = 'onpage-portfolio-dock-hint-seen';
const LONG_PRESS_MS = 480;
const SWIPE_UP_PX = 28;
const TAP_SLOP_PX = 12;

export interface PortfolioSummonDockProps {
  pageAccountId: string;
}

function readDockHintPending(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return localStorage.getItem(DOCK_HINT_KEY) !== '1';
  } catch {
    return false;
  }
}

/**
 * One fixed launcher pill for the portfolio — overlays the face and the page
 * drawer (z-index lift while the sheet is open). Scroll-hide follows the drawer
 * body scroller when open, otherwise the main screen scroll.
 */
export function PortfolioSummonDock({
  pageAccountId,
}: PortfolioSummonDockProps) {
  const {
    open: openPageDrawer,
    isOpen: pageDrawerOpen,
    scrollNode,
  } = usePageContentDrawer();
  const { accountId, isConnected } = useAppWallet();
  const compose = useComposeLauncher();
  const writePinned = useWriteDockPinned();
  const write = compose?.type === 'write' ? compose.entry : null;
  const { effectiveMood, isPreviewingMood } = usePortfolioMoodPreview();
  const { isPreviewing: isPreviewingFace } = usePortfolioFacePreview();
  const viewerDockMood = useViewerDockMood(pageAccountId);
  const [osOpen, setOsOpen] = useState(false);
  const [showHint, setShowHint] = useState(readDockHintPending);
  const [openPinned, setOpenPinned] = useState(false);

  const previewPinned = isPreviewingMood || isPreviewingFace;

  useEffect(() => {
    if (!pageDrawerOpen) {
      const frame = requestAnimationFrame(() => setOpenPinned(false));
      return () => cancelAnimationFrame(frame);
    }

    const showFrame = requestAnimationFrame(() => setOpenPinned(true));
    const timer = window.setTimeout(() => setOpenPinned(false), 450);
    return () => {
      cancelAnimationFrame(showFrame);
      window.clearTimeout(timer);
    };
  }, [pageDrawerOpen]);

  const scrollRoot = pageDrawerOpen ? scrollNode : null;
  const scrollHidden =
    useDockAutoHide(
      previewPinned ||
        openPinned ||
        writePinned ||
        (pageDrawerOpen && !scrollNode),
      scrollRoot
    ) && !osOpen;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStart = useRef<{
    x: number;
    y: number;
    longPress: boolean;
  } | null>(null);

  const isOwner =
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);
  const apps = isOwner
    ? ownerPortfolioOsApps(pageAccountId)
    : visitorPortfolioOsApps(pageAccountId);

  const dockMoodId = isOwner ? String(effectiveMood.id) : viewerDockMood.moodId;
  const dockMoodStyle = useMemo(() => {
    if (isOwner) {
      return portfolioMoodShellStyle(effectiveMood.cssVars) as CSSProperties;
    }
    return viewerDockMood.style;
  }, [effectiveMood.cssVars, isOwner, viewerDockMood.style]);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try {
      localStorage.setItem(DOCK_HINT_KEY, '1');
    } catch {
      // ignore storage failures
    }
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const openLauncher = useCallback(() => {
    dismissHint();
    setOsOpen(true);
  }, [dismissHint]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      pointerStart.current = {
        x: event.clientX,
        y: event.clientY,
        longPress: false,
      };
      clearLongPress();
      longPressTimer.current = setTimeout(() => {
        if (!pointerStart.current) return;
        pointerStart.current.longPress = true;
        openLauncher();
      }, LONG_PRESS_MS);
    },
    [clearLongPress, openLauncher]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const start = pointerStart.current;
      if (!start) return;
      if (
        Math.abs(event.clientX - start.x) > TAP_SLOP_PX ||
        Math.abs(event.clientY - start.y) > TAP_SLOP_PX
      ) {
        clearLongPress();
      }
    },
    [clearLongPress]
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const start = pointerStart.current;
      clearLongPress();
      pointerStart.current = null;

      if (!start || start.longPress) return;

      const dx = Math.abs(event.clientX - start.x);
      const dy = start.y - event.clientY;

      if (pageDrawerOpen) {
        if (dx < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) {
          openLauncher();
        }
        return;
      }

      if (dy > SWIPE_UP_PX && dx < 48) {
        dismissHint();
        openPageDrawer();
        return;
      }

      if (dx < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) {
        dismissHint();
        openPageDrawer();
      }
    },
    [clearLongPress, dismissHint, openLauncher, openPageDrawer, pageDrawerOpen]
  );

  return (
    <>
      <div
        className={`portfolio-summon-dock${osOpen ? ' is-launcher-open' : ''}${
          scrollHidden ? ' is-scroll-hidden' : ''
        }${pageDrawerOpen ? ' is-drawer-overlay' : ''}${
          write ? ' is-writing' : ''
        }`}
        data-mood={dockMoodId ?? undefined}
        style={dockMoodStyle}
      >
        {showHint && !pageDrawerOpen ? (
          <p className="portfolio-summon-hint" aria-hidden="true">
            Swipe up · hold for apps
          </p>
        ) : null}
        <OsDockPill
          pageAccountId={pageAccountId}
          grip={
            <button
              type="button"
              className="portfolio-summon-grip-zone is-interactive is-gesture-host"
              aria-haspopup="dialog"
              aria-expanded={osOpen}
              aria-label={
                pageDrawerOpen
                  ? 'Open launcher'
                  : 'Swipe up for page content. Hold for apps.'
              }
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className="portfolio-summon-grip" aria-hidden />
            </button>
          }
          nowPlaying={<CollectiblesNowPlayingDockChip />}
          write={
            write ? (
              <OsWriteDock
                placeholder={write.placeholder}
                ariaLabel={write.ariaLabel}
                disabled={write.disabled}
                pending={write.pending}
                error={write.error}
                above={write.above}
                accept={write.accept}
                onSubmit={write.onSubmit}
              />
            ) : undefined
          }
          action={
            compose?.type === 'action' ? (
              <PortfolioSummonComposeButton compose={compose.entry} />
            ) : undefined
          }
        />
      </div>

      <SummonLauncher
        apps={apps}
        pageAccountId={pageAccountId}
        showMyPage={!isOwner}
        open={osOpen}
        onOpenChange={setOsOpen}
        hideTrigger
      />
    </>
  );
}
