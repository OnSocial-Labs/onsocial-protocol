'use client';

import { useMemo, useState } from 'react';
import {
  Divider,
  DotsVerticalIcon,
  OsHugSheet,
  SheetFactRow,
} from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import {
  heldEditionCoversDiffer,
  heldEditionFactRows,
  heldEditionLabel,
  heldEditionSheetTitle,
  heldEditionTrailTimesDiffer,
} from '@/features/collectibles/held-editions';
import {
  formatMarketRelativeTime,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { ScarceTokenHistorySheet } from '@/features/scarces/scarce-token-history-sheet';
import { ownedScarceCanTransfer } from '@/features/scarces/scarce-transfer';
import { socialTimeProps } from '@/lib/post-display';
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
  onFacts,
}: {
  label: string;
  onTransfer?: () => void;
  onSell?: () => void;
  onHistory?: () => void;
  onFacts?: () => void;
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
    if (onFacts) {
      list.push({
        id: 'facts',
        label: 'Facts',
        onSelect: () => {
          setOpen(false);
          onFacts();
        },
      });
    }
    return list;
  }, [onFacts, onHistory, onSell, onTransfer]);

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
        panelClassName="held-edition-dock-panel"
        items={items}
      />
    </div>
  );
}

/** Id, mint date, and a sale line for this copy. The edition list stays open. */
function HeldEditionFactsSheet({
  item,
  onClose,
}: {
  item: OwnedScarceItem | null;
  onClose: () => void;
}) {
  const label = item ? heldEditionLabel(item.tokenId) : 'Edition';
  const rows = item ? heldEditionFactRows(item) : [];
  return (
    <OsHugSheet
      open={item != null}
      onClose={onClose}
      label="Facts"
      copy={label}
      closeAriaLabel="Close facts"
      backdropLabel="Close facts"
      zIndex={SHEET_Z.overShell}
      keepDock
      panelClassName="held-edition-dock-panel"
    >
      <div className="guild-facts held-edition-facts">
        {rows.map((row) => (
          <SheetFactRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </OsHugSheet>
  );
}

/**
 * Editions of one drop. Tap the row to open or send that edition.
 * Transfer, Sell, History, and Facts sit in one menu.
 * Covers appear only when the editions resolve to different images.
 * A mint time appears only when the copies do not share one stamp.
 */
export function HeldEditionList({
  editions,
  choose,
  onChoose,
  onTransfer,
  onSell,
  onHistory,
  onFacts,
}: {
  editions: OwnedScarceItem[];
  /** Row tap opens the edition, or sends it when the sheet was opened to transfer. */
  choose: 'open' | 'send';
  onChoose?: (item: OwnedScarceItem) => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
  onHistory?: (item: OwnedScarceItem) => void;
  onFacts?: (item: OwnedScarceItem) => void;
}) {
  const timeLabels = editions.map((item) =>
    item.mintedAtMs != null ? formatMarketRelativeTime(item.mintedAtMs) : ''
  );
  const showTimes = heldEditionTrailTimesDiffer(timeLabels);

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
        const timeLabel = timeLabels[index]?.trim() || '';
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
              <div className="drops-discovery-head-trail">
                {showTimes && timeLabel ? (
                  <time
                    className="market-listing-meta-right"
                    {...socialTimeProps(item.mintedAtMs)}
                  >
                    {timeLabel}
                  </time>
                ) : null}
                <HeldEditionMenu
                  label={label}
                  onTransfer={
                    canTransfer ? () => onTransfer?.(item) : undefined
                  }
                  onSell={canSell ? () => onSell?.(item) : undefined}
                  onHistory={onHistory ? () => onHistory(item) : undefined}
                  onFacts={onFacts ? () => onFacts(item) : undefined}
                />
              </div>
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
  const [factsItem, setFactsItem] = useState<OwnedScarceItem | null>(null);
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
        panelClassName="held-edition-dock-panel"
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
          onHistory={(item) => {
            setFactsItem(null);
            setHistoryItem(item);
          }}
          onFacts={(item) => {
            setHistoryItem(null);
            setFactsItem(item);
          }}
        />
      </OsHugSheet>
      <ScarceTokenHistorySheet
        open={historyItem != null}
        onClose={() => setHistoryItem(null)}
        tokenId={historyItem?.tokenId ?? ''}
        title={historyItem ? heldEditionLabel(historyItem.tokenId) : heading}
      />
      <HeldEditionFactsSheet
        item={factsItem}
        onClose={() => setFactsItem(null)}
      />
    </>
  );
}
