'use client';

import { useMemo, useState } from 'react';
import { Divider, DotsVerticalIcon, OsHugSheet } from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import {
  heldEditionCoversDiffer,
  heldEditionLabel,
  heldEditionSheetTitle,
} from '@/features/collectibles/held-editions';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import { ScarceTokenHistorySheet } from '@/features/scarces/scarce-token-history-sheet';
import { ownedScarceCanTransfer } from '@/features/scarces/scarce-transfer';
import { SHEET_Z } from '@/lib/sheet-z';

/** Per-edition face. A missing file leaves the label, with no empty tile. */
function HeldEditionCover({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    <img
      className="held-edition-cover"
      src={src}
      alt=""
      onError={() => setBroken(true)}
    />
  );
}

function HeldEditionMenu({
  label,
  onTransfer,
  onSell,
  onHistory,
}: {
  label: string;
  onTransfer?: () => void;
  onSell?: () => void;
  onHistory?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => {
    const list: {
      id: string;
      label: string;
      onSelect: () => void;
    }[] = [];
    if (onTransfer) {
      list.push({
        id: 'transfer',
        label: 'Transfer',
        onSelect: () => {
          setOpen(false);
          onTransfer();
        },
      });
    }
    if (onSell) {
      list.push({
        id: 'sell',
        label: 'Sell',
        onSelect: () => {
          setOpen(false);
          onSell();
        },
      });
    }
    if (onHistory) {
      list.push({
        id: 'history',
        label: 'History',
        onSelect: () => {
          setOpen(false);
          onHistory();
        },
      });
    }
    return list;
  }, [onHistory, onSell, onTransfer]);

  if (items.length === 0) return null;

  return (
    <div className="held-edition-menu">
      <button
        type="button"
        className={`post-card-menu-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`More for ${label}`}
        onClick={() => setOpen(true)}
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>
      <ActionDrawer
        open={open}
        onClose={() => setOpen(false)}
        label={label}
        listAriaLabel={`Actions for ${label}`}
        closeAriaLabel="Close"
        zIndex={SHEET_Z.nested}
        keepDock
        panelClassName="held-edition-menu-panel"
        items={items}
      />
    </div>
  );
}

/**
 * Editions of one drop. Tap the row to open or send that edition.
 * Transfer, Sell, and History sit in one menu.
 * Covers appear only when the editions resolve to different images.
 */
export function HeldEditionList({
  editions,
  choose,
  onChoose,
  onTransfer,
  onSell,
  onHistory,
}: {
  editions: OwnedScarceItem[];
  /** Row tap opens the edition, or sends it when the sheet was opened to transfer. */
  choose: 'open' | 'send';
  onChoose?: (item: OwnedScarceItem) => void;
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
        const canChoose = choose === 'send' ? canTransfer : Boolean(onChoose);
        const chooseName =
          choose === 'send' ? `Send ${label}` : `Open ${label}`;
        const face = (
          <>
            {showCovers ? <HeldEditionCover src={cover} /> : null}
            <span className="held-edition-label">{label}</span>
          </>
        );
        return (
          <div key={item.tokenId}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="held-edition-row">
              {canChoose ? (
                <button
                  type="button"
                  className="held-edition-choose"
                  aria-label={chooseName}
                  onClick={() =>
                    (choose === 'send' ? (onChoose ?? onTransfer) : onChoose)?.(
                      item
                    )
                  }
                >
                  {face}
                </button>
              ) : (
                <span className="held-edition-choose">{face}</span>
              )}
              <HeldEditionMenu
                label={label}
                onTransfer={canTransfer ? () => onTransfer?.(item) : undefined}
                onSell={canSell ? () => onSell?.(item) : undefined}
                onHistory={onHistory ? () => onHistory(item) : undefined}
              />
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
  choose = 'open',
  onClose,
  onChoose,
  onTransfer,
  onSell,
}: {
  open: boolean;
  title: string;
  editions: OwnedScarceItem[];
  choose?: 'open' | 'send';
  onClose: () => void;
  onChoose?: (item: OwnedScarceItem) => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
}) {
  const [historyItem, setHistoryItem] = useState<OwnedScarceItem | null>(null);
  const heading = title.trim() || 'Editions';
  const sheetTitle = heldEditionSheetTitle(choose);
  const chooseEdition = onChoose
    ? (item: OwnedScarceItem) => {
        onClose();
        onChoose(item);
      }
    : undefined;

  return (
    <>
      <OsHugSheet
        open={open}
        onClose={onClose}
        label={sheetTitle}
        copy={heading}
        closeAriaLabel={choose === 'send' ? 'Close' : 'Close editions'}
        backdropLabel={choose === 'send' ? 'Close' : 'Close editions'}
        zIndex={SHEET_Z.list}
        keepDock
      >
        <HeldEditionList
          editions={editions}
          choose={choose}
          onChoose={chooseEdition}
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
