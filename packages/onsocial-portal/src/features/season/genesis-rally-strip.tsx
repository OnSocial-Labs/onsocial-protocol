'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import {
  GENESIS_RALLY_JOIN_SOCIAL_LABEL,
  GENESIS_RALLY_JOIN_YOCTO,
  GENESIS_SEASON_ID,
} from '@/lib/genesis-season';
import { extractNearTransactionHashes } from '@/lib/near-rpc';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

const os = createPortalOnSocialClient();

interface SeasonZeroMeResponse {
  success?: boolean;
  standing?: { eligible?: boolean } | null;
}

export function GenesisRallyStrip({ className }: { className?: string }) {
  const { accountId, connect, getSigningWallet, isConnected } = useWallet();
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);
  const [joinPending, setJoinPending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const standing = accountId
        ? await fetch(
            `/api/seasons/${GENESIS_SEASON_ID}/me?account_id=${encodeURIComponent(accountId)}`,
            { cache: 'no-store' }
          )
            .then(
              (response) => response.json() as Promise<SeasonZeroMeResponse>
            )
            .catch(() => null)
        : null;
      setJoined(standing?.standing?.eligible === true);
    } catch {
      setJoined(false);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const joinDisabled = useMemo(
    () => joinPending || loading || joined,
    [joinPending, joined, loading]
  );

  const handleJoin = useCallback(async () => {
    if (joined || joinPending) return;
    if (!isConnected) {
      await connect();
      return;
    }

    setJoinPending(true);
    try {
      const { wallet, accountId: signerId } = await getSigningWallet();
      const payload = os.socialSpend.buildSpendTransaction({
        amount: GENESIS_RALLY_JOIN_YOCTO.toString(),
        appId: 'portal',
        action: 'join_rally',
        targetType: 'rally',
        targetId: GENESIS_SEASON_ID,
        seasonId: GENESIS_SEASON_ID,
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
        submittedMessage: 'Joining Genesis Rally…',
        successMessage: 'You joined Season 0.',
        failureMessage: 'Could not join the rally.',
      });

      if (confirmed) {
        setJoined(true);
        window.setTimeout(() => void refresh(), 4_000);
      }
    } catch (error) {
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error ? error.message : 'Could not join the rally.',
      });
    } finally {
      setJoinPending(false);
    }
  }, [
    connect,
    getSigningWallet,
    isConnected,
    joinPending,
    joined,
    refresh,
    setTxResult,
    trackTransaction,
  ]);

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel
        radius="xl"
        tone="soft"
        padding="snug"
        className={cn('border-border/40', className)}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="portal-gold-icon h-3.5 w-3.5 shrink-0" />
              <p className="portal-eyebrow text-muted-foreground">
                Genesis Rally · Season 0
              </p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Join with SOCIAL, build your profile, stand with people, and show
              up on the board.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
            {joined ? (
              <PortalBadge accent="gold" size="sm">
                Joined
              </PortalBadge>
            ) : (
              <Button
                size="sm"
                variant="accent"
                className="h-9 px-4"
                disabled={joinDisabled}
                loading={joinPending}
                onClick={() => void handleJoin()}
              >
                Join · {GENESIS_RALLY_JOIN_SOCIAL_LABEL} SOCIAL
              </Button>
            )}
          </div>
        </div>
      </SurfacePanel>
    </>
  );
}
