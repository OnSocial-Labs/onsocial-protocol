'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  MultiplyIcon,
  ProfileAvatar,
  SheetHeader,
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
  fetchCollectionRedeemers,
  MAX_COLLECTION_REDEEMERS,
} from '@/features/scarces/ticket-redeemers';
import type { PassStaffVoice } from '@/features/scarces/ticket-pass-payload';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { accountIdsEqual } from '@/lib/account-match';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/**
 * Creator Door staff manager — add/remove redeemers (max 20).
 * Compact GlassSheet; same commerce chrome as other drop tools.
 */
export function CollectionDoorStaffManager({
  collectionId,
  creatorId,
}: {
  collectionId: string;
  creatorId: string;
}) {
  const titleId = useId();
  const { isConnected, accountId, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [redeemers, setRedeemers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setDraft('');
      setLoadError(null);
    }
  }

  const sheetOpen = open && !closing;
  useScrollLock(sheetOpen);

  const isCreator =
    Boolean(accountId) && accountIdsEqual(accountId!, creatorId);

  const refresh = useCallback(async () => {
    const roster = await fetchCollectionRedeemers(collectionId);
    if (!roster) {
      setLoadError('Could not load door staff.');
      setRedeemers([]);
      return;
    }
    setLoadError(null);
    setRedeemers(roster.redeemers);
  }, [collectionId]);

  useEffect(() => {
    if (!sheetOpen) return;
    void refresh();
  }, [refresh, sheetOpen]);

  const profiles = usePostAuthorProfiles(redeemers);

  const requestClose = useCallback(() => setClosing(true), []);
  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  const runStaffTx = useCallback(
    async (kind: 'add' | 'remove', target: string) => {
      if (!isConnected || !isCreator || pending) return;
      const account = target.trim().toLowerCase();
      if (!account) return;
      setPending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const os = createAppScarcesWalletClient(signerId, wallet);
        const response =
          kind === 'add'
            ? await os.scarces.collections.addRedeemer(collectionId, account)
            : await os.scarces.collections.removeRedeemer(collectionId, account);
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage:
            kind === 'add'
              ? txToastConfirming.addingDoorStaff
              : txToastConfirming.removingDoorStaff,
          successMessage:
            kind === 'add'
              ? txToastSuccess.doorStaffAdded
              : txToastSuccess.doorStaffRemoved,
          failureMessage:
            kind === 'add'
              ? txToastError.addDoorStaffFailed
              : txToastError.removeDoorStaffFailed,
        });
        if (confirmed) {
          setDraft('');
          await refresh();
        }
      } catch (error) {
        if (isWalletUserCancellation(error)) return;
        setTxResult({
          type: 'error',
          msg:
            error instanceof Error
              ? error.message
              : kind === 'add'
                ? txToastError.addDoorStaffFailed
                : txToastError.removeDoorStaffFailed,
        });
      } finally {
        setPending(false);
      }
    },
    [
      collectionId,
      getSigningWallet,
      isConnected,
      isCreator,
      pending,
      refresh,
      setTxResult,
      trackTransaction,
    ]
  );

  if (!isCreator) return null;

  const atCap = redeemers.length >= MAX_COLLECTION_REDEEMERS;
  const draftNormalized = draft.trim().toLowerCase();
  const canAdd =
    Boolean(draftNormalized) &&
    !atCap &&
    !pending &&
    !redeemers.some((id) => accountIdsEqual(id, draftNormalized)) &&
    !accountIdsEqual(draftNormalized, creatorId);

  return (
    <div className="collection-door-staff">
      <div className="collection-reading-row">
        <p className="collection-section-label">Door staff</p>
        <button
          type="button"
          className="collection-reading-open"
          onClick={() => setOpen(true)}
        >
          {redeemers.length > 0
            ? `${redeemers.length} · Manage`
            : 'Manage'}
        </button>
      </div>

      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        tone="os"
        initialDetent="full"
        peekRatio={1}
        zIndex={88}
        ariaLabelledBy={titleId}
        backdropLabel="Close door staff"
        panelClassName="scarce-commerce-sheet-panel"
        bodyClassName="scarce-commerce-sheet-body"
        header={
          <>
            <SheetHeader
              titleId={titleId}
              title="Door staff"
              subtitle="Who can Admit at the door"
              onClose={requestClose}
              closeAriaLabel="Close door staff"
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
      >
        <div className="ticket-door-staff">
          <p className="ticket-door-lead">
            Add up to {MAX_COLLECTION_REDEEMERS} wallets that can check in
            passes. You always can.
          </p>

          <label className="ticket-door-field">
            <span className="ticket-door-field-label">Account</span>
            <input
              className="ticket-door-input"
              value={draft}
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="alice.near"
              disabled={pending || atCap}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (canAdd) void runStaffTx('add', draftNormalized);
                }
              }}
            />
          </label>

          <OsSheetActions layout="stack" tone="frosted-primary">
            <OsSheetAction
              type="button"
              variant="primary"
              ready={canAdd}
              pending={pending}
              onClick={() => {
                void runStaffTx('add', draftNormalized);
              }}
            >
              {atCap ? 'Staff full' : pending ? 'Adding…' : 'Add staff'}
            </OsSheetAction>
          </OsSheetActions>

          {loadError ? (
            <p className="ticket-door-error" role="alert">
              {loadError}
            </p>
          ) : null}

          {redeemers.length > 0 ? (
            <ul className="ticket-door-staff-list">
              {redeemers.map((account) => {
                const face = profiles[account];
                const name = displayName(
                  account,
                  face?.displayName || undefined
                );
                return (
                  <li key={account} className="ticket-door-staff-row">
                    <ProfileAvatar
                      src={face?.avatarUrl ?? null}
                      fallbackInitial={name}
                      size="sm"
                    />
                    <div className="ticket-door-staff-copy">
                      <p className="ticket-door-staff-name">{name}</p>
                      <p className="ticket-door-staff-handle">
                        @{fallbackLabel(account)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ticket-door-staff-remove"
                      aria-label={`Remove ${fallbackLabel(account)}`}
                      disabled={pending}
                      onClick={() => {
                        void runStaffTx('remove', account);
                      }}
                    >
                      <MultiplyIcon aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ticket-door-hint">No door staff yet.</p>
          )}
        </div>
      </GlassSheet>
    </div>
  );
}
