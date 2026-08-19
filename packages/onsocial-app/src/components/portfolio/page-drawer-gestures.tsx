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
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { displayName } from '@/lib/profile-display';
import type { ResolvedMood } from '@/lib/moods/types';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation, formatStandingActionError } from '@/lib/wallet-errors';

interface PageDrawerGesturesProps {
  pageAccountId: string;
  profileName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  mood?: ResolvedMood | null;
  /** DAO org face — Stand · Support (no Endorse). */
  isDao?: boolean;
  /** Hide while the drawer body is scrolling. */
  dockHidden?: boolean;
}

/**
 * Floating drawer dock — same visitor language as the portfolio face.
 * People: Stand · Endorse · Support. DAO: Stand · Support.
 */
export function PageDrawerGestures({
  pageAccountId,
  profileName,
  bio,
  avatarUrl,
  mood = null,
  isDao = false,
  dockHidden = false,
}: PageDrawerGesturesProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    connect,
  } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { viewerStanding, theyStandWithViewer, isLoading } = useViewerRelationship(pageAccountId);
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
  const blockEitherWay = isBlockEitherWay(pageAccountId);

  const dockClassName = `page-drawer-gestures${
    dockHidden ? ' is-hidden' : ''
  }`;

  const connectLabel = isDao
    ? 'Connect to Stand · Support'
    : 'Connect to Stand · Endorse · Support';

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
            {connectLabel}
          </button>
        </div>
      </div>
    );
  }

  const pending = isStandingPendingForTarget(pageAccountId);
  const shimmerSlots = isDao ? 2 : 3;

  async function handleStandToggle() {
    if (pending) return;
    if (blockEitherWay) {
      setTxResult({
        type: 'error',
        msg: 'Standing is unavailable while a block is in place.',
      });
      return;
    }
    if (isDao) {
      rememberDaoStandingTarget(pageAccountId);
    }
    try {
      await updateStanding(
        {
          accountId: pageAccountId,
          name: profileName?.trim() || null,
          bio: bio ?? null,
          avatarUrl: avatarUrl ?? null,
          isDao: isDao || undefined,
          theyStandWithViewer,
        },
        !viewerStanding
      );
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg: formatStandingActionError(error),
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
            {Array.from({ length: shimmerSlots }, (_, index) => (
              <span key={index}>
                {index > 0 ? (
                  <span className="portfolio-identity-gesture-sep" />
                ) : null}
                <span className="portfolio-identity-gesture-shimmer" />
              </span>
            ))}
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
              disabled={pending || blockEitherWay}
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

            {!isDao ? (
              <>
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
                  <span
                    className="signal-group signal-group-endorse"
                    aria-hidden
                  >
                    <ProtocolMotionArrow className="signal-metric-arrow" />
                  </span>
                  Endorse
                </button>
              </>
            ) : null}

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
      <ProfileSupportSheet
        open={supportOpen}
        pageAccountId={pageAccountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        mood={mood}
        onOpenChange={setSupportOpen}
      />
      {!isDao ? (
        <EndorseComposeSheet
          open={endorseOpen}
          pageAccountId={pageAccountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
          mood={mood}
          onOpenChange={setEndorseOpen}
        />
      ) : null}
    </div>
  );
}
