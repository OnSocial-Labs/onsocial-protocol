'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { PortfolioOwnerSupportCollect } from '@/components/portfolio/portfolio-owner-support-collect';
import { ProfileSupportSheet } from '@/components/portfolio/profile-support-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { overlayPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';
import type { ResolvedMood } from '@/lib/moods/types';
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
 * Connected visitor: Stand · Endorse · Support.
 * Owner: gift · amount · Collect when unclaimed target balance > 0.
 * Pre-connect: hidden.
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
  const [supportOpen, setSupportOpen] = useState(false);

  const isSelf =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, pageAccountId);

  if (!isConnected || !viewerAccountId) {
    return null;
  }

  if (isSelf) {
    return <PortfolioOwnerSupportCollect accountId={pageAccountId} />;
  }

  const pending = isStandingPendingForTarget(pageAccountId);
  const label = displayName(pageAccountId, profileName ?? undefined);
  const endorsementsHref = overlayPath(pageAccountId, 'endorsements');

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
    <div className="portfolio-identity-gestures">
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
    </div>
  );
}
