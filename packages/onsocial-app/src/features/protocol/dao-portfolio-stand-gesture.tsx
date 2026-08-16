'use client';

import { useState } from 'react';
import { StandingToggle } from '@/components/ui/standing-toggle';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface DaoPortfolioStandGestureProps {
  daoAccountId: string;
  daoName: string;
  bio?: string | null;
  avatarUrl?: string | null;
}

/**
 * Face gesture under DAO bio — Stand with / Standing only.
 * Org tools (Proposals · Members · …) stay in the chip row below.
 */
export function DaoPortfolioStandGesture({
  daoAccountId,
  daoName,
  bio = null,
  avatarUrl = null,
}: DaoPortfolioStandGestureProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { viewerStanding, isLoading } = useViewerRelationship(daoAccountId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(daoAccountId);
  const [busy, setBusy] = useState(false);

  if (!isConnected || !viewerAccountId) {
    return null;
  }

  const pending = busy || isStandingPendingForTarget(daoAccountId);
  const label = daoName.trim() || daoAccountId;

  async function handleStandToggle() {
    if (pending) return;
    rememberDaoStandingTarget(daoAccountId);
    setBusy(true);
    try {
      await updateStanding(
        {
          accountId: daoAccountId,
          name: daoName.trim() || null,
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
          error instanceof Error ? error.message : 'Could not update standing.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dao-portfolio-stand">
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
            disabled={pending}
            onClick={() => void handleStandToggle()}
            aria-label={
              viewerStanding ? `Step back from ${label}` : `Stand with ${label}`
            }
          >
            <StandingToggle active={viewerStanding} pending={pending} />
          </button>
        </div>
      )}
    </div>
  );
}
