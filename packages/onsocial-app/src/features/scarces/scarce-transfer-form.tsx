'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ProfileAccountSearchPicks,
  profileAccountSearchActive,
} from '@/components/profile/profile-account-search-picks';
import { NearAccountField } from '@/components/ui/near-account-field';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  heldCopySuccessLine,
  heldEditionMark,
} from '@/features/collectibles/held-editions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  fetchScarceListingMeta,
  type OwnedScarceItem,
  type ScarcePlayableMedia,
} from '@/features/market/market-listings';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { ScarceBuyCover } from '@/features/scarces/scarce-buy-cover';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import {
  scarceTransferClipSession,
  scarceTransferReady,
} from '@/features/scarces/scarce-transfer';
import { alignSheetFieldToBodyTop } from '@/features/scarces/sheet-field-scroll';
import { pollTransferOwner } from '@/features/scarces/transfer-index-confirm';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  nearAccountStatusClass,
  useNearAccountStatus,
} from '@/hooks/use-near-account-status';
import { accountIdsEqual } from '@/lib/account-match';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  nearAccountPlaceholder,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export interface ScarceTransferSuccessDetail {
  tokenId: string;
  receiverId: string;
}

interface ScarceTransferFormProps {
  item: OwnedScarceItem;
  formId: string;
  ownerAccountId?: string | null;
  /** Sheet is clamped to the visual viewport. Park To at the top of the body. */
  keyboardOpen?: boolean;
  onSuccess?: (detail: ScarceTransferSuccessDetail) => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
}

/** Send one owned scarce. The account lip settles green before Transfer enables. */
export function ScarceTransferForm({
  item,
  formId,
  ownerAccountId = null,
  keyboardOpen = false,
  onSuccess,
  onFooterStateChange,
}: ScarceTransferFormProps) {
  const { accountId: viewerAccountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [receiverId, setReceiverId] = useState('');
  const recipientRef = useRef<HTMLLabelElement>(null);
  const [pending, setPending] = useState(false);
  const [hydratedPlayable, setHydratedPlayable] =
    useState<ScarcePlayableMedia | null>(null);
  const [hydratedPlayables, setHydratedPlayables] = useState<
    ScarcePlayableMedia[] | null
  >(null);

  const ownerId =
    ownerAccountId?.trim() ||
    item.ownerId?.trim() ||
    viewerAccountId?.trim() ||
    null;
  const accountStatus = useNearAccountStatus(receiverId);
  const normalized = normalizeNearAccountId(receiverId);
  const isSelf = Boolean(ownerId && accountIdsEqual(normalized, ownerId));
  const statusClass = isSelf
    ? 'is-taken'
    : nearAccountStatusClass(accountStatus);
  const canSubmit =
    !pending &&
    scarceTransferReady({
      status: accountStatus,
      receiverId,
      ownerId,
    });
  const listed = item.listingKind != null;
  const searchActive = profileAccountSearchActive(
    receiverId,
    accountStatus === 'found'
  );

  useEffect(() => {
    if (!keyboardOpen && !searchActive) return;
    const field = recipientRef.current;
    const input = field?.querySelector('input');
    if (!field) return;
    if (!searchActive && document.activeElement !== input) return;
    const frame = window.requestAnimationFrame(() => {
      alignSheetFieldToBodyTop(field);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [keyboardOpen, searchActive]);

  useEffect(() => {
    if (item.playable && item.playables?.length) return;
    const tokenId = item.tokenId?.trim();
    if (!tokenId) return;
    let cancelled = false;
    void (async () => {
      const meta = await fetchScarceListingMeta({ tokenId });
      if (cancelled || !meta) return;
      if (!item.playable && meta.playable) {
        setHydratedPlayable(meta.playable);
      }
      if (!item.playables?.length && meta.playables?.length) {
        setHydratedPlayables(meta.playables);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.playable, item.playables, item.tokenId]);

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
        successMessage:
          heldCopySuccessLine(
            item.tokenId,
            item.mediumKind,
            'sent',
            displayName(receiver)
          ) ?? txToastSuccess.scarceTransferred(displayName(receiver)),
        failureMessage: txToastError.transferScarceFailed,
      });
      if (!confirmed) return;
      const reader = createReadOnlyOnSocialClient();
      await pollTransferOwner({
        receiverId: receiver,
        readOwnerId: async () => {
          const rows = await reader.query.scarces.tokensByIds([item.tokenId]);
          return rows[0]?.ownerId ?? null;
        },
      });
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
  const copyMark = heldEditionMark(item.tokenId);
  const mediaUrl = item.mediaUrl?.trim() || null;
  const playable = item.playable ?? hydratedPlayable;
  const playables = item.playables ?? hydratedPlayables ?? undefined;
  const clipSession = scarceTransferClipSession(item);

  return (
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {/* Same cover plane as Buy and Sell — persist keeps playback continuous. */}
      {playable ? (
        <ScarceClipPlayer
          key={playable.url}
          clip={playable}
          {...(playables?.length ? { tracks: playables } : {})}
          poster={mediaUrl}
          commerce
          {...(clipSession
            ? {
                persist: clipSession,
                creatorId: clipSession.creatorId ?? null,
              }
            : {})}
        />
      ) : mediaUrl ? (
        <ScarceBuyCover src={mediaUrl} label={title} />
      ) : null}

      <div className="scarce-buy-summary">
        <div className="scarce-buy-identity">
          <p className="scarce-buy-title">{title}</p>
          {copyMark ? (
            <p className="collection-edition-line">{copyMark}</p>
          ) : null}
        </div>
      </div>

      <label
        ref={recipientRef}
        className="guild-field scarce-transfer-recipient"
        htmlFor={`${formId}-to`}
      >
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
            isSelf || accountStatus === 'invalid' || accountStatus === 'missing'
          }
        />
      </label>

      <ProfileAccountSearchPicks
        query={receiverId}
        enabled={searchActive && !pending}
        disabled={pending}
        excludeAccountIds={ownerId ? [ownerId] : []}
        viewerAccountId={ownerId}
        onPick={setReceiverId}
      />

      {!searchActive && (listed || isSelf || accountStatus === 'missing') ? (
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
