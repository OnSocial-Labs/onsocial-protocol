'use client';

import { useCallback, useState } from 'react';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { waitForNearTransactionBatchConfirmation } from '@/lib/app-near-rpc';
import { nearExplorerTxHref } from '@/lib/app-config';

type TrackNearTransactionParams = {
  txHashes: string[];
  /**
   * Kept for call-site readability / future copy. App toasts are success/error
   * only — the action button owns the wait (pulsing dots).
   */
  submittedMessage?: string;
  successMessage: string;
  failureMessage?: string;
  onFailure?: (message: string) => void;
  actionHref?: string | null;
  actionLabel?: string | null;
};

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
      successMessage,
      failureMessage,
      onFailure,
      actionHref,
      actionLabel,
    }: TrackNearTransactionParams): Promise<boolean> => {
      const uniqueHashes = [...new Set(txHashes.filter(Boolean))];
      const explorerHref = nearExplorerTxHref(
        resolveExplorerTxHash(uniqueHashes)
      );

      if (!accountId) {
        const msg = 'Connect wallet to continue.';
        setTxResult({ type: 'error', msg });
        onFailure?.(msg);
        return false;
      }

      if (uniqueHashes.length === 0) {
        setTxResult({
          type: 'success',
          msg: successMessage,
          actionHref,
          actionLabel,
        });
        return true;
      }

      // No pending/blue toast — button stays pulsing until settle.
      try {
        const result = await waitForNearTransactionBatchConfirmation({
          txHashes: uniqueHashes,
          accountId,
        });

        if (!result.ok) {
          const msg =
            result.errorMessage ?? failureMessage ?? 'Transaction failed.';
          setTxResult({ type: 'error', msg, explorerHref });
          onFailure?.(msg);
          return false;
        }

        setTxResult({
          type: 'success',
          msg: successMessage,
          explorerHref: actionHref ? null : explorerHref,
          actionHref,
          actionLabel,
        });
        return true;
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : (failureMessage ?? 'Transaction failed.');
        setTxResult({ type: 'error', msg, explorerHref });
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
