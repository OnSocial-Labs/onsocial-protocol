'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  buildStorePublishRequestPayload,
  fetchMyStorePublishRequest,
  fetchStorePublishRequests,
  storeRequestPath,
  type StorePublishRequest,
} from '@/features/scarces/store-publish-requests';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function StorePublishRequestSection({
  appId,
  canRequest,
  canReview,
  isApprovedCreator,
  onApproved,
}: {
  appId: string;
  /** Connected viewer who cannot create yet (approval / invite modes). */
  canRequest: boolean;
  /** Owner or moderator inbox. */
  canReview: boolean;
  isApprovedCreator: boolean;
  onApproved: () => void;
}) {
  const { accountId, getSigningWallet } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [mine, setMine] = useState<StorePublishRequest | null>(null);
  const [inbox, setInbox] = useState<StorePublishRequest[]>([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (canRequest && accountId) {
      void fetchMyStorePublishRequest(appId, accountId).then((row) => {
        if (!cancelled) setMine(row);
      });
    } else {
      setMine(null);
    }
    if (canReview) {
      void fetchStorePublishRequests(appId).then((rows) => {
        if (!cancelled) {
          setInbox(rows.filter((row) => row.status === 'pending'));
        }
      });
    } else {
      setInbox([]);
    }
    return () => {
      cancelled = true;
    };
  }, [appId, accountId, canRequest, canReview, refreshKey]);

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

  const approveRequest = useCallback(
    async (requesterId: string) => {
      if (pending) return;
      setPending(true);
      try {
        const { accountId: signer, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(signer, wallet);
        const response = await client.scarces.apps.addApprovedCreator(
          appId,
          requesterId
        );
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.updatingAppCreators,
          successMessage: txToastSuccess.appCreatorsUpdated,
          failureMessage: txToastError.updateAppCreatorsFailed,
        });
        if (!confirmed) return;
        onApproved();
        setRefreshKey((k) => k + 1);
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.updateAppCreatorsFailed,
        });
      } finally {
        setPending(false);
      }
    },
    [
      pending,
      getSigningWallet,
      appId,
      trackTransaction,
      setTxResult,
      onApproved,
    ]
  );

  if (!canRequest && !canReview) return null;

  return (
    <section className="app-publish-requests" aria-label="Publishing access">
      {canRequest && !isApprovedCreator ? (
        <div className="app-publish-request-form">
          <h3 className="market-section-title">Request publishing access</h3>
          {mine?.status === 'pending' ? (
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
      ) : null}

      {canReview ? (
        <div className="app-publish-inbox">
          <h3 className="market-section-title">
            Publish requests
            {inbox.length > 0 ? ` · ${inbox.length}` : ''}
          </h3>
          {inbox.length === 0 ? (
            <p className="app-page-note">No pending requests.</p>
          ) : (
            <ul className="app-publish-inbox-list">
              {inbox.map((request) => (
                <li key={request.requesterId} className="app-publish-inbox-row">
                  <div>
                    <Link
                      href={portfolioPath(request.requesterId)}
                      scroll={false}
                      className="app-page-roster-chip"
                    >
                      @{fallbackLabel(request.requesterId)}
                    </Link>
                    {request.message ? (
                      <p className="app-page-note">{request.message}</p>
                    ) : null}
                  </div>
                  <OsSheetActions
                    layout="stack"
                    tone="frosted-primary"
                    borderless
                  >
                    <OsSheetAction
                      type="button"
                      variant="primary"
                      ready={!pending}
                      disabled={pending}
                      onClick={() => void approveRequest(request.requesterId)}
                    >
                      Approve
                    </OsSheetAction>
                  </OsSheetActions>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
