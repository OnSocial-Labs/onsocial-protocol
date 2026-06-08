'use client';

import { useCallback, useState } from 'react';
import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import type { SeasonZeroClaimRecord } from '@/features/season/season-zero-types';
import {
  formatGenesisYoctoAsSocial,
  GENESIS_SEASON_ID,
} from '@/lib/genesis-season';
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

export function SeasonZeroClaimPanel({
  claimOpen,
  claim,
  onClaimed,
  className,
}: {
  claimOpen: boolean;
  claim: SeasonZeroClaimRecord | null;
  onClaimed?: () => void;
  className?: string;
}) {
  const { accountId, connect, getSigningWallet, isConnected } = useWallet();
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
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
        seasonId: GENESIS_SEASON_ID,
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
        submittedMessage: 'Claiming season rewards…',
        successMessage: 'Season 0 SOCIAL claimed.',
        failureMessage: 'Could not claim season rewards.',
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
            : 'Could not claim season rewards.',
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

  if (!claim && !claimOpen) return null;

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
                {formatGenesisYoctoAsSocial(claim.amountYocto)}
              </span>{' '}
              SOCIAL for Season 0.
            </p>
          </div>
        </div>
      </SurfacePanel>
    );
  }

  if (!claimOpen && claim) {
    const amountLabel = formatGenesisYoctoAsSocial(claim.amountYocto);
    return (
      <SurfacePanel radius="xl" tone="soft" className={cn(className)}>
        <p className="text-sm font-medium text-foreground">Reward ready</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You are scheduled to receive{' '}
          <span className="font-mono font-semibold text-foreground">
            {amountLabel} SOCIAL
          </span>{' '}
          (rank #{claim.rank}). Claims open when the on-chain window starts.
        </p>
      </SurfacePanel>
    );
  }

  if (!claimOpen) return null;

  if (!accountId) {
    return (
      <SurfacePanel radius="xl" tone="soft" className={cn(className)}>
        <p className="text-sm font-medium text-foreground">
          Claim season rewards
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your wallet to see if you have a Season 0 payout.
        </p>
        <Button size="sm" className="mt-3" onClick={() => void connect()}>
          Connect wallet
        </Button>
      </SurfacePanel>
    );
  }

  if (!claim) {
    return (
      <SurfacePanel radius="xl" tone="soft" className={cn(className)}>
        <p className="text-sm font-medium text-foreground">
          No claim for this wallet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Either you were not eligible at settlement, the season has not been
          finalized yet, or this account did not receive a payout slice.
        </p>
      </SurfacePanel>
    );
  }

  const amountLabel = formatGenesisYoctoAsSocial(claim.amountYocto);

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
            <p className="text-xs text-muted-foreground/75">
              One wallet claim per account. The contract verifies your merkle
              proof against the published season root.
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
