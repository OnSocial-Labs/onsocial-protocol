'use client';

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { accountIdsEqual } from '@/lib/account-match';
import { SummonLauncher } from '@/components/os/summon-launcher';
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
  const [osOpen, setOsOpen] = useState(false);
  const [showHint, setShowHint] = useState(readDockHintPending);

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
      <div className="portfolio-summon-dock">
        {showHint ? (
          <p className="portfolio-summon-hint" aria-hidden="true">
            Swipe up · hold for apps
          </p>
        ) : null}
        <button
          type="button"
          className="portfolio-summon"
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
