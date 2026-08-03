'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Divider,
  GlassSheet,
  MultiplyIcon,
  ProfileAvatar,
  SheetCloseButton,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
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
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
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
 * Staff inbox for hub publish access — GlassSheet, standing-style rows.
 * Approve → on-chain grant. Decline → staff-owned social decision note.
 */
export function HubPublishRequestsSheet({
  open,
  appId,
  approvedCreatorIds,
  onClose,
  onChanged,
}: HubPublishRequestsSheetProps) {
  const titleId = useId();
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

  useScrollLock(open || closing);

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

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="peek"
      peekRatio={1}
      zIndex={58}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close publish requests"
      panelClassName="hub-manage-sheet-panel hub-manage-sheet-panel--hug hub-publish-requests-sheet-panel"
      bodyClassName="hub-manage-sheet-body"
      header={
        <>
          <div className="standing-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Publish requests
                  </h2>
                  <p className="discover-sheet-subtitle">
                    {inbox == null
                      ? 'Loading…'
                      : inbox.length === 0
                        ? 'No pending requests'
                        : `${inbox.length} waiting for approval`}
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel="Close publish requests"
                />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
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
            const name = profile?.displayName?.trim() || null;
            const label = name || `@${fallbackLabel(request.requesterId)}`;
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
                    <ProfileAvatar
                      src={profile?.avatarUrl ?? null}
                      fallbackInitial={name || request.requesterId}
                      size="lg"
                      className="standing-row-avatar-slot"
                    />
                    <div className="standing-row-copy">
                      <span className="standing-row-head">
                        <span className="standing-row-name-row">
                          <span className="standing-row-name">{label}</span>
                        </span>
                        {name ? (
                          <span className="standing-row-handle">
                            @{fallbackLabel(request.requesterId)}
                          </span>
                        ) : null}
                      </span>
                      {request.message ? (
                        <span className="standing-row-bio">
                          {request.message}
                        </span>
                      ) : (
                        <span className="standing-row-bio">
                          Wants publishing access
                        </span>
                      )}
                    </div>
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
                      <OsSheetAction
                        type="button"
                        variant="danger"
                        ready={!pendingAction}
                        pending={busyDecline}
                        pendingLabel="Declining…"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Decline request from ${label}`}
                        className="hub-publish-request-dismiss"
                        onClick={() => void declineRequest(request)}
                      >
                        <MultiplyIcon
                          className="hub-publish-request-dismiss-icon"
                          aria-hidden
                        />
                      </OsSheetAction>
                      <OsSheetAction
                        type="button"
                        variant="primary"
                        ready={!pendingAction}
                        pending={busyApprove}
                        pendingLabel="Approving…"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Approve ${label}`}
                        onClick={() =>
                          void approveRequest(request.requesterId)
                        }
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
    </GlassSheet>
  );
}
