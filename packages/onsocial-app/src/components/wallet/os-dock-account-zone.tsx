'use client';

import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ProfileAvatar } from '@onsocial/ui';
import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { fallbackLabel } from '@/lib/profile-display';

const HOLD_APPS_MS = 480;
const TAP_SLOP_PX = 12;

interface OsDockAccountZoneProps {
  pageAccountId?: string;
  /** Hold the avatar to open the app launcher while writing (no grip chrome). */
  onHoldApps?: () => void;
}

/** Left segment of the unified OS dock pill — account sheet or connect. */
export function OsDockAccountZone({
  pageAccountId,
  onHoldApps,
}: OsDockAccountZoneProps) {
  const { accountId, isConnected, isLoading, connect } = useAppWallet();
  const { open, openAccountSheet } = useAppAccountSheet();
  const viewerShell = useViewerProfileShellContext();
  const avatarUrl = viewerShell?.avatarUrl ?? null;
  const shellLoading =
    Boolean(isLoading || viewerShell?.isLoading) && !avatarUrl;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!onHoldApps) return;
      holdFired.current = false;
      pointerStart.current = { x: event.clientX, y: event.clientY };
      clearHold();
      holdTimer.current = setTimeout(() => {
        holdFired.current = true;
        onHoldApps();
      }, HOLD_APPS_MS);
    },
    [clearHold, onHoldApps]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const start = pointerStart.current;
      if (!start || !onHoldApps) return;
      if (
        Math.abs(event.clientX - start.x) > TAP_SLOP_PX ||
        Math.abs(event.clientY - start.y) > TAP_SLOP_PX
      ) {
        clearHold();
      }
    },
    [clearHold, onHoldApps]
  );

  const handlePointerEnd = useCallback(() => {
    clearHold();
    pointerStart.current = null;
  }, [clearHold]);

  const guardHoldClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (!holdFired.current) return false;
      event.preventDefault();
      event.stopPropagation();
      holdFired.current = false;
      return true;
    },
    []
  );

  if (!isConnected || !accountId) {
    if (isLoading) {
      return (
        <span className="portfolio-summon-account" aria-hidden>
          <ProfileAvatar size="sm" shellLoading />
        </span>
      );
    }

    return (
      <button
        type="button"
        className="portfolio-summon-account is-connect"
        aria-label="Connect wallet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(event) => {
          if (onHoldApps) event.preventDefault();
        }}
        onClick={(event) => {
          if (guardHoldClick(event)) return;
          void connect();
        }}
      >
        <span className="app-wallet-connect-glyph" aria-hidden />
      </button>
    );
  }

  const label = fallbackLabel(accountId);

  return (
    <button
      type="button"
      className="portfolio-summon-account is-you"
      aria-label={
        onHoldApps
          ? `You, @${label}. Hold for apps.`
          : `You, @${label}`
      }
      aria-haspopup="dialog"
      aria-expanded={open}
      title={`@${label}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onContextMenu={(event) => {
        if (onHoldApps) event.preventDefault();
      }}
      onClick={(event) => {
        if (guardHoldClick(event)) return;
        openAccountSheet({ pageAccountId });
      }}
    >
      <ProfileAvatar
        src={avatarUrl}
        fallbackInitial={label}
        shellLoading={shellLoading}
        size="sm"
      />
    </button>
  );
}
