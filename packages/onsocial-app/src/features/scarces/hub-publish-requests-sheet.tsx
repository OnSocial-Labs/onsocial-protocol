'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Divider, OsFieldRemove, OsHugSheet } from '@onsocial/ui';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  fetchPublishRequests,
  type PublishAccessRequest,
} from '@/features/scarces/hub-publish-access';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface HubPublishRequestsSheetProps {
  open: boolean;
  appId: string;
  onClose: () => void;
  /** Approve, decline, block, or unblock — refresh badge / parent. */
  onChanged: () => void;
}

type ReviewKind = 'approve' | 'decline' | 'block' | 'unblock';

function formatRequestedWhen(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

/**
 * Staff inbox for hub publish access.
 * Approve grants the creator and clears the row. Decline leaves them able to ask again.
 * Block stops further requests until unblock.
 */
export function HubPublishRequestsSheet({
  open,
  appId,
  onClose,
  onChanged,
}: HubPublishRequestsSheetProps) {
  const [closing, setClosing] = useState(false);
  const [rows, setRows] = useState<PublishAccessRequest[] | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    accountId: string;
    kind: ReviewKind;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const sheetOpen = open && !closing;

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [pending, blocked] = await Promise.all([
        fetchPublishRequests(appId, 'pending'),
        fetchPublishRequests(appId, 'blocked'),
      ]);
      setRows([...pending, ...blocked]);
    } catch (cause) {
      setRows([]);
      setLoadError(
        cause instanceof Error ? cause.message : 'Could not load publish requests'
      );
    }
  }, [appId]);

  useEffect(() => {
    if (!open) return;
    setRows(null);
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

  const review = useCallback(
    async (accountId: string, kind: ReviewKind) => {
      if (pendingAction) return;
      setPendingAction({ accountId, kind });
      const copy = {
        approve: {
          pending: txToastConfirming.updatingAppCreators,
          success: txToastSuccess.appCreatorsUpdated,
          failure: txToastError.updateAppCreatorsFailed,
        },
        decline: {
          pending: txToastConfirming.decliningStoreAccess,
          success: txToastSuccess.storeAccessDeclined,
          failure: txToastError.declineStoreAccessFailed,
        },
        block: {
          pending: txToastConfirming.blockingStoreAccess,
          success: txToastSuccess.storeAccessBlocked,
          failure: txToastError.blockStoreAccessFailed,
        },
        unblock: {
          pending: txToastConfirming.unblockingStoreAccess,
          success: txToastSuccess.storeAccessUnblocked,
          failure: txToastError.unblockStoreAccessFailed,
        },
      }[kind];
      try {
        const { accountId: signer, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(signer, wallet);
        const apps = client.scarces.apps;
        const response =
          kind === 'approve'
            ? await apps.addApprovedCreator(appId, accountId)
            : kind === 'decline'
              ? await apps.declinePublishRequest(appId, accountId)
              : kind === 'block'
                ? await apps.blockPublishRequester(appId, accountId)
                : await apps.unblockPublishRequester(appId, accountId);
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: copy.pending,
          successMessage: copy.success,
          failureMessage: copy.failure,
        });
        if (!confirmed) return;
        onChanged();
        await refresh();
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg: cause instanceof Error ? cause.message : copy.failure,
        });
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction, getSigningWallet, appId, trackTransaction, setTxResult, onChanged, refresh]
  );

  const pending = useMemo(
    () => (rows ?? []).filter((row) => row.status === 'pending'),
    [rows]
  );
  const blocked = useMemo(
    () => (rows ?? []).filter((row) => row.status === 'blocked'),
    [rows]
  );
  const profiles = usePostAuthorProfiles(
    (rows ?? []).map((row) => row.accountId)
  );

  const subtitle =
    rows == null
      ? 'Loading…'
      : pending.length === 0
        ? 'No pending requests'
        : `${pending.length} waiting for approval`;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Publish requests"
      copy={subtitle}
      closeAriaLabel="Close publish requests"
      backdropLabel="Close publish requests"
      zIndex={SHEET_Z.list}
      panelClassName="hub-manage-sheet-panel hub-manage-sheet-panel--hug hub-publish-requests-sheet-panel"
      bodyClassName="hub-manage-sheet-body"
    >
      {loadError ? (
        <p className="hub-manage-hint is-danger">{loadError}</p>
      ) : rows == null ? (
        <p className="hub-manage-hint">Loading…</p>
      ) : (
        <>
          {pending.length === 0 ? (
            <p className="hub-manage-hint">No one is waiting right now.</p>
          ) : (
            <RequestList
              rows={pending}
              profiles={profiles}
              pendingAction={pendingAction}
              onReview={(accountId, kind) => void review(accountId, kind)}
            />
          )}
          {blocked.length > 0 ? (
            <>
              <p className="hub-manage-hint">Blocked</p>
              <RequestList
                rows={blocked}
                profiles={profiles}
                pendingAction={pendingAction}
                onReview={(accountId, kind) => void review(accountId, kind)}
              />
            </>
          ) : null}
        </>
      )}
    </OsHugSheet>
  );
}

