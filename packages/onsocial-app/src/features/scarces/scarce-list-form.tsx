'use client';

import { useCallback, useState } from 'react';
import { DEFAULT_MOOD, type MoodKey } from '@onsocial/text-card';
import type { PostRow } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { findLiveListingForPost } from '@/features/market/market-listings';
import {
  ScarceCardMoodPicker,
  type ScarceCardThemeOptions,
} from '@/features/scarces/scarce-card-mood-picker';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import {
  ScarcePostPreview,
  postScarceCoverImage,
} from '@/features/scarces/scarce-post-preview';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto } from '@/lib/app-near-rpc';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const NEAR_INPUT_DECIMALS = 5;
const MIN_PRICE_NEAR = '0.01';
const PRESETS = ['0.1', '1', '5', '10'] as const;

/** Resale royalty presets in basis points (1000 = 10%). Paid to the post author. */
const ROYALTY_PRESETS = [
  { percent: 0, bps: 0 },
  { percent: 5, bps: 500 },
  { percent: 10, bps: 1000 },
  { percent: 15, bps: 1500 },
] as const;
const DEFAULT_ROYALTY_BPS = 1000;

/** Edition size — one listing, N purchases until sold out. */
const COPIES_PRESETS = [1, 5, 10, 25] as const;
const MIN_COPIES = 1;
const MAX_COPIES = 100;
const DEFAULT_COPIES = 1;

const DEFAULT_CARD_THEME: ScarceCardThemeOptions = {
  cardBg: DEFAULT_MOOD,
  cardMarkShape: 'rule',
  cardMarkColor: 'auto',
  cardTitleAlign: 'left',
};

function extractListingId(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const value = response as Record<string, unknown>;
  for (const key of ['listingId', 'listing_id'] as const) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (value.raw != null) return extractListingId(value.raw);
  if (value.result != null) return extractListingId(value.result);
  return undefined;
}

export interface ScarceListSuccessDetail {
  priceNear: string;
  listingId?: string;
}

interface ScarceListFormProps {
  post: PostRow;
  authorName?: string | null;
  onSuccess?: (detail: ScarceListSuccessDetail) => void;
}

