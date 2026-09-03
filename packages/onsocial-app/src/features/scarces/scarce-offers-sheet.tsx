'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Divider, OsGestureSheet } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  fetchCollectionCreatorFaces,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import { ScarceBuyCover } from '@/features/scarces/scarce-buy-cover';
import { ScarcePartyLine } from '@/features/scarces/scarce-party-line';
import {
  fetchOffersForToken,
  type ScarceTokenOffer,
} from '@/features/scarces/scarce-offers';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { SHEET_Z } from '@/lib/sheet-z';
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
  zIndex?: number;
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
  zIndex = SHEET_Z.gesture,
}: ScarceOffersSheetProps) {
  const titleId = useId();
  const formId = useId();
  const { isConnected, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [offers, setOffers] = useState<ScarceTokenOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [acceptingBuyer, setAcceptingBuyer] = useState<string | null>(null);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null);
  const [buyerFaces, setBuyerFaces] = useState<
    Map<string, CollectionCreatorFace>
  >(() => new Map());
  const sheetOpen = open && !closing && item != null;
  const { panelStyle, keyboardOpen, moodId } =
    useCommerceSheetKeyboard(sheetOpen);
  const selectedOffer =
    offers.find((offer) => offer.buyerId === selectedBuyerId) ??
    offers[0] ??
    null;
  const canPickOffer = offers.length > 1;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelectedBuyerId(null);
  }

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
      setSelectedBuyerId(null);
      setLoading(false);
      return;
    }
    const tokenId = item.tokenId;
    let cancelled = false;
    setOffers([]);
    setSelectedBuyerId(null);
    setLoading(true);
    void fetchOffersForToken(tokenId)
      .then((rows) => {
        if (cancelled) return;
        setOffers(rows);
        setSelectedBuyerId(rows[0]?.buyerId ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item?.tokenId]);

  useEffect(() => {
    const buyerIds = offers.map((offer) => offer.buyerId);
    if (!open || buyerIds.length === 0) {
      setBuyerFaces(new Map());
      return;
    }
    let cancelled = false;
    void fetchCollectionCreatorFaces(
      createReadOnlyOnSocialClient(),
      buyerIds
    ).then((faces) => {
      if (!cancelled) setBuyerFaces(faces);
    });
    return () => {
      cancelled = true;
    };
  }, [open, offers]);

  const handleAccept = useCallback(
    async (offer: ScarceTokenOffer) => {
      if (!item?.tokenId || acceptingBuyer || loading) return;
      if (!offers.some((row) => row.buyerId === offer.buyerId)) return;
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
    },
    [
      acceptingBuyer,
      getSigningWallet,
      item?.tokenId,
      loading,
      offers,
      onAccepted,
      requestClose,
      setTxResult,
      trackTransaction,
    ]
  );

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (loading || !selectedOffer) return null;
    const accepting = Boolean(acceptingBuyer);
    return {
      visible: true,
      primaryType: 'button',
      primaryLabel: isConnected
        ? canPickOffer
          ? `Accept · ${formatNearLabel(selectedOffer.amountNear)}`
          : 'Accept'
        : 'Connect wallet',
      primaryPendingLabel: isConnected ? 'Accepting…' : 'Connecting…',
      canSubmit: !accepting,
      pending: accepting,
      disabled: accepting,
      onPrimaryClick: () => {
        void handleAccept(selectedOffer);
      },
    };
  }, [
    acceptingBuyer,
    canPickOffer,
    handleAccept,
    isConnected,
    loading,
    selectedOffer,
  ]);

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      verb="Offers"
      signal="reputation"
      closeAriaLabel="Close offers"
      backdropLabel="Close offers"
      keyboardOpen={keyboardOpen}
      moodId={moodId}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={zIndex}
      footer={
        footerState?.visible ? (
          <CommerceSheetFooter
            formId={formId}
            keyboardOpen={keyboardOpen}
            state={footerState}
          />
        ) : undefined
      }
    >
      {sheetOpen && item ? (
        <div className="profile-support-form">
          {item.mediaUrl ? (
            <ScarceBuyCover src={item.mediaUrl} label={item.title} />
          ) : null}

          <div className="scarce-buy-summary">
            <p className="scarce-buy-title">{item.title}</p>
            {loading ? (
              <p className="profile-support-hint">Loading offers…</p>
            ) : offers.length === 0 ? (
              <p className="profile-support-hint">No open offers yet.</p>
            ) : (
              <ul className="scarce-offer-list" aria-label="Open offers">
                {offers.map((offer, index) => {
                  const selected = selectedOffer?.buyerId === offer.buyerId;
                  const face = buyerFaces.get(offer.buyerId);
                  const amount = formatNearLabel(offer.amountNear);
                  return (
                    <li key={offer.buyerId} className="scarce-offer-item">
                      {index > 0 ? <Divider variant="item" /> : null}
                      <div className="scarce-offer-pick">
                        <ScarcePartyLine
                          accountId={offer.buyerId}
                          displayNameValue={face?.displayName}
                          avatarUrl={face?.avatarUrl}
                        />
                        {canPickOffer ? (
                          <button
                            type="button"
                            className={
                              selected
                                ? 'os-surface-chip is-selected scarce-offer-amount-chip'
                                : 'os-surface-chip scarce-offer-amount-chip'
                            }
                            aria-pressed={selected}
                            aria-label={`Select offer ${amount}`}
                            onClick={() => setSelectedBuyerId(offer.buyerId)}
                          >
                            {amount}
                          </button>
                        ) : (
                          <span className="scarce-buy-price">{amount}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </OsGestureSheet>
  );
}
