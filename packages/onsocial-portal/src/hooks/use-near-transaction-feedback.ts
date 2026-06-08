'use client';

import { useCallback, useState } from 'react';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { waitForNearTransactionBatchConfirmation } from '@/lib/near-rpc';
import { humanizeSwapTransactionError } from '@/lib/portal-swap-quote';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';

type TrackNearTransactionParams = {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage?: string;
  onFailure?: (message: string) => void;
};

/** Prefer the culminating tx in a batch (e.g. swap after wNEAR deposit). */
function resolveExplorerTxHash(hashes: string[]): string | null {
  if (hashes.length === 0) return null;
  return hashes.length > 1 ? hashes[hashes.length - 1]! : hashes[0]!;
}

export function useNearTransactionFeedback(
  accountId: string | null | undefined
) {
  const [txResult, setTxResult] = useState<TransactionFeedback | null>(null);

  const clearTxResult = useCallback(() => {
    setTxResult(null);
  }, []);

  const trackTransaction = useCallback(
    async ({
      txHashes,
      submittedMessage,
      successMessage,
      failureMessage,
      onFailure,
    }: TrackNearTransactionParams): Promise<boolean> => {
      const uniqueHashes = [...new Set(txHashes.filter(Boolean))];
      const explorerTxHash = resolveExplorerTxHash(uniqueHashes);
      const explorerHref = explorerTxHash
        ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${explorerTxHash}`
        : null;

      if (!accountId) {
        const msg = 'Connect wallet to continue.';
        setTxResult({
          type: 'error',
          msg,
        });
        onFailure?.(msg);
        return false;
      }

      if (uniqueHashes.length === 0) {
        setTxResult({
          type: 'success',
          msg: successMessage,
        });
        return true;
      }

      setTxResult({
        type: 'pending',
        pendingPhase: 'chain',
        msg: submittedMessage,
        explorerHref,
      });

      try {
        const result = await waitForNearTransactionBatchConfirmation({
          txHashes: uniqueHashes,
          accountId,
        });

        if (!result.ok) {
          const msg = humanizeSwapTransactionError(
            result.errorMessage ?? failureMessage ?? 'Transaction failed.'
          );
          setTxResult({
            type: 'error',
            msg,
            explorerHref,
          });
          onFailure?.(msg);
          return false;
        }

        setTxResult({
          type: 'success',
          msg: successMessage,
          explorerHref,
        });
        return true;
      } catch (error) {
        const msg = humanizeSwapTransactionError(
          error instanceof Error
            ? error.message
            : (failureMessage ?? 'Transaction failed.')
        );
        setTxResult({
          type: 'error',
          msg,
          explorerHref,
        });
        onFailure?.(msg);
        return false;
      }
    },
    [accountId]
  );

  return {
    txResult,
    setTxResult,
    clearTxResult,
    trackTransaction,
  };
}
