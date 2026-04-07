'use client';

import { useCallback, useState } from 'react';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { waitForNearTransactionBatchConfirmation } from '@/lib/near-rpc';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';

type TrackNearTransactionParams = {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage?: string;
};

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
    }: TrackNearTransactionParams): Promise<boolean> => {
      const uniqueHashes = [...new Set(txHashes.filter(Boolean))];
      const explorerHref = uniqueHashes[0]
        ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${uniqueHashes[0]}`
        : null;

      if (!accountId) {
        setTxResult({
          type: 'error',
          msg: 'Connect wallet to continue.',
        });
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
          setTxResult({
            type: 'error',
            msg:
              result.errorMessage ??
              failureMessage ??
              'Transaction failed.',
            explorerHref,
          });
          return false;
        }

        setTxResult({
          type: 'success',
          msg: successMessage,
          explorerHref,
        });
        return true;
      } catch (error) {
        setTxResult({
          type: 'error',
          msg:
            error instanceof Error
              ? error.message
              : (failureMessage ?? 'Transaction failed.'),
          explorerHref,
        });
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
