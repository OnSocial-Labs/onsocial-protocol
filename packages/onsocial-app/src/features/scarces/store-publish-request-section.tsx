'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  buildStorePublishRequestPayload,
  fetchMyStorePublishDecision,
  fetchMyStorePublishRequest,
  isStorePublishRequestRejected,
  storeRequestPath,
  type StorePublishDecision,
  type StorePublishRequest,
} from '@/features/scarces/store-publish-requests';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/**
 * Compact requester form for approval-mode hubs.
 * Staff inbox lives in Settings → Publish requests (GlassSheet).
 */
export function StorePublishRequestSection({
  appId,
  canRequest,
  isApprovedCreator,
}: {
  appId: string;
  /** Connected viewer who cannot create yet (approval mode). */
  canRequest: boolean;
  isApprovedCreator: boolean;
}) {
  const { accountId } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [mine, setMine] = useState<StorePublishRequest | null>(null);
  const [decision, setDecision] = useState<StorePublishDecision | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (canRequest && accountId) {
      void Promise.all([
        fetchMyStorePublishRequest(appId, accountId),
        fetchMyStorePublishDecision(appId, accountId),
      ]).then(([row, dec]) => {
        if (cancelled) return;
        setMine(row);
        setDecision(dec);
      });
    } else {
      setMine(null);
      setDecision(null);
    }
    return () => {
      cancelled = true;
    };
  }, [appId, accountId, canRequest, refreshKey]);

  const declined =
    mine != null &&
    mine.status === 'pending' &&
    decision != null &&
    isStorePublishRequestRejected(mine, [decision]);

  const submitRequest = useCallback(async () => {
    if (!accountId || pending) return;
    setPending(true);
    try {
      const { client } = await getClient();
      const path = storeRequestPath(appId);
      const response = await client.social.set(
        path,
        buildStorePublishRequestPayload({
          appId,
          message,
          status: 'pending',
        })
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.requestingStoreAccess,
        successMessage: txToastSuccess.storeAccessRequested,
        failureMessage: txToastError.requestStoreAccessFailed,
      });
      if (!confirmed) return;
      setMessage('');
      setRefreshKey((k) => k + 1);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.requestStoreAccessFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    accountId,
    pending,
    getClient,
    appId,
    message,
    trackTransaction,
    setTxResult,
  ]);

  const withdrawRequest = useCallback(async () => {
    if (!accountId || pending) return;
    setPending(true);
    try {
      const { client } = await getClient();
      const response = await client.social.set(storeRequestPath(appId), null);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.withdrawingStoreAccess,
        successMessage: txToastSuccess.storeAccessWithdrawn,
        failureMessage: txToastError.withdrawStoreAccessFailed,
      });
      if (!confirmed) return;
      setRefreshKey((k) => k + 1);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.withdrawStoreAccessFailed,
      });
    } finally {
      setPending(false);
    }
  }, [accountId, pending, getClient, appId, trackTransaction, setTxResult]);

  if (!canRequest || isApprovedCreator) return null;

  return (
    <section className="app-publish-requests" aria-label="Publishing access">
      <div className="app-publish-request-form">
        <h3 className="market-section-title">Request publishing access</h3>
        {declined ? (
          <>
            <p className="app-page-note">
              Your request was declined. You can send a new one.
            </p>
            <label className="guild-field" htmlFor="store-publish-message">
              <span>Note (optional)</span>
              <textarea
                id="store-publish-message"
                rows={3}
                value={message}
                maxLength={280}
                disabled={pending}
                placeholder="What would you publish here?"
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready={!pending}
                disabled={pending}
                onClick={() => void submitRequest()}
              >
                {pending ? 'Requesting…' : 'Request again'}
              </OsSheetAction>
            </OsSheetActions>
          </>
        ) : mine?.status === 'pending' ? (
          <>
            <p className="app-page-note">
              Your request is waiting for store staff to approve.
            </p>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="ghost"
                ready={!pending}
                disabled={pending}
                onClick={() => void withdrawRequest()}
              >
                {pending ? 'Withdrawing…' : 'Withdraw request'}
              </OsSheetAction>
            </OsSheetActions>
          </>
        ) : (
          <>
            <label className="guild-field" htmlFor="store-publish-message">
              <span>Note (optional)</span>
              <textarea
                id="store-publish-message"
                rows={3}
                value={message}
                maxLength={280}
                disabled={pending}
                placeholder="What would you publish here?"
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready={!pending}
                disabled={pending}
                onClick={() => void submitRequest()}
              >
                {pending ? 'Requesting…' : 'Request access'}
              </OsSheetAction>
            </OsSheetActions>
          </>
        )}
      </div>
    </section>
  );
}
