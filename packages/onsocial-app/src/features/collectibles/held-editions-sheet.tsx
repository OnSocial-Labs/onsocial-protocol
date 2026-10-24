'use client';

import { useState } from 'react';
import { Divider, OsHugSheet } from '@onsocial/ui';
import {
  heldEditionCoversDiffer,
  heldEditionLabel,
} from '@/features/collectibles/held-editions';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import { ScarceTokenHistorySheet } from '@/features/scarces/scarce-token-history-sheet';
import { ownedScarceCanTransfer } from '@/features/scarces/scarce-transfer';
import { SHEET_Z } from '@/lib/sheet-z';

/** Per-edition face. Empty when that seat has no resolved image. */
function HeldEditionCover({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <span className="held-edition-cover is-empty" aria-hidden />;
  }
  return (
    <img
      className="held-edition-cover"
      src={src}
      alt=""
      onError={() => setBroken(true)}
    />
  );
}

/**
 * Editions of one drop. The grouped row stays `×N` with no token ids.
 * Each edition carries its own Transfer, Sell, and History.
 * Covers appear only when the editions resolve to different images.
 */
export function HeldEditionList({
  editions,
  onTransfer,
  onSell,
  onHistory,
}: {
  editions: OwnedScarceItem[];
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
  onHistory?: (item: OwnedScarceItem) => void;
}) {
  if (editions.length === 0) {
    return <p className="held-edition-empty">No editions to choose.</p>;
  }

  const showCovers = heldEditionCoversDiffer(editions);

  return (
    <div className="held-edition-list">
      {editions.map((item, index) => {
        const canTransfer = Boolean(onTransfer) && ownedScarceCanTransfer(item);
        const canSell = Boolean(onSell) && item.listingKind == null;
        const label = heldEditionLabel(item.tokenId);
        const cover = item.mediaUrl?.trim() || '';
        return (
          <div key={item.tokenId}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="held-edition-row">
              <span className="held-edition-main">
                {showCovers ? <HeldEditionCover src={cover} /> : null}
                <span className="held-edition-label">{label}</span>
              </span>
              <span className="held-edition-actions">
                {canTransfer ? (
                  <button
                    type="button"
                    className="held-edition-action"
                    onClick={() => onTransfer?.(item)}
                  >
                    Transfer
                  </button>
                ) : null}
                {canSell ? (
                  <button
                    type="button"
                    className="held-edition-action"
                    onClick={() => onSell?.(item)}
                  >
                    Sell
                  </button>
                ) : null}
                {onHistory ? (
                  <button
                    type="button"
                    className="held-edition-action"
                    onClick={() => onHistory(item)}
                  >
                    History
                  </button>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HeldEditionsSheet({
  open,
  title,
  editions,
  onClose,
  onTransfer,
  onSell,
}: {
  open: boolean;
  title: string;
  editions: OwnedScarceItem[];
  onClose: () => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
}) {
  const [historyItem, setHistoryItem] = useState<OwnedScarceItem | null>(null);
  const heading = title.trim() || 'Editions';

  return (
    <>
      <OsHugSheet
        open={open}
        onClose={onClose}
        label="Editions"
        copy={heading}
        closeAriaLabel="Close editions"
        backdropLabel="Close editions"
        zIndex={SHEET_Z.list}
      >
        <HeldEditionList
          editions={editions}
          onTransfer={
            onTransfer
              ? (item) => {
                  onClose();
                  onTransfer(item);
                }
              : undefined
          }
          onSell={
            onSell
              ? (item) => {
                  onClose();
                  onSell(item);
                }
              : undefined
          }
          onHistory={setHistoryItem}
        />
      </OsHugSheet>
      <ScarceTokenHistorySheet
        open={historyItem != null}
        onClose={() => setHistoryItem(null)}
        tokenId={historyItem?.tokenId ?? ''}
        title={historyItem ? heldEditionLabel(historyItem.tokenId) : heading}
      />
    </>
  );
}
