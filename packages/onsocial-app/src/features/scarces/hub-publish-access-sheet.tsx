'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
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
import { useScrollLock } from '@/hooks/use-scroll-lock';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface HubPublishAccessSheetProps {
  open: boolean;
  appId: string;
  onClose: () => void;
  /** Refresh hero Request / Pending after submit or withdraw. */
  onChanged?: () => void;
}

/**
 * Requester publish-access drawer — opened from dock stars on approval hubs
 * when the viewer is not an approved creator yet.
 */
export function HubPublishAccessSheet({
  open,
  appId,
  onClose,
  onChanged,
}: HubPublishAccessSheetProps) {
  const titleId = useId();
  const messageId = useId();
  const { accountId } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [mine, setMine] = useState<StorePublishRequest | null>(null);
  const [decision, setDecision] = useState<StorePublishDecision | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const sheetOpen = open && !closing;

  useScrollLock(open || closing);

  useEffect(() => {
    if (!open) {
      setClosing(false);
      setLoaded(false);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !accountId) {
      setMine(null);
      setDecision(null);
      return;
    }
    setLoaded(false);
    void Promise.all([
      fetchMyStorePublishRequest(appId, accountId),
      fetchMyStorePublishDecision(appId, accountId),
    ]).then(([row, dec]) => {
      if (cancelled) return;
      setMine(row);
      setDecision(dec);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, appId, accountId, refreshKey]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

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
      const response = await client.social.set(
        storeRequestPath(appId),
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
      onChanged?.();
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
    onChanged,
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
      onChanged?.();
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
  }, [
    accountId,
    pending,
    getClient,
    appId,
    trackTransaction,
    setTxResult,
    onChanged,
  ]);

  const subtitle = !loaded
    ? 'Loading…'
    : declined
      ? 'Last request declined — send a new one'
      : mine?.status === 'pending'
        ? 'Waiting for hub staff'
        : 'Ask to publish drops in this hub';

  const noteField = (
    <label className="guild-field" htmlFor={messageId}>
      <span>Note (optional)</span>
      <textarea
        id={messageId}
        rows={3}
        value={message}
        maxLength={280}
        disabled={pending}
        placeholder="What would you publish here?"
        aria-describedby={`${messageId}-count`}
        onChange={(event) => setMessage(event.target.value)}
        onBlur={() => {
          const trimmed = message.trim();
          if (trimmed !== message) setMessage(trimmed);
        }}
      />
      <small id={`${messageId}-count`}>{message.length}/280</small>
    </label>
  );

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      sizing="hug"
      initialDetent="peek"
      peekRatio={1}
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close publish access"
      panelClassName="hub-manage-sheet-panel hub-manage-sheet-panel--hug hub-publish-access-sheet-panel"
      bodyClassName="hub-manage-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Publish access"
            subtitle={subtitle}
            onClose={requestClose}
            closeAriaLabel="Close publish access"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {!loaded ? (
        <p className="hub-manage-hint">Loading…</p>
      ) : declined ? (
        <div className="hub-manage-form">
          {noteField}
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
        </div>
      ) : mine?.status === 'pending' ? (
        <div className="hub-manage-form">
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
        </div>
      ) : (
        <div className="hub-manage-form">
          {noteField}
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
        </div>
      )}
    </GlassSheet>
  );
}
