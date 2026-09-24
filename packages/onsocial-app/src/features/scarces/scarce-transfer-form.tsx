'use client';

import { useEffect, useMemo, useState } from 'react';
import { Divider } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { NearAccountField } from '@/components/ui/near-account-field';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { ScarceBuyCover } from '@/features/scarces/scarce-buy-cover';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { scarceTransferReady } from '@/features/scarces/scarce-transfer';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  nearAccountStatusClass,
  useNearAccountStatus,
} from '@/hooks/use-near-account-status';
import { accountIdsEqual } from '@/lib/account-match';
import { nearAccountPlaceholder, normalizeNearAccountId } from '@/lib/app-near-account';
import {
  fetchDiscoverProfiles,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import {
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
const SEARCH_RESULT_LIMIT = 8;

export interface ScarceTransferSuccessDetail {
  tokenId: string;
  receiverId: string;
}

interface ScarceTransferFormProps {
  item: OwnedScarceItem;
  formId: string;
  ownerAccountId?: string | null;
  onSuccess?: (detail: ScarceTransferSuccessDetail) => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
}

/** Send one owned scarce. The account lip settles green before Transfer enables. */
export function ScarceTransferForm({
  item,
  formId,
  ownerAccountId = null,
  onSuccess,
  onFooterStateChange,
}: ScarceTransferFormProps) {
  const { accountId: viewerAccountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [receiverId, setReceiverId] = useState('');
  const [pending, setPending] = useState(false);
  const [searchProfiles, setSearchProfiles] = useState<DiscoverProfileSummary[]>(
    []
  );
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const ownerId =
    ownerAccountId?.trim() ||
    item.ownerId?.trim() ||
    viewerAccountId?.trim() ||
    null;
  const accountStatus = useNearAccountStatus(receiverId);
  const normalized = normalizeNearAccountId(receiverId);
  const isSelf = Boolean(ownerId && accountIdsEqual(normalized, ownerId));
  const statusClass = isSelf ? 'is-taken' : nearAccountStatusClass(accountStatus);
  const canSubmit =
    !pending &&
    scarceTransferReady({
      status: accountStatus,
      receiverId,
      ownerId,
    });
  const listed = item.listingKind != null;
  const normalizedQuery = normalizeProfileSearchQuery(receiverId);
  const searchActive =
    !pending &&
    accountStatus !== 'found' &&
    normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!searchActive) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchPending(true);
      setSearchError(null);
      void fetchDiscoverProfiles(
        normalizedQuery,
        ownerId,
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
  }, [normalizedQuery, ownerId, searchActive]);

  const visibleProfiles = useMemo(
    () =>
      searchProfiles
        .filter(
          (profile) => !ownerId || !accountIdsEqual(profile.accountId, ownerId)
        )
        .slice(0, SEARCH_RESULT_LIMIT),
    [ownerId, searchProfiles]
  );

  const footerState = useMemo<CommerceSheetFooterState>(
    () => ({
      visible: true,
      primaryLabel: 'Transfer',
      primaryPendingLabel: 'Transferring…',
      canSubmit,
      pending,
      disabled: pending || !canSubmit,
    }),
    [canSubmit, pending]
  );
  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

  async function handleSubmit() {
    if (!canSubmit) return;
    const receiver = normalizeNearAccountId(receiverId);
    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.tokens.transfer(
        item.tokenId,
        receiver
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.transferringScarce,
        successMessage: txToastSuccess.scarceTransferred(
          displayName(receiver)
        ),
        failureMessage: txToastError.transferScarceFailed,
      });
      if (!confirmed) return;
      onSuccess?.({ tokenId: item.tokenId, receiverId: receiver });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.transferScarceFailed,
      });
    } finally {
      setPending(false);
    }
  }

  const title = item.title?.trim() || 'Scarce';
  const mediaUrl = item.mediaUrl?.trim() || null;
  const playable = item.playable;

  return (
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {playable ? (
        <ScarceClipPlayer
          key={playable.url}
          clip={playable}
          {...(item.playables?.length ? { tracks: item.playables } : {})}
          poster={mediaUrl}
          commerce
        />
      ) : mediaUrl ? (
        <ScarceBuyCover src={mediaUrl} label={title} />
      ) : null}

      <div className="scarce-buy-summary">
        <p className="scarce-buy-title">{title}</p>
      </div>

      <label className="guild-field" htmlFor={`${formId}-to`}>
        <span>To</span>
        <NearAccountField
          id={`${formId}-to`}
          value={receiverId}
          onValueChange={setReceiverId}
          disabled={pending}
          placeholder={nearAccountPlaceholder()}
          status={isSelf ? 'found' : accountStatus}
          statusClass={statusClass}
          aria-invalid={
            isSelf ||
            accountStatus === 'invalid' ||
            accountStatus === 'missing'
          }
        />
      </label>

      {searchActive ? (
        <div className="collection-allowlist-section">
          {searchPending && visibleProfiles.length === 0 ? (
            <p className="guild-add-member-hint">Searching…</p>
          ) : null}
          {searchError ? (
            <p className="guild-form-error" role="alert">
              {searchError}
            </p>
          ) : null}
          {!searchPending && visibleProfiles.length === 0 && !searchError ? (
            <p className="guild-add-member-hint">No profiles found.</p>
          ) : null}
          {visibleProfiles.length > 0 ? (
            <div
              className="standing-list guild-add-member-results"
              role="listbox"
              aria-label="OnSocial profiles"
            >
              {visibleProfiles.map((profile, index) => (
                <div key={profile.accountId}>
                  {index > 0 ? <Divider variant="item" /> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="guild-add-member-result"
                    onClick={() => setReceiverId(profile.accountId)}
                  >
                    <StandingIdentity
                      accountId={profile.accountId}
                      profileName={profile.name}
                      avatarUrl={profile.avatarUrl}
                    />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : listed || isSelf || accountStatus === 'missing' ? (
        <p className="profile-support-hint">
          {listed ? 'This comes off sale.' : ''}
          {isSelf ? ' Choose another account.' : ''}
          {accountStatus === 'missing'
            ? ` No NEAR account found for ${fallbackLabel(normalized)}.`
            : ''}
        </p>
      ) : null}
    </form>
  );
}
