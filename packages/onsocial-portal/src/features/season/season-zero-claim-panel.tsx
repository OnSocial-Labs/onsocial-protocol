'use client';

import { useCallback, useState } from 'react';
import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import {
  isPostLiveSeasonPhase,
  resolveSeasonZeroClaimStatusCopy,
} from '@/features/season/season-zero-claim-copy';
import type { SeasonZeroStanding } from '@/features/season/season-zero-standing-row';
import type {
  SeasonZeroClaimRecord,
  SeasonZeroLifecyclePhase,
} from '@/features/season/season-zero-types';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { extractNearTransactionHashes } from '@/lib/near-rpc';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

const os = createPortalOnSocialClient();

function formatScore(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
  );
}

export function useSeasonZeroClaimActions({
  claim,
  onClaimed,
}: {
  claim: SeasonZeroClaimRecord | null;
  onClaimed?: () => void;
}) {
  const { accountId, connect, getSigningWallet, isConnected } = useWallet();
  const { setTxResult, trackTransaction, txResult, clearTxResult } =
    useNearTransactionFeedback(accountId);
  const [claimPending, setClaimPending] = useState(false);

  const handleClaim = useCallback(async () => {
    if (!claim || claim.claimed || claimPending) return;
    if (!isConnected) {
      await connect();
      return;
    }

    setClaimPending(true);
    try {
      const { wallet, accountId: signerId } = await getSigningWallet();
      const payload = os.socialSpend.buildClaimSeasonRewardTransaction({
        seasonId: claim.seasonId,
        amount: claim.amountYocto,
        proof: claim.proof,
      });

      const result = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId,
        receiverId: payload.receiverId,
        actions: payload.actions.map((action) => ({
          type: 'FunctionCall' as const,
          params: {
            methodName: action.methodName,
            args: action.args,
            gas: action.gas,
            deposit: action.deposit,
          },
        })),
      });

      const txHashes = extractNearTransactionHashes(result);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: 'Collecting season rewards…',
        successMessage: 'Season SOCIAL collected.',
        failureMessage: 'Could not collect season rewards.',
      });

      if (confirmed) {
        onClaimed?.();
      }
    } catch (error) {
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : 'Could not collect season rewards.',
      });
    } finally {
      setClaimPending(false);
    }
  }, [
    claim,
    claimPending,
    connect,
    getSigningWallet,
    isConnected,
    onClaimed,
    setTxResult,
    trackTransaction,
  ]);

  return { handleClaim, claimPending, txResult, clearTxResult };
}

/** Standalone claim panel — prefer GenesisRallyStrip on the Season 0 page. */
export function SeasonZeroClaimPanel({
  phase,
  claim,
  myStanding = null,
  onClaimed,
  className,
}: {
  phase: SeasonZeroLifecyclePhase | null;
  claim: SeasonZeroClaimRecord | null;
  myStanding?: Pick<SeasonZeroStanding, 'rank' | 'score'> | null;
  onClaimed?: () => void;
  className?: string;
}) {
  const { accountId, connect } = useWallet();
  const { handleClaim, claimPending, txResult, clearTxResult } =
    useSeasonZeroClaimActions({
      claim,
      onClaimed,
    });

  if (!claim && !isPostLiveSeasonPhase(phase)) return null;

  const claimOpen = phase === 'claim_open';

  if (claim?.claimed) {
    return (
      <SurfacePanel
        radius="xl"
        tone="soft"
        padding="snug"
        className={cn('border-border/40 portal-gold-panel', className)}
      >
        <div className="flex items-start gap-3">
          <Gift className="portal-gold-icon mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Season rewards claimed
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You already claimed{' '}
              <span className="font-mono text-foreground">
                {formatGenesisSocialBalanceDisplay(claim.amountYocto)}
              </span>{' '}
              SOCIAL for Season 0.
            </p>
          </div>
        </div>
      </SurfacePanel>
    );
  }

  if (!claimOpen && claim) {
    const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);
    return (
      <SurfacePanel
        radius="xl"
        tone="soft"
        padding="snug"
        className={cn('border-border/40', className)}
      >
        <p className="portal-eyebrow text-muted-foreground">
          Season claim
          <span className="text-muted-foreground/40"> · </span>
          <span className="portal-green-text">Reward ready</span>
        </p>
        <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground/75">
          #{claim.rank} · {formatScore(claim.score)} pts · {amountLabel} SOCIAL
          · claims open when the window starts
        </p>
      </SurfacePanel>
    );
  }

  if (!claim && isPostLiveSeasonPhase(phase)) {
    if (!accountId) {
      return (
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="snug"
          className={cn('border-border/40', className)}
        >
          <p className="portal-eyebrow text-muted-foreground">
            Season claim
            <span className="text-muted-foreground/40"> · </span>
            Connect wallet
          </p>
          <Button size="sm" className="mt-2.5" onClick={() => void connect()}>
            Connect wallet
          </Button>
        </SurfacePanel>
      );
    }

    const { statusLabel, detailLine } = resolveSeasonZeroClaimStatusCopy(
      phase,
      myStanding
    );
    return (
      <SurfacePanel
        radius="xl"
        tone="soft"
        padding="snug"
        className={cn('border-border/40', className)}
      >
        <p className="portal-eyebrow text-muted-foreground">
          Season claim
          <span className="text-muted-foreground/40"> · </span>
          <span className="text-muted-foreground/80">{statusLabel}</span>
        </p>
        {detailLine ? (
          <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground/75">
            {detailLine}
          </p>
        ) : null}
      </SurfacePanel>
    );
  }

  if (!claimOpen) return null;

  if (!accountId || !claim) return null;

  const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel
        radius="xl"
        tone="soft"
        padding="snug"
        className={cn('border-border/40 portal-gold-panel', className)}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Gift className="portal-gold-icon h-4 w-4" />
              <p className="text-sm font-semibold text-foreground">
                Claim your season rewards
              </p>
              <PortalBadge accent="gold" size="sm">
                Rank #{claim.rank}
              </PortalBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              Final score{' '}
              <span className="font-mono text-foreground">
                {formatScore(claim.score)}
              </span>{' '}
              · payout{' '}
              <span className="font-mono font-semibold text-foreground">
                {amountLabel} SOCIAL
              </span>
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            loading={claimPending}
            onClick={() => void handleClaim()}
          >
            Claim {amountLabel} SOCIAL
          </Button>
        </div>
      </SurfacePanel>
    </>
  );
}
