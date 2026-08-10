'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProfileAvatar } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { DropImageLightbox } from '@/features/scarces/drop-artwork-preview';
import { ScarceProvenanceCopy } from '@/features/scarces/scarce-provenance-copy';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { personalPostPath } from '@/lib/post-routes';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function sourcePostCoords(
  path: string | undefined
): { author: string; postId: string } | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
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
  onSuccess?: (detail: ScarceSellSuccessDetail) => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
}

/** Secondary resale — fixed price or auction for an owned scarce. */
export function ScarceSellForm({
  item,
  formId,
  onSuccess,
  onFooterStateChange,
}: ScarceSellFormProps) {
  const { isConnected, getSigningWallet } = useAppWallet();
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
  const sourcePost = sourcePostCoords(item.sourcePostPath);
  const sourcePostHref = sourcePost
    ? personalPostPath(sourcePost.author, sourcePost.postId)
    : null;
  const sourceHandle = sourcePost ? fallbackLabel(sourcePost.author) : null;
  const [sourceAuthorName, setSourceAuthorName] = useState<string | null>(null);
  const [sourceAvatarUrl, setSourceAvatarUrl] = useState<string | null>(null);
  const [coverZoomOpen, setCoverZoomOpen] = useState(false);

  useEffect(() => {
    const author = sourcePost?.author?.trim();
    if (!author) {
      setSourceAuthorName(null);
      setSourceAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const profile = await client.profiles.get(author);
        if (cancelled) return;
        setSourceAuthorName(profile?.name?.trim() || null);
        setSourceAvatarUrl(
          profile ? client.profiles.avatarUrl(profile) : null
        );
      } catch {
        if (!cancelled) {
          setSourceAuthorName(null);
          setSourceAvatarUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourcePost?.author]);

  const sourceDisplayName = sourceAuthorName?.trim() || null;
  const sourceNameIsCustom =
    Boolean(sourceDisplayName) &&
    sourceDisplayName!.toLowerCase() !== sourceHandle?.toLowerCase();

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

  return (
    <>
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="market-listing-row scarce-sell-preview">
        {item.mediaUrl?.trim() ? (
          <button
            type="button"
            className="market-listing-thumb has-media scarce-sell-thumb-zoom"
            aria-label={`Preview ${item.title}`}
            aria-haspopup="dialog"
            aria-expanded={coverZoomOpen}
            onClick={() => setCoverZoomOpen(true)}
          >
            <img src={item.mediaUrl} alt="" />
          </button>
        ) : (
          <div className="market-listing-thumb" aria-hidden>
            <span className="market-listing-thumb-fallback" />
          </div>
        )}
        <div className="market-listing-copy">
          <p className="market-listing-title">{item.title}</p>
          <p className="market-listing-meta">
            <span className="market-listing-own">{item.tokenId}</span>
            {sourcePostHref && sourceHandle ? (
              <>
                <span className="market-listing-own">{' · Author '}</span>
                <Link
                  href={sourcePostHref}
                  scroll={false}
                  className="scarce-sell-from-author"
                >
                  <ProfileAvatar
                    src={sourceAvatarUrl}
                    size="sm"
                    className="scarce-sell-from-avatar"
                  />
                  {sourceNameIsCustom ? (
                    <>
                      <span className="scarce-sell-from-name">
                        {sourceDisplayName}
                      </span>
                      <span className="scarce-sell-from-handle">
                        @{sourceHandle}
                      </span>
                    </>
                  ) : (
                    <span className="scarce-sell-from-name">
                      @{sourceHandle}
                    </span>
                  )}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <ScarceProvenanceCopy
        title={item.title}
        description={item.description}
        postHref={sourcePostHref}
        sourcePostPath={item.sourcePostPath}
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
      <div className="app-storage-amount-field profile-support-amount-field">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amountInput}
          onChange={(event) => applyAmountInput(event.target.value)}
          onFocus={onAmountFocus}
          onBlur={() =>
            applyAmountInput(
              finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS)
            )
          }
          placeholder={MIN_PRICE_NEAR}
          aria-label={mode === 'auction' ? 'Reserve in NEAR' : 'Price in NEAR'}
          aria-invalid={Boolean(amountError)}
          className="app-storage-amount-input"
          disabled={pending}
        />
        <span className="account-card-balance-unit profile-support-token-unit">
          NEAR
        </span>
      </div>

      <div className="profile-support-quick-row">
        <div
          className="app-storage-presets"
          role="group"
          aria-label={mode === 'auction' ? 'Quick reserves' : 'Quick prices'}
        >
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`os-surface-chip${
                normalizedAmount === preset ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => applyAmountInput(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {mode === 'auction' ? (
        <>
          <p className="scarce-mood-picker-label">Min bid step</p>
          <div className="app-storage-amount-field profile-support-amount-field">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={incrementInput}
              onChange={(event) => applyIncrementInput(event.target.value)}
              onFocus={onAmountFocus}
              onBlur={() =>
                applyIncrementInput(
                  finalizeAmountInput(incrementInput, NEAR_INPUT_DECIMALS)
                )
              }
              placeholder="0.1"
              aria-label="Minimum bid increment in NEAR"
              className="app-storage-amount-input"
              disabled={pending}
            />
            <span className="account-card-balance-unit profile-support-token-unit">
              NEAR
            </span>
          </div>
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
          <div className="app-storage-amount-field profile-support-amount-field">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={buyNowInput}
              onChange={(event) => applyBuyNowInput(event.target.value)}
              onFocus={onAmountFocus}
              onBlur={() =>
                applyBuyNowInput(
                  finalizeAmountInput(buyNowInput, NEAR_INPUT_DECIMALS)
                )
              }
              placeholder="Above reserve"
              aria-label="Buy now price in NEAR"
              className="app-storage-amount-input"
              disabled={pending}
            />
            <span className="account-card-balance-unit profile-support-token-unit">
              NEAR
            </span>
          </div>
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
      ) : null}
    </form>
    {item.mediaUrl?.trim() ? (
      <DropImageLightbox
        open={coverZoomOpen}
        src={item.mediaUrl.trim()}
        label={`Preview ${item.title}`}
        onClose={() => setCoverZoomOpen(false)}
      />
    ) : null}
    </>
  );
}
