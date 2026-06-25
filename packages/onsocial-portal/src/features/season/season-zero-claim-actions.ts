'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import type { SeasonZeroClaimRecord } from '@/features/season/season-zero-types';
import { extractNearTransactionHashes } from '@/lib/near-rpc';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const os = createPortalOnSocialClient();

/** Button loading only while signing; toast owns chain confirmation; hide on success. */
export type SeasonCollectPhase =
  | 'idle'
  | 'signing'
  | 'confirming'
  | 'succeeded';

export function useSeasonZeroClaimActions({
  claim,
  onClaimed,
}: {
  claim: SeasonZeroClaimRecord | null;
  onClaimed?: () => void;
}) {
  const { accountId, connect, getSigningWallet, isConnected } = useWallet();
  const {
    beginSeasonClaim,
    confirmSeasonClaim,
    endSeasonClaim,
    deriveSeasonClaim,
  } = useSeasonParticipation();
  const { setTxResult, trackTransaction, txResult, clearTxResult } =
    useNearTransactionFeedback(accountId);
  const [phase, setPhase] = useState<SeasonCollectPhase>('idle');

  useEffect(() => {
    setPhase('idle');
  }, [claim?.accountId, claim?.seasonId]);

  const handleClaim = useCallback(async () => {
    if (
      !claim ||
      claim.claimed ||
      phase === 'signing' ||
      phase === 'confirming' ||
      phase === 'succeeded'
    ) {
      return;
    }

    if (!isConnected) {
      await connect();
      return;
    }

    setPhase('signing');
    beginSeasonClaim(claim.seasonId);
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

      setPhase('confirming');
      const txHashes = extractNearTransactionHashes(result);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastPending.collectingSocial,
        successMessage: txToastSuccess.socialCollected,
        failureMessage: txToastError.collectSocialFailed,
      });

      if (confirmed) {
        confirmSeasonClaim(claim.seasonId);
        setPhase('succeeded');
        onClaimed?.();
        return;
      }

      setPhase('idle');
    } catch (error) {
      setPhase('idle');
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.collectSocialFailed,
      });
    } finally {
      endSeasonClaim(claim.seasonId);
    }
  }, [
    beginSeasonClaim,
    claim,
    confirmSeasonClaim,
    connect,
    endSeasonClaim,
    getSigningWallet,
    isConnected,
    onClaimed,
    phase,
    setTxResult,
    trackTransaction,
  ]);

  const derivedClaim = deriveSeasonClaim(claim);
  const isCollectSettled =
    phase === 'succeeded' ||
    Boolean(derivedClaim?.claimed) ||
    Boolean(claim?.claimed);

  useEffect(() => {
    if (derivedClaim?.claimed) {
      setPhase('succeeded');
    }
  }, [derivedClaim?.claimed]);

  const isButtonVisible = phase === 'idle' || phase === 'signing';
  const isButtonLoading = phase === 'signing' || phase === 'confirming';

  return {
    handleClaim,
    phase,
    isButtonVisible,
    isButtonLoading,
    isCollectSettled,
    txResult,
    clearTxResult,
  };
}
