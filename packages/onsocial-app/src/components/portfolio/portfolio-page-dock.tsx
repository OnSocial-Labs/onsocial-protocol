'use client';

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { PenFillIcon, StarsCFillIcon } from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useComposeLauncher } from '@/contexts/compose-launcher-context';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { accountIdsEqual } from '@/lib/account-match';
import { CollectiblesNowPlayingDockChip } from '@/components/os/collectibles-now-playing-dock-chip';
import { SummonLauncher } from '@/components/os/summon-launcher';
import { OsDockPill } from '@/components/wallet/os-dock-pill';
import {
  ownerPortfolioOsApps,
  visitorPortfolioOsApps,
} from '@/lib/os-apps';

const DOCK_HINT_KEY = 'onpage-portfolio-dock-hint-seen';
const LONG_PRESS_MS = 480;
const SWIPE_UP_PX = 28;
const TAP_SLOP_PX = 12;

interface PortfolioPageDockProps {
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

export function PortfolioPageDock({ pageAccountId }: PortfolioPageDockProps) {
  const { open: openPageDrawer } = usePageContentDrawer();
  const { accountId, isConnected } = useAppWallet();
  const compose = useComposeLauncher();
  const { isPreviewingMood } = usePortfolioMoodPreview();
  const { isPreviewing: isPreviewingFace } = usePortfolioFacePreview();
  const [osOpen, setOsOpen] = useState(false);
  const [showHint, setShowHint] = useState(readDockHintPending);
  const previewPinned = isPreviewingMood || isPreviewingFace;
  // Keep dock visible while commit bars are up (save/refresh can scroll-hide it).
  const dockHidden = useDockAutoHide(previewPinned) && !osOpen;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStart = useRef<{
    x: number;
    y: number;
    longPress: boolean;
  } | null>(null);

  const isOwner =
    isConnected && Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);
  const apps = isOwner
    ? ownerPortfolioOsApps(pageAccountId)
    : visitorPortfolioOsApps(pageAccountId);

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

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      pointerStart.current = {
        x: event.clientX,
        y: event.clientY,
        longPress: false,
      };
      clearLongPress();
      longPressTimer.current = setTimeout(() => {
        if (!pointerStart.current) {
          return;
        }
        pointerStart.current.longPress = true;
        dismissHint();
        setOsOpen(true);
      }, LONG_PRESS_MS);
    },
    [clearLongPress, dismissHint]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const start = pointerStart.current;
      if (!start) {
        return;
      }
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

      if (!start || start.longPress) {
        return;
      }

      const dx = Math.abs(event.clientX - start.x);
      const dy = start.y - event.clientY;

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
    [clearLongPress, dismissHint, openPageDrawer]
  );

  return (
    <>
      <div
        className={`portfolio-summon-dock${osOpen ? ' is-launcher-open' : ''}${dockHidden ? ' is-scroll-hidden' : ''}`}
      >
        {showHint ? (
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
              aria-label="Swipe up for page content. Hold for apps."
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
          action={
            compose ? (
              <button
                type="button"
                className={`portfolio-summon-compose${
                  compose.kind === 'drop' ? ' is-drop' : ''
                }`}
                onClick={compose.action}
                aria-label={
                  compose.kind === 'drop' ? 'Start a drop' : 'Compose a post'
                }
              >
                {compose.kind === 'drop' ? (
                  <StarsCFillIcon
                    className="portfolio-summon-compose-icon"
                    aria-hidden
                  />
                ) : (
                  <PenFillIcon
                    className="portfolio-summon-compose-icon"
                    aria-hidden
                  />
                )}
              </button>
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
