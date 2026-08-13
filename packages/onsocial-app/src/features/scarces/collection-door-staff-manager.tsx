'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Divider,
  MultiplyIcon,
  OsHugSheet,
  ProfileAvatar,
  SearchField,
  UserPlusIcon,
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
import { accountIdsEqual } from '@/lib/account-match';
import {
  fetchDiscoverProfiles,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import {
  PROFILE_SEARCH_MAX_QUERY_LENGTH,
  PROFILE_SEARCH_MIN_QUERY_LENGTH,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const SEARCH_DEBOUNCE_MS = 220;

function sortedAccountKey(accounts: string[]): string {
  return [...accounts]
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('\0');
}

function StaffStandingIdentity({
  accountId,
  profileName,
  avatarUrl,
}: {
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
}) {
  const handle = fallbackLabel(accountId);
  const name = profileName?.trim() || null;
  const label = name || `@${handle}`;
  return (
    <>
      <ProfileAvatar
        src={avatarUrl ?? null}
        fallbackInitial={name || accountId}
        size="lg"
        className="standing-row-avatar-slot"
      />
      <span className="standing-row-copy">
        <span className="standing-row-head">
          <span className="standing-row-name-row">
            <span className="standing-row-name">{label}</span>
          </span>
          {name ? <span className="standing-row-handle">@{handle}</span> : null}
        </span>
      </span>
    </>
  );
}

function saveStaffLabel(count: number, pending: boolean): string {
  if (pending) return 'Saving…';
  if (count === 0) return 'Clear staff';
  if (count === 1) return 'Save 1 account';
  return `Save ${count} accounts`;
}

/**
 * Creator Door / redeem staff manager — draft roster, one wallet confirm.
 * Search + chips match royalty split / allowlist pickers.
 */
export function CollectionDoorStaffManager({
  collectionId,
  creatorId,
  voice = 'admit',
}: {
  collectionId: string;
  creatorId: string;
  voice?: PassStaffVoice;
}) {
  const { isConnected, accountId, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  /** Last confirmed on-chain roster (for the Manage button + dirty check). */
  const [saved, setSaved] = useState<string[]>([]);
  /** Editable draft while the sheet is open. */
  const [draft, setDraft] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [searchProfiles, setSearchProfiles] = useState<
    DiscoverProfileSummary[]
  >([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [draftFaces, setDraftFaces] = useState<
    Record<string, { name: string | null; avatarUrl: string | null }>
  >({});
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** True after a successful roster fetch while the sheet is open. */
  const [rosterReady, setRosterReady] = useState(false);
  const draftRef = useRef(draft);
  const savedRef = useRef(saved);
  draftRef.current = draft;
  savedRef.current = saved;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setQuery('');
      setSearchProfiles([]);
      setSearchPending(false);
      setSearchError(null);
      setLoadError(null);
      setRosterReady(false);
      setDraft(saved);
    }
  }

  const sheetOpen = open && !closing;
  const isCreator =
    Boolean(accountId) && accountIdsEqual(accountId!, creatorId);

  const refresh = useCallback(async () => {
    const roster = await fetchCollectionRedeemers(collectionId);
    if (!roster) {
      setLoadError('Could not load door staff.');
      // Keep last-known saved/draft — never clear into an empty replace.
      setRosterReady(false);
      return;
    }
    setLoadError(null);
    const wasDirty =
      sortedAccountKey(draftRef.current) !==
      sortedAccountKey(savedRef.current);
    setSaved(roster.redeemers);
    if (!wasDirty) setDraft(roster.redeemers);
    setRosterReady(true);
  }, [collectionId]);

  useEffect(() => {
    if (!isCreator) return;
    void fetchCollectionRedeemers(collectionId).then((roster) => {
      if (!roster) return;
      setSaved(roster.redeemers);
    });
  }, [collectionId, isCreator]);

  useEffect(() => {
    if (!sheetOpen) return;
    void refresh();
  }, [refresh, sheetOpen]);

  const profileIds = useMemo(
    () => Array.from(new Set([...saved, ...draft])),
    [draft, saved]
  );
  const profiles = usePostAuthorProfiles(profileIds);

  const normalizedQuery = normalizeProfileSearchQuery(query);
  const searchActive =
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!sheetOpen || !searchActive) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchPending(true);
      setSearchError(null);
      void fetchDiscoverProfiles(
        normalizedQuery,
        accountId ?? null,
        0,
        controller.signal
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          setSearchProfiles(response.profiles);
          setSearchPending(false);
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setSearchProfiles([]);
          setSearchPending(false);
          setSearchError(
            cause instanceof Error ? cause.message : 'Search failed.'
          );
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accountId, normalizedQuery, searchActive, sheetOpen]);

  const requestClose = useCallback(() => setClosing(true), []);
  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  const isDraftStaff = useCallback(
    (target: string) =>
      draft.some((id) => accountIdsEqual(id, target)) ||
      accountIdsEqual(target, creatorId),
    [creatorId, draft]
  );

  const addToDraft = useCallback(
    (profile: DiscoverProfileSummary) => {
      if (pending) return;
      const account = profile.accountId.trim().toLowerCase();
      if (!account || isDraftStaff(account)) return;
      if (draft.length >= MAX_COLLECTION_REDEEMERS) return;
      setDraft((prev) => [...prev, account]);
      setDraftFaces((prev) => ({
        ...prev,
        [account]: {
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        },
      }));
      setQuery('');
      setSearchProfiles([]);
      setSearchError(null);
    },
    [draft.length, isDraftStaff, pending]
  );

  const removeFromDraft = useCallback(
    (account: string) => {
      if (pending) return;
      setDraft((prev) => prev.filter((id) => !accountIdsEqual(id, account)));
    },
    [pending]
  );

  const dirty = sortedAccountKey(draft) !== sortedAccountKey(saved);

  const handleSave = useCallback(async () => {
    if (!isConnected || !isCreator || pending || !dirty || !rosterReady) return;
    setPending(true);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const os = createAppScarcesWalletClient(signerId, wallet);
      const response = await os.scarces.collections.setRedeemers(
        collectionId,
        draft
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.updatingDoorStaff,
        successMessage: txToastSuccess.doorStaffUpdated,
        failureMessage: txToastError.updateDoorStaffFailed,
      });
      if (confirmed) {
        setSaved(draft);
        setQuery('');
        setSearchProfiles([]);
        setSearchError(null);
        requestClose();
      }
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.updateDoorStaffFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    collectionId,
    dirty,
    draft,
    getSigningWallet,
    isConnected,
    isCreator,
    pending,
    requestClose,
    rosterReady,
    setTxResult,
    trackTransaction,
  ]);

  const visibleSearchProfiles = useMemo(
    () => searchProfiles.filter((profile) => !isDraftStaff(profile.accountId)),
    [isDraftStaff, searchProfiles]
  );

  if (!isCreator) return null;

  const atCap = draft.length >= MAX_COLLECTION_REDEEMERS;
  const staffNoun = voice === 'redeem' ? 'redeem staff' : 'door staff';
  const canSave =
    dirty && isConnected && !pending && rosterReady && !loadError;

  return (
    <div className="collection-door-staff">
      <div className="collection-reading-row">
        <p className="collection-section-label">Door staff</p>
        <button
          type="button"
          className="collection-reading-open"
          onClick={() => setOpen(true)}
        >
          {saved.length > 0 ? `${saved.length} · Manage` : 'Manage'}
        </button>
      </div>

      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label={voice === 'redeem' ? 'Redeem staff' : 'Door staff'}
        copy={
          voice === 'redeem'
            ? 'Who can Redeem at the counter'
            : 'Who can Admit at the door'
        }
        closeAriaLabel={
          voice === 'redeem' ? 'Close redeem staff' : 'Close door staff'
        }
        backdropLabel={
          voice === 'redeem' ? 'Close redeem staff' : 'Close door staff'
        }
        zIndex={88}
        panelClassName="scarce-commerce-sheet-panel collection-allowlist-sheet-panel"
        bodyClassName="scarce-commerce-sheet-body collection-allowlist-sheet-body"
        footer={
          <div className="guild-add-member-footer">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready={canSave}
                disabled={!canSave}
                pending={pending}
                pendingLabel="Saving…"
                onClick={() => {
                  void handleSave();
                }}
              >
                {saveStaffLabel(draft.length, pending)}
              </OsSheetAction>
            </OsSheetActions>
          </div>
        }
      >
        <div className="ticket-door-staff collection-allowlist-sheet guild-add-member-sheet">
          <p className="ticket-door-lead">
            {voice === 'redeem'
              ? `Add up to ${MAX_COLLECTION_REDEEMERS} wallets that can redeem coupons. You always can.`
              : `Add up to ${MAX_COLLECTION_REDEEMERS} wallets that can check in passes. You always can.`}
          </p>

          <SearchField
            value={query}
            onValueChange={(next) => {
              if (pending || atCap) return;
              setQuery(next);
              const normalized = normalizeProfileSearchQuery(next);
              if (normalized.length < PROFILE_SEARCH_MIN_QUERY_LENGTH) {
                setSearchProfiles([]);
                setSearchPending(false);
                setSearchError(null);
              }
            }}
            placeholder="Search profiles"
            ariaLabel={
              voice === 'redeem' ? 'Search redeem staff' : 'Search door staff'
            }
            maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
            clearAriaLabel="Clear staff search"
            chrome="sheet"
            className="collection-allowlist-search"
            autoFocus
          />

          {loadError ? (
            <p className="ticket-door-error" role="alert">
              {loadError}
            </p>
          ) : null}

          {draft.length > 0 ? (
            <div className="collection-allowlist-section">
              <div className="collection-allowlist-members-head">
                <p className="collection-allowlist-section-label">
                  Staff · {draft.length}
                </p>
                {draft.length > 0 ? (
                  <button
                    type="button"
                    className="collection-allowlist-text-btn"
                    disabled={pending}
                    onClick={() => setDraft([])}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <ul className="collection-allowlist-selected">
                {draft.map((account) => {
                  const face = profiles[account];
                  const snap = draftFaces[account];
                  const name = displayName(
                    account,
                    face?.displayName || snap?.name || undefined
                  );
                  return (
                    <li key={account} className="collection-allowlist-chip">
                      <span className="collection-allowlist-chip-main">
                        <ProfileAvatar
                          src={face?.avatarUrl ?? snap?.avatarUrl ?? null}
                          fallbackInitial={name}
                          size="sm"
                          className="collection-allowlist-chip-avatar"
                        />
                        <span className="collection-allowlist-chip-label">
                          @{fallbackLabel(account)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="collection-allowlist-chip-remove"
                        disabled={pending}
                        aria-label={`Remove @${fallbackLabel(account)}`}
                        onClick={() => removeFromDraft(account)}
                      >
                        <MultiplyIcon
                          aria-hidden
                          className="collection-allowlist-chip-remove-icon"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="ticket-door-hint">No {staffNoun} yet.</p>
          )}

          {searchActive ? (
            <div className="collection-allowlist-section">
              {searchPending && searchProfiles.length === 0 ? (
                <p className="guild-add-member-hint">Searching…</p>
              ) : null}
              {searchError ? (
                <p className="guild-form-error" role="alert">
                  {searchError}
                </p>
              ) : null}
              {!searchPending && searchProfiles.length === 0 && !searchError ? (
                <p className="guild-add-member-hint">No profiles found.</p>
              ) : null}
              {!searchPending &&
              searchProfiles.length > 0 &&
              visibleSearchProfiles.length === 0 &&
              !searchError ? (
                <p className="guild-add-member-hint">
                  Already on staff — keep typing to find more.
                </p>
              ) : null}
              {visibleSearchProfiles.length > 0 ? (
                <div
                  className="standing-list guild-add-member-results"
                  role="listbox"
                  aria-label="Search results"
                >
                  {visibleSearchProfiles.map((profile, index) => (
                    <div key={profile.accountId}>
                      {index > 0 ? <Divider variant="item" /> : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="guild-add-member-result"
                        disabled={pending || atCap}
                        onClick={() => addToDraft(profile)}
                      >
                        <StaffStandingIdentity
                          accountId={profile.accountId}
                          profileName={profile.name}
                          avatarUrl={profile.avatarUrl}
                        />
                        <UserPlusIcon
                          aria-hidden
                          className="collection-allowlist-row-add"
                        />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="guild-add-member-hint">
              {atCap
                ? `Maximum ${MAX_COLLECTION_REDEEMERS} staff.`
                : 'Search profiles to add staff.'}
            </p>
          )}
        </div>
      </OsHugSheet>
    </div>
  );
}
