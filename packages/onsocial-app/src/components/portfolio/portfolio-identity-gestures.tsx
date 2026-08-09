'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { PortfolioOwnerPayoutMarks } from '@/components/portfolio/portfolio-owner-payout-marks';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerBlock } from '@/hooks/use-viewer-block';
import { useViewerMute } from '@/hooks/use-viewer-mute';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { overlayPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';
import type { ResolvedMood } from '@/lib/moods/types';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import {
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PortfolioIdentityGesturesProps {
  pageAccountId: string;
  profileName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  mood?: ResolvedMood | null;
}

/**
 * Face gesture slot under bio.
 * Connected visitor: Stand · Endorse · Support · More (mute/block).
 * Owner: gift + shop payout marks (open drawers). Pre-connect: hidden.
 */
export function PortfolioIdentityGestures({
  pageAccountId,
  profileName,
  bio,
  avatarUrl,
  mood = null,
}: PortfolioIdentityGesturesProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { viewerStanding, isLoading } = useViewerRelationship(pageAccountId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(pageAccountId);
  const { updateMute, isMuting, isMutePendingForTarget } = useViewerMute();
  const { updateBlock, isBlocking, isBlockPendingForTarget } = useViewerBlock();
  const [supportOpen, setSupportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, pageAccountId);
  const pending = isStandingPendingForTarget(pageAccountId);
  const label = displayName(pageAccountId, profileName ?? undefined);
  const endorsementsHref = overlayPath(pageAccountId, 'endorsements');
  const muted = isMuting(pageAccountId);
  const blocked = isBlocking(pageAccountId);
  const mutePending = isMutePendingForTarget(pageAccountId);
  const blockPending = isBlockPendingForTarget(pageAccountId);
  const blockEitherWay = isBlockEitherWay(pageAccountId);

  const moreItems = useMemo<ActionDrawerItem[]>(
    () => [
      {
        id: 'mute',
        label: mutePending
          ? muted
            ? 'Unmuting…'
            : 'Muting…'
          : muted
            ? 'Unmute'
            : 'Mute',
        disabled: mutePending,
        onSelect: () => {
          void (async () => {
            const next = !muted;
            try {
              await updateMute(pageAccountId, next);
              setTxResult({
                type: 'success',
                msg: next
                  ? txToastSuccess.accountMuted
                  : txToastSuccess.accountUnmuted,
              });
            } catch (error) {
              if (isWalletUserCancellation(error)) return;
              setTxResult({
                type: 'error',
                msg:
                  error instanceof Error
                    ? error.message
                    : next
                      ? txToastError.muteAccountFailed
                      : txToastError.unmuteAccountFailed,
              });
            } finally {
              setMoreOpen(false);
            }
          })();
        },
      },
      {
        id: 'block',
        label: blockPending
          ? blocked
            ? 'Unblocking…'
            : 'Blocking…'
          : blocked
            ? 'Unblock'
            : 'Block',
        destructive: !blocked,
        disabled: blockPending,
        onSelect: () => {
          void (async () => {
            const next = !blocked;
            try {
              await updateBlock(pageAccountId, next);
            } catch (error) {
              if (isWalletUserCancellation(error)) return;
              setTxResult({
                type: 'error',
                msg:
                  error instanceof Error
                    ? error.message
                    : next
                      ? txToastError.blockAccountFailed
                      : txToastError.unblockAccountFailed,
              });
            } finally {
              setMoreOpen(false);
            }
          })();
        },
      },
    ],
    [
      blockPending,
      blocked,
      mutePending,
      muted,
      pageAccountId,
      setTxResult,
      updateBlock,
      updateMute,
    ]
  );

  if (!isConnected || !viewerAccountId) {
    return null;
  }

  if (isSelf) {
    return <PortfolioOwnerPayoutMarks accountId={pageAccountId} />;
  }

  async function handleStandToggle() {
    if (pending) return;
    if (blockEitherWay) {
      setTxResult({
        type: 'error',
        msg: 'Standing is unavailable while a block is in place.',
      });
      return;
    }
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
    <div className="portfolio-identity-gestures">
      {isLoading ? (
        <div className="portfolio-identity-gesture-row" aria-hidden>
          <span className="portfolio-identity-gesture is-skeleton" />
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
            onClick={() => void handleStandToggle()}
            aria-label={
              viewerStanding ? `Step back from ${label}` : `Stand with ${label}`
            }
          >
            <StandingToggle active={viewerStanding} pending={pending} />
          </button>

          <span className="portfolio-identity-gesture-sep" aria-hidden>
            ·
          </span>

          <Link
            href={endorsementsHref}
            scroll={false}
            className="portfolio-identity-gesture portfolio-identity-gesture--endorse group"
            aria-label={`Endorse ${label}`}
          >
            <span className="signal-group signal-group-endorse" aria-hidden>
              <ProtocolMotionArrow className="signal-metric-arrow" />
            </span>
            Endorse
          </Link>

          <span className="portfolio-identity-gesture-sep" aria-hidden>
            ·
          </span>

          <button
            type="button"
            className="portfolio-identity-gesture portfolio-identity-gesture--support group"
            onClick={() => setSupportOpen(true)}
            aria-label={`Support ${label}`}
          >
            <span className="signal-group signal-group-reputation" aria-hidden>
              <ProtocolMotionArrow className="signal-metric-arrow" />
            </span>
            Support
          </button>

          <span className="portfolio-identity-gesture-sep" aria-hidden>
            ·
          </span>

          <button
            type="button"
            className="portfolio-identity-gesture portfolio-identity-gesture--more group"
            onClick={() => setMoreOpen(true)}
            aria-label={`More actions for ${label}`}
          >
            More
          </button>
        </div>
      )}
      <ProfileSupportSheet
        open={supportOpen}
        pageAccountId={pageAccountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        mood={mood}
        onOpenChange={setSupportOpen}
      />
      <ActionDrawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        label="Account options"
        items={moreItems}
      />
    </div>
  );
}