function RequestList({
  rows,
  profiles,
  pendingAction,
  onReview,
}: {
  rows: PublishAccessRequest[];
  profiles: ReturnType<typeof usePostAuthorProfiles>;
  pendingAction: { accountId: string; kind: ReviewKind } | null;
  onReview: (accountId: string, kind: ReviewKind) => void;
}) {
  return (
    <div className="standing-list">
      {rows.map((request, index) => {
        const profile = profiles[request.accountId];
        const { label } = standingIdentityLabel(
          request.accountId,
          profile?.displayName
        );
        const when = formatRequestedWhen(request.requestedAtMs);
        const busy = (kind: ReviewKind) =>
          pendingAction?.accountId === request.accountId &&
          pendingAction.kind === kind;
        const blocked = request.status === 'blocked';
        return (
          <div key={request.accountId}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row">
              <Link
                href={portfolioPath(request.accountId)}
                className="standing-row-main"
                scroll={false}
              >
                <StandingIdentity
                  accountId={request.accountId}
                  profileName={profile?.displayName}
                  avatarUrl={profile?.avatarUrl}
                >
                  <span className="standing-row-bio">
                    {request.message ?? 'Wants publishing access'}
                  </span>
                </StandingIdentity>
              </Link>
              <div className="standing-row-aside">
                {when ? <span className="standing-row-time">{when}</span> : null}
                <OsSheetActions
                  layout="row-compact"
                  tone="frosted-primary"
                  size="sm"
                  borderless
                  className="hub-publish-request-actions"
                >
                  {blocked ? (
                    <OsSheetAction
                      type="button"
                      variant="ghost"
                      ready={!pendingAction}
                      pending={busy('unblock')}
                      pendingLabel="Unblocking…"
                      disabled={Boolean(pendingAction)}
                      aria-label={`Unblock ${label}`}
                      onClick={() => onReview(request.accountId, 'unblock')}
                    >
                      Unblock
                    </OsSheetAction>
                  ) : (
                    <>
                      <OsSheetAction
                        type="button"
                        variant="ghost"
                        ready={!pendingAction}
                        pending={busy('block')}
                        pendingLabel="Blocking…"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Block ${label}`}
                        onClick={() => onReview(request.accountId, 'block')}
                      >
                        Block
                      </OsSheetAction>
                      <OsFieldRemove
                        standalone={false}
                        variant="danger"
                        ready={!pendingAction}
                        pending={busy('decline')}
                        pendingLabel="Declining…"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Decline request from ${label}`}
                        onClick={() => onReview(request.accountId, 'decline')}
                      />
                      <OsSheetAction
                        type="button"
                        variant="primary"
                        ready={!pendingAction}
                        pending={busy('approve')}
                        pendingLabel="Approving…"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Approve ${label}`}
                        onClick={() => onReview(request.accountId, 'approve')}
                      >
                        Approve
                      </OsSheetAction>
                    </>
                  )}
                </OsSheetActions>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
