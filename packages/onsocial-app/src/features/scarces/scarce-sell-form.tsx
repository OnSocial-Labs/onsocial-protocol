'use client';

import { useCallback, useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { OwnedScarceItem } from '@/features/market/market-listings';
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

export interface ScarceSellSuccessDetail {
  tokenId: string;
  priceNear: string;
}

interface ScarceSellFormProps {
  item: OwnedScarceItem;
  onSuccess?: (detail: ScarceSellSuccessDetail) => void;
}

/** Secondary resale — list an owned scarce NFT at a fixed NEAR price. */
export function ScarceSellForm({ item, onSuccess }: ScarceSellFormProps) {
  const { isConnected, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [amountInput, setAmountInput] = useState(
    item.listedPriceNear?.trim() || '1'
  );
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

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
      onSuccess?.({ tokenId: item.tokenId, priceNear });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.sellScarceFailed,
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
      <div className="market-listing-row scarce-sell-preview" aria-hidden>
        <div
          className={`market-listing-thumb${item.mediaUrl ? ' has-media' : ''}`}
        >
          {item.mediaUrl ? (
            <img src={item.mediaUrl} alt="" />
          ) : (
            <span className="market-listing-thumb-fallback" />
          )}
        </div>
        <div className="market-listing-copy">
          <p className="market-listing-title">{item.title}</p>
          <p className="market-listing-meta">{item.tokenId}</p>
        </div>
      </div>

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

      <p className="profile-support-hint">
        Lists this scarce for resale. Creator royalty from the original mint
        still applies.
      </p>

      {amountError || fieldError ? (
        <p className="app-error-text" role="alert">
          {fieldError ?? amountError}
        </p>
      ) : null}

      <OsSheetActions layout="stack" tone="frosted-primary">
        <OsSheetAction
          type="submit"
          variant="primary"
          ready={canSubmit}
          pending={pending}
          pendingLabel="Listing…"
        >
          List for sale
        </OsSheetAction>
      </OsSheetActions>
    </form>
  );
}