export function ScarceListForm({
  post,
  authorName = null,
  onSuccess,
}: ScarceListFormProps) {
  const { isConnected, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [amountInput, setAmountInput] = useState('1');
  const [royaltyBps, setRoyaltyBps] = useState(DEFAULT_ROYALTY_BPS);
  const [copies, setCopies] = useState(DEFAULT_COPIES);
  const [cardTheme, setCardTheme] =
    useState<ScarceCardThemeOptions>(DEFAULT_CARD_THEME);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const hasCoverImage = Boolean(postScarceCoverImage(post));

  const applyAmountInput = useCallback((raw: string) => {
    setAmountInput(normalizeAmountInput(raw, NEAR_INPUT_DECIMALS));
  }, []);

  const normalizedAmount = finalizeAmountInput(
    amountInput,
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

  const canSubmit =
    isConnected && !pending && Boolean(normalizedAmount) && !amountError;

  async function handleSubmit() {
    setFieldError(null);

    const priceNear = finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS);
    if (!priceNear) {
      setFieldError('Enter a price.');
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
      // Photo posts reuse the post image. Text posts mint a gateway text-card
      // using the chosen @onsocial/text-card theme knobs.
      const editionCount = Math.min(
        MAX_COPIES,
        Math.max(MIN_COPIES, Math.floor(copies))
      );
      const response = await client.scarces.fromPost.list(post, priceNear, {
        copies: editionCount,
        ...(royaltyBps > 0
          ? { royalty: { [post.accountId]: royaltyBps } }
          : {}),
        ...(hasCoverImage
          ? {}
          : {
              cardBg: cardTheme.cardBg,
              cardMarkShape: cardTheme.cardMarkShape,
              cardMarkColor: cardTheme.cardMarkColor,
              cardTitleAlign: cardTheme.cardTitleAlign,
            }),
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.listingScarce,
        successMessage: txToastSuccess.scarceListed,
        failureMessage: txToastError.listScarceFailed,
      });
      if (!confirmed) return;

      let listingId = extractListingId(response);
      if (!listingId) {
        const live = await findLiveListingForPost(
          accountId,
          post.accountId,
          post.postId
        );
        listingId = live?.listingId;
      }

      const key = postScarceKey(post.accountId, post.postId);
      setScarceEmbedOverride(key, {
        status: 'lazy_listing',
        priceNear,
        copies: editionCount,
        remaining: editionCount,
        ...(listingId ? { listingId } : {}),
        ...(!hasCoverImage ? { cardBg: cardTheme.cardBg as MoodKey } : {}),
        events: [],
      });
      onSuccess?.({ priceNear, listingId });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.listScarceFailed,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <ScarcePostPreview
        post={post}
        creatorDisplayName={authorName}
        {...(hasCoverImage
          ? {}
          : {
              cardBg: cardTheme.cardBg,
              cardMarkShape: cardTheme.cardMarkShape,
              cardMarkColor: cardTheme.cardMarkColor,
              cardTitleAlign: cardTheme.cardTitleAlign,
            })}
      />

      {!hasCoverImage ? (
        <ScarceCardMoodPicker
          value={cardTheme}
          onChange={setCardTheme}
          disabled={pending}
        />
      ) : null}

      <div className="app-storage-amount-field profile-support-amount-field">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amountInput}
          onChange={(event) => applyAmountInput(event.target.value)}
          onBlur={() =>
            applyAmountInput(
              finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS)
            )
          }
          placeholder={MIN_PRICE_NEAR}
          aria-label="Price in NEAR"
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
          className="app-storage-presets profile-support-presets"
          role="group"
          aria-label="Quick prices"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`app-storage-preset${
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

      <div className="scarce-royalty-field">
        <p className="scarce-mood-picker-label">Copies</p>
        <div
          className="app-storage-presets profile-support-presets"
          role="group"
          aria-label="Number of copies"
        >
          {COPIES_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`app-storage-preset${
                copies === preset ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => setCopies(preset)}
            >
              {preset === 1 ? '1' : String(preset)}
            </button>
          ))}
        </div>
        <p className="profile-support-hint scarce-royalty-hint">
          {copies <= 1
            ? 'One buyer gets the scarce.'
            : `${copies} editions — listing stays up until sold out.`}
        </p>
      </div>

      <div className="scarce-royalty-field">
        <p className="scarce-mood-picker-label">Resale royalty</p>
        <div
          className="app-storage-presets profile-support-presets"
          role="group"
          aria-label="Resale royalty"
        >
          {ROYALTY_PRESETS.map((preset) => (
            <button
              key={preset.bps}
              type="button"
              className={`app-storage-preset${
                royaltyBps === preset.bps ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => setRoyaltyBps(preset.bps)}
            >
              {preset.percent === 0 ? 'None' : `${preset.percent}%`}
            </button>
          ))}
        </div>
        <p className="profile-support-hint scarce-royalty-hint">
          Primary sales pay you (minus a small fee).
          {royaltyBps > 0
            ? ` You earn ${royaltyBps / 100}% when this scarce is resold.`
            : ' No cut on future resales.'}
        </p>
      </div>

      {fieldError || amountError ? (
        <p className="profile-support-error" role="alert">
          {fieldError ?? amountError}
        </p>
      ) : !isConnected ? (
        <p className="profile-support-hint">Connect to list this post.</p>
      ) : null}

      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="submit"
          ready={isConnected ? canSubmit : true}
          pending={pending}
          pendingLabel="Listing…"
          disabled={pending || (isConnected && !canSubmit)}
        >
          {isConnected ? 'List for sale' : 'Connect wallet'}
        </OsSheetAction>
      </OsSheetActions>
    </form>
  );
}
