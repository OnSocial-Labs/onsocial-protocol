'use client';

import { useEffect, useMemo, useState } from 'react';
import { AmountField } from '@/components/ui/amount-field';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import {
  fetchOfferFromBuyer,
  type ScarceTokenOffer,
} from '@/features/scarces/scarce-offers';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { accountIdsEqual } from '@/lib/account-match';
import { nearToYocto } from '@/lib/app-near-rpc';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const NEAR_INPUT_DECIMALS = 4;
const PRESETS = ['0.1', '0.5', '1'] as const;

export interface ScarceOfferSuccessDetail {
  tokenId: string;
  amountNear?: string;
  canceled?: boolean;
}

interface ScarceOfferFormProps {
  formId: string;
  listing: {
    tokenId: string;
    title?: string;
    mediaUrl?: string | null;
    ownerId: string;
    /** Listed ask, when offering against a fixed-price sale. */
    askNear?: string;
  };
  onSuccess?: (detail: ScarceOfferSuccessDetail) => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
}

function formatNearLabel(near: string | null | undefined): string {
  if (!near?.trim()) return '—';
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return `${near.trim()} NEAR`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`;
}

export function ScarceOfferForm({
  formId,
  listing,
  onSuccess,
  onFooterStateChange,
}: ScarceOfferFormProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const onAmountFocus = useMobileFieldFocusScroll<HTMLInputElement>();
  const [pending, setPending] = useState<'make' | 'cancel' | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState(listing.askNear?.trim() || '');
  const [existing, setExisting] = useState<ScarceTokenOffer | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(false);

  const isOwn =
    Boolean(viewerAccountId) &&
    accountIdsEqual(viewerAccountId!, listing.ownerId);
  const normalizedAmount = finalizeAmountInput(
    amountInput,
    NEAR_INPUT_DECIMALS
  );
  const canSubmit =
    isConnected &&
    !pending &&
    !isOwn &&
    Boolean(normalizedAmount) &&
    !loadingOffer;

  useEffect(() => {
    if (!viewerAccountId || isOwn) {
      setExisting(null);
      return;
    }
    let cancelled = false;
    setLoadingOffer(true);
    void fetchOfferFromBuyer(listing.tokenId, viewerAccountId).then((offer) => {
      if (cancelled) return;
      setExisting(offer);
      if (offer) setAmountInput(offer.amountNear);
      setLoadingOffer(false);
    });
    return () => {
      cancelled = true;
    };
  }, [viewerAccountId, listing.tokenId, isOwn]);

  function applyAmountInput(raw: string) {
    setAmountInput(normalizeAmountInput(raw, NEAR_INPUT_DECIMALS));
    setFieldError(null);
  }

  async function handleSubmit() {
    setFieldError(null);
    if (isOwn) {
      setFieldError('You can’t offer on your own scarce.');
      return;
    }
    const amountNear = finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS);
    if (!amountNear) {
      setFieldError('Enter an offer amount.');
      return;
    }
    let depositYocto: string;
    try {
      depositYocto = nearToYocto(amountNear);
    } catch {
      setFieldError('Enter a valid NEAR amount.');
      return;
    }
    if (BigInt(depositYocto) <= 0n) {
      setFieldError('Offer must be greater than zero.');
      return;
    }

    setPending('make');
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.offers.make(
        { tokenId: listing.tokenId, amountNear },
        { depositYocto }
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.makingScarceOffer,
        successMessage: txToastSuccess.scarceOfferMade,
        failureMessage: txToastError.makeScarceOfferFailed,
      });
      if (!confirmed) return;
      setExisting({
        buyerId: accountId,
        amountYocto: depositYocto,
        amountNear,
        expiresAtNs: null,
        createdAtNs: Date.now() * 1_000_000,
      });
      onSuccess?.({ tokenId: listing.tokenId, amountNear });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.makeScarceOfferFailed,
      });
    } finally {
      setPending(null);
    }
  }

  async function handleCancel() {
    setFieldError(null);
    if (!existing) return;
    setPending('cancel');
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.offers.cancel(listing.tokenId);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.cancelingScarceOffer,
        successMessage: txToastSuccess.scarceOfferCanceled,
        failureMessage: txToastError.cancelScarceOfferFailed,
      });
      if (!confirmed) return;
      setExisting(null);
      onSuccess?.({ tokenId: listing.tokenId, canceled: true });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.cancelScarceOfferFailed,
      });
    } finally {
      setPending(null);
    }
  }

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (isOwn) return null;
    return {
      visible: true,
      primaryLabel: isConnected
        ? existing
          ? 'Update offer'
          : 'Make offer'
        : 'Connect wallet',
      primaryPendingLabel: existing ? 'Updating…' : 'Offering…',
      canSubmit: isConnected ? canSubmit : true,
      pending: pending === 'make',
      disabled: Boolean(pending) || (isConnected && !canSubmit),
      secondary:
        existing && isConnected
          ? {
              label: 'Cancel offer',
              pending: pending === 'cancel',
              pendingLabel: 'Canceling…',
              disabled: Boolean(pending),
              onClick: () => {
                void handleCancel();
              },
            }
          : null,
    };
  }, [canSubmit, existing, isConnected, isOwn, pending]);

  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

  return (
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {listing.mediaUrl ? (
        <div className="scarce-buy-media" aria-hidden>
          <img src={listing.mediaUrl} alt="" />
        </div>
      ) : null}

      <div className="scarce-buy-summary">
        <p className="scarce-buy-title">{listing.title?.trim() || 'Scarce'}</p>
        {listing.askNear ? (
          <p className="scarce-buy-price">
            Ask · {formatNearLabel(listing.askNear)}
          </p>
        ) : (
          <p className="scarce-buy-price">Make an offer</p>
        )}
        {loadingOffer ? (
          <p className="profile-support-hint">Checking your offer…</p>
        ) : existing ? (
          <p className="profile-support-hint">
            Your offer · {formatNearLabel(existing.amountNear)}
          </p>
        ) : null}
      </div>

      {!isOwn ? (
        <>
          <AmountField
            value={amountInput}
            onValueChange={applyAmountInput}
            maxDecimals={NEAR_INPUT_DECIMALS}
            onFocus={onAmountFocus}
            placeholder="0.1"
            aria-label="Offer in NEAR"
            invalid={Boolean(fieldError)}
            unit="NEAR"
            disabled={Boolean(pending) || loadingOffer}
          />
          <div className="profile-support-quick-row">
            <div
              className="app-storage-presets"
              role="group"
              aria-label="Quick offers"
            >
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`os-surface-chip${
                    normalizedAmount === preset ? ' is-selected' : ''
                  }`}
                  disabled={Boolean(pending) || loadingOffer}
                  onClick={() => applyAmountInput(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {fieldError ? (
        <p className="profile-support-error" role="alert">
          {fieldError}
        </p>
      ) : isOwn ? (
        <p className="profile-support-hint">Your scarce.</p>
      ) : !isConnected ? (
        <p className="profile-support-hint">Connect to offer.</p>
      ) : null}
    </form>
  );
}
