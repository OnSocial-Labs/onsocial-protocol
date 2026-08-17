'use client';

import { useState } from 'react';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { EndorseComposeSheet } from '@/components/panels/endorse-compose-sheet';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { displayName } from '@/lib/profile-display';
import type { ResolvedMood } from '@/lib/moods/types';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PageDrawerGesturesProps {
  pageAccountId: string;
  profileName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  mood?: ResolvedMood | null;
  /** Hide while the drawer body is scrolling. */
  dockHidden?: boolean;
}

/**
 * Floating drawer dock: visitor Stand · Endorse · Support (face language).
 * Hidden for self; connect whisper when disconnected; fades while scrolling.
 */
export function PageDrawerGestures({
  pageAccountId,
  profileName,
  bio,
  avatarUrl,
  mood = null,
  dockHidden = false,
}: PageDrawerGesturesProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    connect,
  } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { viewerStanding, isLoading } = useViewerRelationship(pageAccountId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(pageAccountId);
  const [supportOpen, setSupportOpen] = useState(false);
  const [endorseOpen, setEndorseOpen] = useState(false);

  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, pageAccountId);

  if (isSelf) {
    return null;
  }

  const label = displayName(pageAccountId, profileName ?? undefined);

  const dockClassName = `page-drawer-gestures${
    dockHidden ? ' is-hidden' : ''
  }`;

  if (!isConnected || !viewerAccountId) {
    return (
      <div className={dockClassName} aria-hidden={dockHidden || undefined}>
        <div className="page-drawer-gestures-pill">
          <button
            type="button"
            className="page-drawer-gestures-connect"
            onClick={() => void connect()}
            tabIndex={dockHidden ? -1 : undefined}
          >
            Connect to Stand · Endorse · Support
          </button>
        </div>
      </div>
    );
  }

  const pending = isStandingPendingForTarget(pageAccountId);

  async function handleStandToggle() {
    if (pending) return;
    try {
      await updateStanding(
        {
          accountId: pageAccountId,
          name: profileName?.trim() || null,
          bio: bio ?? null,
          avatarUrl: avatarUrl ?? null,
        },
        !viewerStanding
      );
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : 'Could not update standing.',
      });
    }
  }

  return (
    <div className={dockClassName} aria-hidden={dockHidden || undefined}>
      <div className="page-drawer-gestures-pill">
        {isLoading ? (
          <div
            className="portfolio-identity-gesture-row portfolio-identity-gesture-row--loading"
            aria-hidden
          >
            <span className="portfolio-identity-gesture-shimmer" />
            <span className="portfolio-identity-gesture-sep" />
            <span className="portfolio-identity-gesture-shimmer" />
            <span className="portfolio-identity-gesture-sep" />
            <span className="portfolio-identity-gesture-shimmer" />
          </div>
        ) : (
          <div
            className="portfolio-identity-gesture-row"
            role="group"
            aria-label="Social gestures"
          >
            <button
              type="button"
              className={`portfolio-identity-gesture portfolio-identity-gesture--stand group${
                viewerStanding ? ' is-standing' : ''
              }`}
              disabled={pending}
              tabIndex={dockHidden ? -1 : undefined}
              onClick={() => void handleStandToggle()}
              aria-label={
                viewerStanding
                  ? `Step back from ${label}`
                  : `Stand with ${label}`
              }
            >
              <StandingToggle active={viewerStanding} pending={pending} />
            </button>

            <span className="portfolio-identity-gesture-sep" aria-hidden>
              ·
            </span>

            <button
              type="button"
              className="portfolio-identity-gesture portfolio-identity-gesture--endorse group"
              aria-label={`Endorse ${label}`}
              tabIndex={dockHidden ? -1 : undefined}
              onClick={() => setEndorseOpen(true)}
            >
              <span className="signal-group signal-group-endorse" aria-hidden>
                <ProtocolMotionArrow className="signal-metric-arrow" />
              </span>
              Endorse
            </button>

            <span className="portfolio-identity-gesture-sep" aria-hidden>
              ·
            </span>

            <button
              type="button"
              className="portfolio-identity-gesture portfolio-identity-gesture--support group"
              tabIndex={dockHidden ? -1 : undefined}
              onClick={() => setSupportOpen(true)}
              aria-label={`Support ${label}`}
            >
              <span
                className="signal-group signal-group-reputation"
                aria-hidden
              >
                <ProtocolMotionArrow className="signal-metric-arrow" />
              </span>
              Support
            </button>
          </div>
        )}
      </div>
      <EndorseComposeSheet
        open={endorseOpen}
        pageAccountId={pageAccountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        mood={mood}
        onOpenChange={setEndorseOpen}
      />
      <ProfileSupportSheet
        open={supportOpen}
        pageAccountId={pageAccountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        mood={mood}
        onOpenChange={setSupportOpen}
      />
    </div>
  );
}
