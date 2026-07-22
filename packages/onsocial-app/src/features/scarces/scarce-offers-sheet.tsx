'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  fetchOffersForToken,
  type ScarceTokenOffer,
} from '@/features/scarces/scarce-offers';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface ScarceOffersSheetProps {
  open: boolean;
  item: OwnedScarceItem | null;
  onOpenChange: (open: boolean) => void;
  onAccepted?: () => void;
}

function formatNearLabel(near: string): string {
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return `${near} NEAR`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`;
}

/** Owner sheet: review and accept open offers on an owned scarce. */
export function ScarceOffersSheet({
  open,
  item,
  onOpenChange,
  onAccepted,
}: ScarceOffersSheetProps) {
  const titleId = useId();
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [offers, setOffers] = useState<ScarceTokenOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [acceptingBuyer, setAcceptingBuyer] = useState<string | null>(null);
  const sheetOpen = open && !closing && item != null;
  const accountId = item?.ownerId || '';
  const name = accountId ? displayName(accountId) : '';
  const handle = accountId ? fallbackLabel(accountId) : '';

  if (open !== wasOpen) {
    setWasOpen(open);
  }

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open || !item?.tokenId) {
      setOffers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchOffersForToken(item.tokenId).then((rows) => {
      if (cancelled) return;
      setOffers(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, item?.tokenId]);

  async function handleAccept(offer: ScarceTokenOffer) {
    if (!item?.tokenId || acceptingBuyer) return;
    setAcceptingBuyer(offer.buyerId);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(signerId, wallet);
      const response = await client.scarces.offers.accept(
        item.tokenId,
        offer.buyerId
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.acceptingScarceOffer,
        successMessage: txToastSuccess.scarceOfferAccepted,
        failureMessage: txToastError.acceptScarceOfferFailed,
      });
      if (!confirmed) return;
      onAccepted?.();
      requestClose();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.acceptScarceOfferFailed,
      });
    } finally {
      setAcceptingBuyer(null);
    }
  }

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      panelClassName="profile-support-sheet-panel"
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close offers"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Offers"
            personName={name}
            handle={handle}
            signal="reputation"
            closeAriaLabel="Close offers"
            onClose={requestClose}
            whisper="Accept the best offer to sell this scarce."
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {sheetOpen && item ? (
        <div className="profile-support-form">
          <div className="scarce-buy-summary">
            <p className="scarce-buy-title">{item.title}</p>
          </div>

          {loading ? (
            <p className="profile-support-hint">Loading offers…</p>
          ) : offers.length === 0 ? (
            <p className="profile-support-hint">No open offers yet.</p>
          ) : (
            <ul className="scarce-bid-history-list" aria-label="Open offers">
              {offers.map((offer) => (
                <li
                  key={offer.buyerId}
                  className="scarce-bid-history-row scarce-offer-row"
                >
                  <div className="scarce-offer-copy">
                    <span>@{fallbackLabel(offer.buyerId)}</span>
                    <span>{formatNearLabel(offer.amountNear)}</span>
                  </div>
                  <OsSheetActions
                    layout="row-compact"
                    tone="frosted-primary"
                    borderless
                  >
                    <OsSheetAction
                      type="button"
                      variant="primary"
                      ready={!acceptingBuyer}
                      pending={acceptingBuyer === offer.buyerId}
                      pendingLabel="Accepting…"
                      onClick={() => {
                        void handleAccept(offer);
                      }}
                    >
                      Accept
                    </OsSheetAction>
                  </OsSheetActions>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </GlassSheet>
  );
}
