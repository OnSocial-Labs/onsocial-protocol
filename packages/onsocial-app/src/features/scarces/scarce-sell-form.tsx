'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AmountField, AmountFieldMetaRow } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  collectionIdFromTokenId,
  fetchScarceListingMeta,
  type OwnedScarceItem,
  type ScarcePlayableMedia,
} from '@/features/market/market-listings';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import { ScarceBuyCover } from '@/features/scarces/scarce-buy-cover';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { ScarcePartyLine } from '@/features/scarces/scarce-party-line';
import { ScarceProvenanceCopy } from '@/features/scarces/scarce-provenance-copy';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { accountIdsEqual } from '@/lib/account-match';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function sourcePostAuthor(path: string | undefined): string | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  return match?.[1]?.trim() || null;
}

const NEAR_INPUT_DECIMALS = 5;
const MIN_PRICE_NEAR = '0.01';
const PRESETS = ['0.1', '1', '5', '10'] as const;
const INCREMENT_PRESETS = ['0.01', '0.1', '0.5'] as const;

const NS_PER_HOUR = 3_600_000_000_000;
const DURATION_PRESETS = [
  { label: '1h', ns: NS_PER_HOUR },
  { label: '24h', ns: 24 * NS_PER_HOUR },
  { label: '3d', ns: 72 * NS_PER_HOUR },
  { label: '7d', ns: 168 * NS_PER_HOUR },
] as const;

type SellMode = 'fixed' | 'auction';

export interface ScarceSellSuccessDetail {
  tokenId: string;
  priceNear: string;
  mode: SellMode;
}

interface ScarceSellFormProps {
  item: OwnedScarceItem;
  formId: string;
  /** Listing seller — usually the connected owner. */
  sellerAccountId?: string | null;
  onSuccess?: (detail: ScarceSellSuccessDetail) => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
}

