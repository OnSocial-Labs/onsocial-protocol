'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Divider,
  OsFieldRemove,
  OsHugSheet,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import {
  StandingIdentity,
  standingIdentityLabel,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  buildStorePublishDeclinePayload,
  fetchStorePublishDecisions,
  fetchStorePublishRequests,
  filterActionablePublishRequests,
  storeDecisionPath,
  type StorePublishRequest,
} from '@/features/scarces/store-publish-requests';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface HubPublishRequestsSheetProps {
  open: boolean;
  appId: string;
  /** Already-approved creators — hide their pending social notes after grant. */
  approvedCreatorIds: readonly string[];
  onClose: () => void;
  /** Approve or decline — refresh badge / parent. */
  onChanged: () => void;
}

function formatRequestedWhen(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

/**
 * Staff inbox for hub publish access — standing-style rows.
 * Approve → on-chain grant. Decline → staff-owned social decision note.
 */
export function HubPublishRequestsSheet({
  open,
  appId,
  approvedCreatorIds,
  onClose,
  onChanged,
}: HubPublishRequestsSheetProps) {
  const [closing, setClosing] = useState(false);
  const [inbox, setInbox] = useState<StorePublishRequest[] | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    requesterId: string;
    kind: 'approve' | 'decline';
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { getSigningWallet } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const sheetOpen = open && !closing;

  const approvedKey = useMemo(
    () =>
      approvedCreatorIds
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|'),
    [approvedCreatorIds]
  );

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [rows, decisions] = await Promise.all([
        fetchStorePublishRequests(appId),
        fetchStorePublishDecisions(appId),
      ]);
      const approved = approvedKey ? approvedKey.split('|') : ([] as string[]);
      setInbox(filterActionablePublishRequests(rows, approved, decisions));
    } catch (cause) {
      setInbox([]);
      setLoadError(
        cause instanceof Error
          ? cause.message
          : 'Could not load publish requests'
      );
    }
  }, [appId, approvedKey]);

  useEffect(() => {
    if (!open) return;
    setInbox(null);
    void refresh();
  }, [open, refresh]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const approveRequest = useCallback(
    async (requesterId: string) => {
      if (pendingAction) return;
      setPendingAction({ requesterId, kind: 'approve' });
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
        onChanged();
        await refresh();
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
        setPendingAction(null);
      }
    },
    [
      pendingAction,
      getSigningWallet,
      appId,
      trackTransaction,
      setTxResult,
      onChanged,
      refresh,
    ]
  );

  const declineRequest = useCallback(
    async (request: StorePublishRequest) => {
      if (pendingAction) return;
      setPendingAction({
        requesterId: request.requesterId,
        kind: 'decline',
      });
      try {
        const { client } = await getClient();
        const response = await client.social.set(
          storeDecisionPath(appId, request.requesterId),
          buildStorePublishDeclinePayload({
            appId,
            requesterId: request.requesterId,
            requestRequestedAt: request.requestedAt,
          })
        );
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.decliningStoreAccess,
          successMessage: txToastSuccess.storeAccessDeclined,
          failureMessage: txToastError.declineStoreAccessFailed,
        });
        if (!confirmed) return;
        onChanged();
        await refresh();
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.declineStoreAccessFailed,
        });
      } finally {
        setPendingAction(null);
      }
    },
    [
      pendingAction,
      getClient,
      appId,
      trackTransaction,
      setTxResult,
      onChanged,
      refresh,
    ]
  );

  const requesterIds = useMemo(
    () => (inbox ?? []).map((row) => row.requesterId),
    [inbox]
  );
  const profiles = usePostAuthorProfiles(requesterIds);

  const subtitle =
    inbox == null
      ? 'Loading…'
      : inbox.length === 0
        ? 'No pending requests'
        : `${inbox.length} waiting for approval`;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Publish requests"
      copy={subtitle}
      closeAriaLabel="Close publish requests"
      backdropLabel="Close publish requests"
      zIndex={58}
      initialDetent="peek"
      peekRatio={1}
      panelClassName="hub-manage-sheet-panel hub-manage-sheet-panel--hug hub-publish-requests-sheet-panel"
      bodyClassName="hub-manage-sheet-body"
    >
      {loadError ? (
        <p className="hub-manage-hint is-danger">{loadError}</p>
      ) : inbox == null ? (
        <p className="hub-manage-hint">Loading…</p>
      ) : inbox.length === 0 ? (
        <p className="hub-manage-hint">No one is waiting right now.</p>
      ) : (
        <div className="standing-list">
          {inbox.map((request, index) => {
            const profile = profiles[request.requesterId];
            const { label } = standingIdentityLabel(
              request.requesterId,
              profile?.displayName
            );
            const when = formatRequestedWhen(request.requestedAt);
            const busyApprove =
              pendingAction?.requesterId === request.requesterId &&
              pendingAction.kind === 'approve';
            const busyDecline =
              pendingAction?.requesterId === request.requesterId &&
              pendingAction.kind === 'decline';
            return (
              <div key={request.requesterId}>
                {index > 0 ? <Divider variant="item" /> : null}
                <div className="standing-row">
                  <Link
                    href={portfolioPath(request.requesterId)}
                    className="standing-row-main"
                    scroll={false}
                  >
                    <StandingIdentity
                      accountId={request.requesterId}
                      profileName={profile?.displayName}
                      avatarUrl={profile?.avatarUrl}
                    >
                      <span className="standing-row-bio">
                        {request.message
                          ? request.message
                          : 'Wants publishing access'}
                      </span>
                    </StandingIdentity>
                  </Link>
                  <div className="standing-row-aside">
                    {when ? (
                      <span className="standing-row-time">{when}</span>
                    ) : null}
                    <OsSheetActions
                      layout="row-compact"
                      tone="frosted-primary"
                      borderless
                      className="hub-publish-request-actions"
                    >
                      <OsFieldRemove
                        standalone={false}
                        variant="danger"
                        ready={!pendingAction}
                        pending={busyDecline}
                        pendingLabel="Declining…"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Decline request from ${label}`}
                        onClick={() => void declineRequest(request)}
                      />
                      <OsSheetAction
                        type="button"
                        variant="primary"
                        ready={!pendingAction}
                        pending={busyApprove}
                        pendingLabel="Approving…"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Approve ${label}`}
                        onClick={() => void approveRequest(request.requesterId)}
                      >
                        Approve
                      </OsSheetAction>
                    </OsSheetActions>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </OsHugSheet>
  );
}
