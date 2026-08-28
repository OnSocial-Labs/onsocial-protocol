'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Divider,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  ProfileAvatar,
  SearchField,
} from '@onsocial/ui';
import { StandingIdentity } from '@onsocial/ui';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  fetchDiscoverProfiles,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import { displayName } from '@/lib/profile-display';
import {
  PROFILE_SEARCH_MAX_QUERY_LENGTH,
  PROFILE_SEARCH_MIN_QUERY_LENGTH,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import { SHEET_Z } from '@/lib/sheet-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const SEARCH_DEBOUNCE_MS = 220;

interface GuildAddMemberSheetProps {
  open: boolean;
  groupId: string;
  /** Existing members — excluded from search results. */
  memberIds?: readonly string[];
  onClose: () => void;
  onAdded?: () => void;
}

function accountIdsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function GuildAddMemberSheet({
  open,
  groupId,
  memberIds = [],
  onClose,
  onAdded,
}: GuildAddMemberSheetProps) {
  const { accountId: viewerId } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();

  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [profiles, setProfiles] = useState<DiscoverProfileSummary[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const excludedIds = useMemo(() => {
    const set = new Set(
      memberIds.map((id) => id.trim().toLowerCase()).filter(Boolean)
    );
    if (viewerId) set.add(viewerId.trim().toLowerCase());
    return set;
  }, [memberIds, viewerId]);

  useEffect(() => {
    if (open) {
      setClosing(false);
      return;
    }
    setQuery('');
    setProfiles([]);
    setSearchPending(false);
    setSearchError(null);
    setSelectedId(null);
    setPending(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!sheetOpen) return;

    const normalized = normalizeProfileSearchQuery(query);
    if (normalized.length < PROFILE_SEARCH_MIN_QUERY_LENGTH) {
      setProfiles([]);
      setSearchPending(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchPending(true);
      setSearchError(null);
      void fetchDiscoverProfiles(normalized, viewerId, 0, controller.signal)
        .then((response) => {
          const next = response.profiles.filter(
            (profile) =>
              !excludedIds.has(profile.accountId.trim().toLowerCase())
          );
          setProfiles(next);
          setSelectedId((current) => {
            if (!current) return null;
            return next.some((profile) =>
              accountIdsEqual(profile.accountId, current)
            )
              ? current
              : null;
          });
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setProfiles([]);
          setSearchError(
            cause instanceof Error ? cause.message : 'Search failed.'
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchPending(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [excludedIds, query, sheetOpen, viewerId]);

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const selected = useMemo(
    () =>
      profiles.find(
        (profile) =>
          selectedId != null && accountIdsEqual(profile.accountId, selectedId)
      ) ?? null,
    [profiles, selectedId]
  );

  const handleAdd = async () => {
    if (!selected || pending) return;

    setPending(true);
    setError(null);
    try {
      const { client } = await getClient();
      const response = await client.groups.addMember(
        groupId,
        selected.accountId
      );
      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.addingGuildMember,
        successMessage: txToastSuccess.guildMemberAdded,
        failureMessage: txToastError.guildAddMemberFailed,
      });
      if (confirmed) {
        onAdded?.();
        requestClose();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not add this member.'
      );
    } finally {
      setPending(false);
    }
  };

  const normalizedQuery = normalizeProfileSearchQuery(query);
  const searchActive =
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;
  const selectedName = selected
    ? displayName(selected.accountId, selected.name ?? undefined)
    : '';

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Add member"
      copy="Search profiles to invite."
      closeAriaLabel="Close add member"
      backdropLabel="Close add member"
      zIndex={SHEET_Z.nested}
      panelClassName="guild-facts-sheet-panel os-sheet-cap-standard"
      bodyClassName="guild-facts-sheet-body"
      footer={
        <div className="guild-add-member-footer">
          {error ? (
            <p className="guild-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready={Boolean(selected) && !pending}
              pending={pending}
              disabled={!selected || pending}
              onClick={() => void handleAdd()}
            >
              {selected ? (
                <>
                  <ProfileAvatar
                    src={selected.avatarUrl}
                    fallbackInitial={selectedName}
                    size="sm"
                    className="guild-add-member-action-avatar"
                  />
                  {`Add ${selectedName}`}
                </>
              ) : (
                'Add member'
              )}
            </OsSheetAction>
          </OsSheetActions>
        </div>
      }
    >
      <div className="guild-add-member-sheet">
        <SearchField
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setError(null);
          }}
          placeholder="Search profiles"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear profile search"
          ariaLabel="Search profiles to add"
          chrome="floating-panel"
          className="guild-add-member-search"
          autoFocus
        />

        {!searchActive ? (
          <p className="guild-add-member-hint">
            Type at least {PROFILE_SEARCH_MIN_QUERY_LENGTH} characters.
          </p>
        ) : null}

        {searchActive && searchPending && profiles.length === 0 ? (
          <p className="guild-add-member-hint">Searching…</p>
        ) : null}

        {searchError ? (
          <p className="guild-form-error" role="alert">
            {searchError}
          </p>
        ) : null}

        {searchActive &&
        !searchPending &&
        profiles.length === 0 &&
        !searchError ? (
          <p className="guild-add-member-hint">No profiles found.</p>
        ) : null}

        {profiles.length > 0 ? (
          <div
            className="standing-list guild-add-member-results"
            role="listbox"
          >
            {profiles.map((profile, index) => {
              const selectedRow =
                selectedId != null &&
                accountIdsEqual(profile.accountId, selectedId);
              return (
                <div key={profile.accountId}>
                  {index > 0 ? <Divider variant="item" /> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedRow}
                    className={`guild-add-member-result${
                      selectedRow ? ' is-selected' : ''
                    }`}
                    disabled={pending}
                    onClick={() => {
                      setSelectedId(profile.accountId);
                      setError(null);
                    }}
                  >
                    <StandingIdentity
                      accountId={profile.accountId}
                      profileName={profile.name}
                      avatarUrl={profile.avatarUrl}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