/** Secondary resale — fixed price or auction for an owned scarce. */
export function ScarceSellForm({
  item,
  formId,
  sellerAccountId = null,
  onSuccess,
  onFooterStateChange,
}: ScarceSellFormProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const onAmountFocus = useMobileFieldFocusScroll<HTMLInputElement>();
  const [mode, setMode] = useState<SellMode>('fixed');
  const [amountInput, setAmountInput] = useState(
    item.listedPriceNear?.trim() || '1'
  );
  const [incrementInput, setIncrementInput] = useState('0.1');
  const [buyNowInput, setBuyNowInput] = useState('');
  const [durationNs, setDurationNs] = useState<number>(24 * NS_PER_HOUR);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const authorFromPost = sourcePostAuthor(item.sourcePostPath);
  const sellerId =
    sellerAccountId?.trim() ||
    item.ownerId?.trim() ||
    viewerAccountId?.trim() ||
    null;
  const sourcePostHref =
    item.postHref?.trim() ||
    postHrefFromSourcePath(item.sourcePostPath) ||
    null;
  const [hydratedArtistId, setHydratedArtistId] = useState<string | null>(null);
  const [hydratedEvent, setHydratedEvent] = useState<{
    eventStartsAtMs: number | null;
    eventEndsAtMs: number | null;
    place: string | null;
  } | null>(null);
  const [authorProfileName, setAuthorProfileName] = useState<string | null>(
    null
  );
  const [authorAvatarUrl, setAuthorAvatarUrl] = useState<string | null>(null);
  const [sellerProfileName, setSellerProfileName] = useState<string | null>(
    null
  );
  const [sellerAvatarUrl, setSellerAvatarUrl] = useState<string | null>(null);
  const [hydratedPlayable, setHydratedPlayable] =
    useState<ScarcePlayableMedia | null>(null);
  const [hydratedPlayables, setHydratedPlayables] = useState<
    ScarcePlayableMedia[] | null
  >(null);

  const collectionId =
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId);

  useEffect(() => {
    const id = collectionId?.trim();
    if (!id) {
      setHydratedArtistId(null);
      setHydratedEvent(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const view = await fetchCollectionPreferIndexer(id);
        if (cancelled) return;
        if (!authorFromPost) {
          setHydratedArtistId(view?.creatorId?.trim() || null);
        }
        setHydratedEvent(
          view
            ? {
                eventStartsAtMs: view.eventStartsAtMs,
                eventEndsAtMs: view.eventEndsAtMs,
                place: view.place,
              }
            : null
        );
      } catch {
        if (!cancelled) {
          if (!authorFromPost) setHydratedArtistId(null);
          setHydratedEvent(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorFromPost, collectionId]);

  useEffect(() => {
    if (authorFromPost) setHydratedArtistId(null);
  }, [authorFromPost]);

  // Fall back to seller so party lines never blank while creator hydrates.
  const authorId = authorFromPost || hydratedArtistId || sellerId;
  const showDistinctSeller =
    Boolean(sellerId) &&
    Boolean(authorId) &&
    !accountIdsEqual(sellerId!, authorId!);

  useEffect(() => {
    const author = authorId?.trim();
    if (!author) {
      setAuthorProfileName(null);
      setAuthorAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const profile = await client.profiles.get(author);
        if (cancelled) return;
        setAuthorProfileName(profile?.name?.trim() || null);
        setAuthorAvatarUrl(
          profile ? client.profiles.avatarUrl(profile) : null
        );
      } catch {
        if (!cancelled) {
          setAuthorProfileName(null);
          setAuthorAvatarUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  useEffect(() => {
    if (!showDistinctSeller || !sellerId?.trim()) {
      setSellerProfileName(null);
      setSellerAvatarUrl(null);
      return;
    }
    const accountId = sellerId.trim();
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const profile = await client.profiles.get(accountId);
        if (cancelled) return;
        setSellerProfileName(profile?.name?.trim() || null);
        setSellerAvatarUrl(
          profile ? client.profiles.avatarUrl(profile) : null
        );
      } catch {
        if (!cancelled) {
          setSellerProfileName(null);
          setSellerAvatarUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showDistinctSeller, sellerId]);

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

  const applyAmountInput = useCallback((raw: string) => {
    setAmountInput(normalizeAmountInput(raw, NEAR_INPUT_DECIMALS));
  }, []);

  const applyIncrementInput = useCallback((raw: string) => {
    setIncrementInput(normalizeAmountInput(raw, NEAR_INPUT_DECIMALS));
  }, []);

  const applyBuyNowInput = useCallback((raw: string) => {
    setBuyNowInput(normalizeAmountInput(raw, NEAR_INPUT_DECIMALS));
  }, []);

  const normalizedAmount = finalizeAmountInput(
    amountInput,
    NEAR_INPUT_DECIMALS
  );
  const normalizedIncrement = finalizeAmountInput(
    incrementInput,
    NEAR_INPUT_DECIMALS
  );
  const normalizedBuyNow = finalizeAmountInput(
    buyNowInput,
    NEAR_INPUT_DECIMALS
  );

  let amountError: string | null = null;
  if (normalizedAmount) {
    try {
      const yocto = BigInt(nearToYocto(normalizedAmount));
      const minYocto = BigInt(nearToYocto(MIN_PRICE_NEAR));
      if (yocto < minYocto) {
        amountError = `Minimum ${MIN_PRICE_NEAR} NEAR.`;
      }
    } catch {
      amountError = 'Invalid amount.';
    }
  }

  let incrementError: string | null = null;
  if (mode === 'auction' && normalizedIncrement) {
    try {
      if (BigInt(nearToYocto(normalizedIncrement)) <= 0n) {
        incrementError = 'Increment must be greater than zero.';
      }
    } catch {
      incrementError = 'Invalid increment.';
    }
  }

  let buyNowError: string | null = null;
  if (mode === 'auction' && normalizedBuyNow && normalizedAmount) {
    try {
      if (
        BigInt(nearToYocto(normalizedBuyNow)) <=
        BigInt(nearToYocto(normalizedAmount))
      ) {
        buyNowError = 'Buy now must be above reserve.';
      }
    } catch {
      buyNowError = 'Invalid buy now price.';
    }
  }

  const canSubmit =
    isConnected &&
    !pending &&
    Boolean(normalizedAmount) &&
    !amountError &&
    (mode === 'fixed' ||
      (Boolean(normalizedIncrement) &&
        !incrementError &&
        !buyNowError &&
        durationNs > 0));

  const footerState = useMemo((): CommerceSheetFooterState => {
    return {
      visible: true,
      primaryLabel: mode === 'auction' ? 'Start auction' : 'List for sale',
      primaryPendingLabel: 'Listing…',
      canSubmit,
      pending,
      disabled: pending || !canSubmit,
    };
  }, [canSubmit, mode, pending]);

  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

  async function handleSubmit() {
    setFieldError(null);

    const priceNear = finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS);
    if (!priceNear) {
      setFieldError(mode === 'auction' ? 'Enter a reserve.' : 'Enter a price.');
      return;
    }
    try {
      const yocto = BigInt(nearToYocto(priceNear));
      if (yocto < BigInt(nearToYocto(MIN_PRICE_NEAR))) {
        setFieldError(`Minimum ${MIN_PRICE_NEAR} NEAR.`);
        return;
      }
    } catch {
      setFieldError('Invalid amount.');
      return;
    }

    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);

      if (mode === 'auction') {
        const minBidIncrementNear = finalizeAmountInput(
          incrementInput,
          NEAR_INPUT_DECIMALS
        );
        if (!minBidIncrementNear) {
          setFieldError('Enter a minimum bid increment.');
          return;
        }
        const buyNowPriceNear = finalizeAmountInput(
          buyNowInput,
          NEAR_INPUT_DECIMALS
        );
        const response = await client.scarces.auctions.start({
          tokenId: item.tokenId,
          reservePriceNear: priceNear,
          minBidIncrementNear,
          auctionDurationNs: durationNs,
          antiSnipeExtensionNs: 5 * 60 * 1_000_000_000, // 5 minutes
          ...(buyNowPriceNear ? { buyNowPriceNear } : {}),
        });
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.sellingScarce,
          successMessage: txToastSuccess.scarceAuctionListed,
          failureMessage: txToastError.listScarceAuctionFailed,
        });
        if (!confirmed) return;
        onSuccess?.({ tokenId: item.tokenId, priceNear, mode: 'auction' });
        return;
      }

      const response = await client.scarces.market.sell({
        tokenId: item.tokenId,
        priceNear,
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.sellingScarce,
        successMessage: txToastSuccess.scarceSoldListed,
        failureMessage: txToastError.sellScarceFailed,
      });
      if (!confirmed) return;
      onSuccess?.({ tokenId: item.tokenId, priceNear, mode: 'fixed' });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : mode === 'auction'
              ? txToastError.listScarceAuctionFailed
              : txToastError.sellScarceFailed,
      });
    } finally {
      setPending(false);
    }
  }

  const title = item.title?.trim() || 'Scarce';
  const mediaUrl = item.mediaUrl?.trim() || null;
  const resolvedPlayable = item.playable ?? hydratedPlayable;
  const resolvedPlayables =
    item.playables ?? hydratedPlayables ?? undefined;

  return (
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {/* Same cover plane as Buy — persist keeps album playback continuous. */}
      {resolvedPlayable ? (
        <ScarceClipPlayer
          key={resolvedPlayable.url}
          clip={resolvedPlayable}
          {...(resolvedPlayables?.length
            ? { tracks: resolvedPlayables }
            : {})}
          poster={mediaUrl}
          commerce
          {...(collectionId
            ? {
                persist: {
                  collectionId,
                  title,
                },
                creatorId: authorId,
              }
            : {})}
        />
      ) : mediaUrl ? (
        <ScarceBuyCover src={mediaUrl} label={title} />
      ) : null}

      <div className="scarce-buy-summary">
        <p className="scarce-buy-title">{title}</p>
        {authorId ? (
          <ScarcePartyLine
            label="Author"
            accountId={authorId}
            displayNameValue={authorProfileName}
            avatarUrl={authorAvatarUrl}
          />
        ) : null}
        {showDistinctSeller && sellerId ? (
          <ScarcePartyLine
            label="Seller"
            accountId={sellerId}
            displayNameValue={sellerProfileName}
            avatarUrl={sellerAvatarUrl}
          />
        ) : null}
      </div>

      <ScarceProvenanceCopy
        title={title}
        description={item.description}
        postHref={sourcePostHref}
        sourcePostPath={item.sourcePostPath}
        event={
          hydratedEvent
            ? {
                eventStartsAtMs: hydratedEvent.eventStartsAtMs,
                eventEndsAtMs: hydratedEvent.eventEndsAtMs,
                place: hydratedEvent.place,
              }
            : null
        }
      />

      <div
        className="app-storage-presets"
        role="group"
        aria-label="Listing type"
      >
        <button
          type="button"
          className={`os-surface-chip${mode === 'fixed' ? ' is-selected' : ''}`}
          disabled={pending}
          onClick={() => setMode('fixed')}
        >
          Fixed
        </button>
        <button
          type="button"
          className={`os-surface-chip${mode === 'auction' ? ' is-selected' : ''}`}
          disabled={pending}
          onClick={() => setMode('auction')}
        >
          Auction
        </button>
      </div>

      {mode === 'auction' ? (
        <p className="scarce-mood-picker-label">Reserve</p>
      ) : (
        <p className="scarce-mood-picker-label">Price</p>
      )}
      <AmountField
        value={amountInput}
        onValueChange={applyAmountInput}
        maxDecimals={NEAR_INPUT_DECIMALS}
        onFocus={onAmountFocus}
        placeholder={MIN_PRICE_NEAR}
        aria-label={mode === 'auction' ? 'Reserve in NEAR' : 'Price in NEAR'}
        invalid={Boolean(amountError)}
        unit="NEAR"
        disabled={pending}
      />

      <AmountFieldMetaRow
        presets={PRESETS}
        selectedValue={normalizedAmount}
        onSelectPreset={applyAmountInput}
        presetsAriaLabel={
          mode === 'auction' ? 'Quick reserves' : 'Quick prices'
        }
        disabled={pending}
      />

      {mode === 'auction' ? (
        <>
          <p className="scarce-mood-picker-label">Min bid step</p>
          <AmountField
            value={incrementInput}
            onValueChange={applyIncrementInput}
            maxDecimals={NEAR_INPUT_DECIMALS}
            onFocus={onAmountFocus}
            placeholder="0.1"
            aria-label="Minimum bid increment in NEAR"
            unit="NEAR"
            disabled={pending}
          />
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Quick increments"
          >
            {INCREMENT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`os-surface-chip${
                  normalizedIncrement === preset ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => applyIncrementInput(preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <p className="scarce-mood-picker-label">Duration after first bid</p>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Auction duration"
          >
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`os-surface-chip${
                  durationNs === preset.ns ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setDurationNs(preset.ns)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <p className="scarce-mood-picker-label">Buy now (optional)</p>
          <AmountField
            value={buyNowInput}
            onValueChange={applyBuyNowInput}
            maxDecimals={NEAR_INPUT_DECIMALS}
            onFocus={onAmountFocus}
            placeholder="Above reserve"
            aria-label="Buy now price in NEAR"
            unit="NEAR"
            disabled={pending}
          />
          <p className="profile-support-hint">
            {normalizedBuyNow
              ? `Bid ≥ ${normalizedBuyNow} NEAR wins immediately · `
              : 'Optional — bid at Buy now wins immediately · '}
            clock starts on first bid · late bids extend 5m.
          </p>
        </>
      ) : null}

      {amountError || incrementError || buyNowError || fieldError ? (
        <p className="app-error-text" role="alert">
          {fieldError ?? amountError ?? incrementError ?? buyNowError}
        </p>
      ) : !isConnected ? (
        <p className="profile-support-hint">Connect to list this scarce.</p>
      ) : null}
    </form>
  );
}
