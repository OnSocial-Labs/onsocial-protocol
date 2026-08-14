'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Divider,
  MultiplyIcon,
  OsFieldRemove,
  OsHugSheet,
  ProfileAvatar,
  SearchField,
  UserPlusIcon,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import { CollectionQtyStepper } from '@/components/ui/collection-qty-stepper';
import { StandingIdentity } from '@/components/ui/standing-identity';
import {
  equalizeRoyaltyShares,
  formatRoyaltyPercent,
  MAX_ROYALTY_RECIPIENTS,
  setRoyaltySharePercent,
  validateRoyaltyShares,
  type RoyaltySplitShare,
} from '@/features/scarces/scarce-royalty';
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

const SEARCH_DEBOUNCE_MS = 220;

interface FaceCache {
  name: string;
  avatarUrl: string | null;
}

interface ScarceRoyaltySplitSheetProps {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  totalBps: number;
  primaryAccountId: string;
  shares: RoyaltySplitShare[];
  onSharesChange: (next: RoyaltySplitShare[]) => void;
  pending?: boolean;
  zIndex?: number;
}

/**
 * Hug sheet to split the resale royalty cut across up to 10 accounts.
 * Shares are percents of the cut (must sum to 100%), not of the sale.
 */
export function ScarceRoyaltySplitSheet({
  open,
  onClose,
  onClosed,
  totalBps,
  primaryAccountId,
  shares,
  onSharesChange,
  pending = false,
  zIndex = 60,
}: ScarceRoyaltySplitSheetProps) {
  const editTitleId = useId();
  const [draft, setDraft] = useState<RoyaltySplitShare[]>(shares);
  const [query, setQuery] = useState('');
  const [searchProfiles, setSearchProfiles] = useState<
    DiscoverProfileSummary[]
  >([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [faceCache, setFaceCache] = useState<Record<string, FaceCache>>({});
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);


  const accountIds = useMemo(
    () => draft.map((share) => share.accountId),
    [draft]
  );
  const profiles = usePostAuthorProfiles(accountIds);

  const shareError = validateRoyaltyShares(draft);
  const canSave = shareError == null && !pending;

  const normalizedQuery = normalizeProfileSearchQuery(query);
  const searchActive =
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!open || !searchActive) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchPending(true);
      setSearchError(null);
      void fetchDiscoverProfiles(
        normalizedQuery,
        primaryAccountId || null,
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
  }, [normalizedQuery, open, primaryAccountId, searchActive]);

  const rememberFace = useCallback(
    (
      accountId: string,
      face?: { name?: string | null; avatarUrl?: string | null }
    ) => {
      const name =
        face?.name?.trim() ||
        profiles[accountId]?.displayName?.trim() ||
        fallbackLabel(accountId);
      const avatarUrl =
        face?.avatarUrl ?? profiles[accountId]?.avatarUrl ?? null;
      setFaceCache((prev) => ({
        ...prev,
        [accountId]: { name, avatarUrl },
      }));
    },
    [profiles]
  );

  const faceFor = useCallback(
    (accountId: string) => {
      const cached = faceCache[accountId];
      const profile = profiles[accountId];
      return {
        name:
          cached?.name ||
          profile?.displayName?.trim() ||
          displayName(accountId, profile?.displayName) ||
          fallbackLabel(accountId),
        avatarUrl: cached?.avatarUrl ?? profile?.avatarUrl ?? null,
      };
    },
    [faceCache, profiles]
  );

  const isSelected = useCallback(
    (accountId: string) =>
      draft.some((share) => accountIdsEqual(share.accountId, accountId)),
    [draft]
  );

  const addAccount = useCallback(
    (
      accountId: string,
      face?: { name?: string | null; avatarUrl?: string | null }
    ) => {
      const id = accountId.trim();
      if (!id || isSelected(id) || pending) return;
      if (draft.length >= MAX_ROYALTY_RECIPIENTS) return;
      rememberFace(id, face);
      setDraft(equalizeRoyaltyShares([...draft.map((s) => s.accountId), id]));
      setQuery('');
      setSearchProfiles([]);
    },
    [draft, isSelected, pending, rememberFace]
  );

  const removeAccount = useCallback(
    (accountId: string) => {
      if (pending || draft.length <= 1) return;
      const nextIds = draft
        .map((share) => share.accountId)
        .filter((id) => !accountIdsEqual(id, accountId));
      setDraft(equalizeRoyaltyShares(nextIds));
      setEditingAccountId(null);
      setConfirmingRemove(false);
    },
    [draft, pending]
  );

  const editingShare = editingAccountId
    ? draft.find((share) => accountIdsEqual(share.accountId, editingAccountId))
    : null;
  const editingFace = editingAccountId
    ? { accountId: editingAccountId, ...faceFor(editingAccountId) }
    : null;

  const openEdit = useCallback((accountId: string) => {
    setEditingAccountId(accountId);
    setConfirmingRemove(false);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingAccountId(null);
    setConfirmingRemove(false);
  }, []);

  const setEditPercent = useCallback((accountId: string, percent: number) => {
    setDraft((prev) => setRoyaltySharePercent(prev, accountId, percent));
    setConfirmingRemove(false);
  }, []);

  const visibleSearchProfiles = searchProfiles.filter(
    (profile) => !isSelected(profile.accountId)
  );

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSharesChange(draft);
    onClose();
  }, [canSave, draft, onClose, onSharesChange]);

  const totalLabel = formatRoyaltyPercent(totalBps);

  return (
    <>
      <OsHugSheet
        open={open}
        onClose={onClose}
        onClosed={onClosed}
        label="Royalty split"
        copy={`Share of the ${totalLabel}% resale cut`}
        closeAriaLabel="Close royalty split"
        backdropLabel="Close royalty split"
        zIndex={zIndex}
        panelClassName="collection-allowlist-sheet-panel"
        bodyClassName="collection-allowlist-sheet-body"
        footer={
          <div className="guild-add-member-footer">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready={canSave}
                disabled={!canSave}
                onClick={handleSave}
              >
                {shareError && draft.length > 0 ? 'Fix shares' : 'Done'}
              </OsSheetAction>
            </OsSheetActions>
          </div>
        }
      >
        <div className="collection-allowlist-sheet guild-add-member-sheet">
          <SearchField
            value={query}
            onValueChange={(next) => {
              if (pending || draft.length >= MAX_ROYALTY_RECIPIENTS) return;
              setQuery(next);
              const normalized = normalizeProfileSearchQuery(next);
              if (normalized.length < PROFILE_SEARCH_MIN_QUERY_LENGTH) {
                setSearchProfiles([]);
                setSearchPending(false);
                setSearchError(null);
              }
            }}
            placeholder="Search profiles"
            ariaLabel="Search royalty recipients"
            maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
            clearAriaLabel="Clear royalty search"
            chrome="sheet"
            className="collection-allowlist-search"
            autoFocus
          />

          {draft.length > 0 ? (
            <div className="collection-allowlist-section">
              <div className="collection-allowlist-members-head">
                <p className="collection-allowlist-section-label">
                  Split · {draft.length}
                </p>
                {draft.length > 1 ? (
                  <button
                    type="button"
                    className="collection-allowlist-text-btn"
                    disabled={pending}
                    onClick={() =>
                      setDraft(
                        equalizeRoyaltyShares(
                          draft.map((share) => share.accountId)
                        )
                      )
                    }
                  >
                    Equalize
                  </button>
                ) : null}
              </div>
              <ul className="collection-allowlist-selected">
                {draft.map((share) => {
                  const face = faceFor(share.accountId);
                  return (
                    <li
                      key={share.accountId}
                      className="collection-allowlist-chip"
                    >
                      <button
                        type="button"
                        className="collection-allowlist-chip-main"
                        disabled={pending}
                        aria-label={`Edit @${fallbackLabel(share.accountId)}, ${share.percent}%`}
                        onClick={() => openEdit(share.accountId)}
                      >
                        <ProfileAvatar
                          src={face.avatarUrl}
                          fallbackInitial={face.name}
                          size="sm"
                          className="collection-allowlist-chip-avatar"
                        />
                        <span className="collection-allowlist-chip-label">
                          @{fallbackLabel(share.accountId)}
                        </span>
                        <span className="collection-allowlist-chip-cap">
                          {share.percent}%
                        </span>
                      </button>
                      <button
                        type="button"
                        className="collection-allowlist-chip-remove"
                        disabled={pending || draft.length <= 1}
                        aria-label={`Remove @${fallbackLabel(share.accountId)}`}
                        onClick={() => removeAccount(share.accountId)}
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
          ) : null}

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
                  Added — keep typing to find more.
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
                        disabled={
                          pending || draft.length >= MAX_ROYALTY_RECIPIENTS
                        }
                        onClick={() =>
                          addAccount(profile.accountId, {
                            name: profile.name,
                            avatarUrl: profile.avatarUrl,
                          })
                        }
                      >
                        <StandingIdentity
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
              {draft.length >= MAX_ROYALTY_RECIPIENTS
                ? `Maximum ${MAX_ROYALTY_RECIPIENTS} recipients.`
                : draft.length <= 1
                  ? `They earn the full ${totalLabel}% on resales. Search to split.`
                  : `Resale cut stays ${totalLabel}% — split across ${draft.length} accounts.`}
            </p>
          )}

          {shareError ? (
            <p className="guild-form-error" role="alert">
              {shareError}
            </p>
          ) : null}
        </div>
      </OsHugSheet>

      <OsHugSheet
        open={editingShare != null && editingFace != null}
        onClose={closeEdit}
        label="Share"
        {...(confirmingRemove ? { copy: 'Confirm removal' } : {})}
        closeAriaLabel="Close share"
        backdropLabel="Close share edit"
        zIndex={zIndex + 2}
        titleId={editTitleId}
        panelClassName="collection-allowlist-edit-sheet-panel"
        bodyClassName="collection-allowlist-edit-sheet-body"
        footer={
          editingFace ? (
            <div className="guild-add-member-footer">
              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                <OsSheetAction
                  type="button"
                  variant={confirmingRemove ? 'danger' : 'primary'}
                  ready
                  onClick={
                    confirmingRemove
                      ? () => removeAccount(editingFace.accountId)
                      : closeEdit
                  }
                  onBlur={
                    confirmingRemove
                      ? () => setConfirmingRemove(false)
                      : undefined
                  }
                >
                  {confirmingRemove ? 'Remove?' : 'Done'}
                </OsSheetAction>
              </OsSheetActions>
            </div>
          ) : undefined
        }
      >
        {editingFace && editingShare ? (
          <div className="collection-allowlist-edit">
            <div
              className={`collection-allowlist-edit-row${
                confirmingRemove ? ' is-removing' : ''
              }`}
            >
              <div className="standing-row-main collection-allowlist-edit-main">
                <StandingIdentity
                  accountId={editingFace.accountId}
                  profileName={editingFace.name}
                  avatarUrl={editingFace.avatarUrl}
                />
              </div>
              <div className="standing-row-aside collection-allowlist-edit-aside">
                <CollectionQtyStepper
                  className="collection-allowlist-edit-qty scarce-royalty-split-qty"
                  value={editingShare.percent}
                  min={1}
                  max={draft.length <= 1 ? 100 : 100 - (draft.length - 1)}
                  disabled={confirmingRemove || pending || draft.length <= 1}
                  suffix="%"
                  aria-label="Share percent of royalty cut"
                  decreaseLabel="Decrease share"
                  increaseLabel="Increase share"
                  onChange={(next) =>
                    setEditPercent(editingFace.accountId, next)
                  }
                />
                {draft.length > 1 ? (
                  <OsFieldRemove
                    variant="danger"
                    ready
                    aria-pressed={confirmingRemove}
                    aria-label={
                      confirmingRemove
                        ? `Cancel remove @${fallbackLabel(editingFace.accountId)}`
                        : `Remove @${fallbackLabel(editingFace.accountId)}`
                    }
                    onClick={() => setConfirmingRemove((value) => !value)}
                  />
                ) : null}
              </div>
            </div>
            <p className="guild-add-member-hint">
              Of the {totalLabel}% resale cut.
            </p>
          </div>
        ) : null}
      </OsHugSheet>
    </>
  );
}
