'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Divider,
  DotsVerticalIcon,
  OsHugSheet,
  SheetFactRow,
} from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  heldEditionFactRows,
  heldEditionLabel,
  heldEditionListedState,
  heldEditionMark,
  heldEditionSheetTitle,
  heldEditionTrailTimesDiffer,
} from '@/features/collectibles/held-editions';
import {
  formatMarketRelativeTime,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { ScarceTokenHistorySheet } from '@/features/scarces/scarce-token-history-sheet';
import { ownedScarceCanTransfer } from '@/features/scarces/scarce-transfer';
import { heldEditionHref } from '@/lib/portfolio-holdings';
import { socialTimeProps } from '@/lib/post-display';
import { shareUrl } from '@/lib/share-url';
import { SHEET_Z } from '@/lib/sheet-z';

function absoluteAppUrl(path: string): string {
  const href = path.trim();
  if (!href) return '';
  if (/^https?:\/\//.test(href)) return href;
  if (typeof window === 'undefined') return href;
  return `${window.location.origin}${href.startsWith('/') ? href : `/${href}`}`;
}

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

let heldEditionMenuClosedAt = 0;

/** Set while the copy list is open, so an owner menu can dismiss it. */
const HeldEditionListCloseContext = createContext<(() => void) | null>(null);

export function useHeldEditionListClose(): (() => void) | null {
  return useContext(HeldEditionListCloseContext);
}

function HeldEditionMenu({
  label,
  menuLabel,
  onTransfer,
  onSell,
  onShare,
  onHistory,
  onFacts,
}: {
  /** Row mark under the drop title, such as `#4`. */
  label: string;
  /** Copy name for the menu, such as `Edition #4`, where the title is gone. */
  menuLabel?: string;
  onTransfer?: () => void;
  onSell?: () => void;
  onShare?: () => void;
  onHistory?: () => void;
  onFacts?: () => void;
}) {
  const menu = menuLabel?.trim() || label;
  const [open, setOpen] = useState(false);
  const choose = useCallback((action?: () => void) => {
    // The sheet leaves under the pointer, so this tap can land on More and reopen it.
    heldEditionMenuClosedAt = Date.now();
    setOpen(false);
    action?.();
  }, []);
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
        onSelect: () => choose(onTransfer),
      });
    }
    if (onSell) {
      list.push({
        id: 'sell',
        label: 'Sell',
        onSelect: () => choose(onSell),
      });
    }
    if (onShare) {
      list.push({
        id: 'share',
        label: 'Share',
        onSelect: () => choose(onShare),
      });
    }
    if (onHistory) {
      list.push({
        id: 'history',
        label: 'History',
        onSelect: () => choose(onHistory),
      });
    }
    if (onFacts) {
      list.push({
        id: 'facts',
        label: 'Facts',
        onSelect: () => choose(onFacts),
      });
    }
    return list;
  }, [choose, onFacts, onHistory, onSell, onShare, onTransfer]);

  if (items.length === 0) return null;

  return (
    <div className="held-edition-menu">
      <button
        type="button"
        className={`post-card-menu-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`More for ${label}`}
        onClick={() => {
          if (Date.now() - heldEditionMenuClosedAt < 400) return;
          setOpen(true);
        }}
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>
      <ActionDrawer
        open={open}
        onClose={() => setOpen(false)}
        label={menu}
        listAriaLabel={`Actions for ${menu}`}
        closeAriaLabel="Close"
        zIndex={SHEET_Z.nested}
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
  const label = item
    ? heldEditionLabel(item.tokenId, item.mediumKind)
    : 'Edition';
  const rows = item ? heldEditionFactRows(item) : [];
  return (
    <OsHugSheet
      open={item != null}
      onClose={onClose}
      chrome="facts"
      label="Facts"
      copy={label}
      closeAriaLabel="Close facts"
      backdropLabel="Close facts"
      zIndex={SHEET_Z.overShell}
      panelClassName="guild-facts-sheet-panel os-sheet-cap-standard"
      bodyClassName="guild-facts-sheet-body"
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
 * Transfer, Sell, Share, History, and Facts sit in one menu.
 * More than one copy shows its cover, even when the art matches.
 * A mint time appears only when the copies do not share one stamp.
 */
export function HeldEditionList({
  editions,
  choose,
  onChoose,
  onTransfer,
  onSell,
  onShare,
  onHistory,
  onFacts,
  renderOwnerMenu,
}: {
  editions: OwnedScarceItem[];
  /** Row tap opens the edition, or sends it when the sheet was opened to transfer. */
  choose: 'open' | 'send';
  onChoose?: (item: OwnedScarceItem) => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
  onShare?: (item: OwnedScarceItem) => void;
  onHistory?: (item: OwnedScarceItem) => void;
  onFacts?: (item: OwnedScarceItem) => void;
  /** Listed copies swap the row menu for the owner's sale manage menu. */
  renderOwnerMenu?: (item: OwnedScarceItem) => ReactNode;
}) {
  const timeLabels = editions.map((item) =>
    item.mintedAtMs != null ? formatMarketRelativeTime(item.mintedAtMs) : ''
  );
  const showTimes = heldEditionTrailTimesDiffer(timeLabels);

  if (editions.length === 0) {
    return <p className="held-edition-empty">Nothing to choose.</p>;
  }

  const showCovers = editions.length > 1;

  return (
    <div className="held-edition-list">
      {editions.map((item, index) => {
        const listed = item.listingKind != null;
        const canTransfer = Boolean(onTransfer) && ownedScarceCanTransfer(item);
        const canSell = Boolean(onSell) && !listed;
        const named = heldEditionLabel(item.tokenId, item.mediumKind);
        const label = heldEditionMark(item.tokenId) ?? named;
        const cover = item.mediaUrl?.trim() || '';
        const timeLabel = timeLabels[index]?.trim() || '';
        const listedState = heldEditionListedState(item);
        const canShare = Boolean(onShare) && Boolean(heldEditionHref(item));
        const canChoose = choose === 'send' ? canTransfer : Boolean(onChoose);
        const chooseVerb = choose === 'send' ? 'Send' : 'Open';
        const chooseState = listedState
          ? `, ${listedState.badge === 'Auction' ? 'on auction' : 'listed'}${listedState.ask ? ` at ${listedState.ask}` : ''}`
          : '';
        const chooseName = `${chooseVerb} ${label}${chooseState}`;
        const face = (
          <>
            {showCovers ? <HeldEditionCover src={cover} /> : null}
            <span className="held-edition-label-block">
              <span className="held-edition-label-row">
                <span className="held-edition-label">{label}</span>
                {listedState ? (
                  <span className="os-surface-row-badge held-edition-listed-badge">
                    {listedState.badge}
                  </span>
                ) : null}
              </span>
              {listedState?.ask ? (
                <span className="held-edition-listed">{listedState.ask}</span>
              ) : null}
            </span>
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
                {listed && renderOwnerMenu ? (
                  renderOwnerMenu(item)
                ) : (
                  <HeldEditionMenu
                    label={label}
                    menuLabel={named}
                    onTransfer={
                      canTransfer ? () => onTransfer?.(item) : undefined
                    }
                    onShare={canShare ? () => onShare?.(item) : undefined}
                    onSell={canSell ? () => onSell?.(item) : undefined}
                    onHistory={onHistory ? () => onHistory(item) : undefined}
                    onFacts={onFacts ? () => onFacts(item) : undefined}
                  />
                )}
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
  renderOwnerMenu,
}: {
  open: boolean;
  title: string;
  editions: OwnedScarceItem[];
  choose?: 'open' | 'send';
  onClose: () => void;
  onChoose?: (item: OwnedScarceItem) => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
  /** Listed copies swap the row menu for the owner's sale manage menu. */
  renderOwnerMenu?: (item: OwnedScarceItem) => ReactNode;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [historyItem, setHistoryItem] = useState<OwnedScarceItem | null>(null);
  const [factsItem, setFactsItem] = useState<OwnedScarceItem | null>(null);
  const shareEdition = useCallback(
    async (item: OwnedScarceItem) => {
      const path = heldEditionHref(item);
      if (!path) return;
      const title =
        item.title.trim() || heldEditionLabel(item.tokenId, item.mediumKind);
      const result = await shareUrl({
        url: absoluteAppUrl(path),
        title,
        text: `${title} on OnSocial`,
      });
      if (result === 'copied') {
        setTxResult({ type: 'success', msg: 'Link copied.' });
      } else if (result === 'failed') {
        setTxResult({ type: 'error', msg: "Couldn't share this copy." });
      }
    },
    [setTxResult]
  );
  const sheetTitle = heldEditionSheetTitle(choose, editions[0]?.mediumKind);
  const heading = title.trim() || sheetTitle;
  const chooseEdition = onChoose
    ? (item: OwnedScarceItem) => {
        onClose();
        onChoose(item);
      }
    : undefined;

  return (
    <HeldEditionListCloseContext.Provider value={onClose}>
      <>
        <OsHugSheet
          open={open}
          onClose={onClose}
          label={sheetTitle}
          copy={heading}
          closeAriaLabel={
            choose === 'send' ? 'Close' : `Close ${sheetTitle.toLowerCase()}`
          }
          backdropLabel={
            choose === 'send' ? 'Close' : `Close ${sheetTitle.toLowerCase()}`
          }
          zIndex={SHEET_Z.list}
          panelClassName="collection-activity-sheet-panel os-sheet-cap-standard"
          bodyClassName="collection-activity-sheet-body"
        >
          <HeldEditionList
            editions={editions}
            choose={choose}
            renderOwnerMenu={renderOwnerMenu}
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
            onShare={(item) => {
              void shareEdition(item);
            }}
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
          title={
            historyItem
              ? heldEditionLabel(historyItem.tokenId, historyItem.mediumKind)
              : heading
          }
        />
        <HeldEditionFactsSheet
          item={factsItem}
          onClose={() => setFactsItem(null)}
        />
      </>
    </HeldEditionListCloseContext.Provider>
  );
}
