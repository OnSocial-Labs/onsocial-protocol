'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from 'react';
import {
  Divider,
  GlassSheet,
  OsSheetAction,
  OsSheetActions,
  SheetCloseButton,
  SheetHeader,
  ShopFillIcon,
  TimeFillIcon,
  osIconActionClassName,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  executeListingAction,
  fetchListingActions,
  listingActionOpensBidSheet,
  listingActionPendingLabel,
  listingActionPrimaryLabel,
  listingActionRowMeta,
  listingActionSectionTitle,
  listingActionTimeLabel,
  type ListingActionItem,
  type ListingActionKind,
} from '@/features/scarces/listing-actions';
import {
  ScarceBidSheet,
  type ScarceBidListing,
} from '@/features/scarces/scarce-bid-sheet';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import { fallbackLabel } from '@/lib/profile-display';
import { txToastError } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface PortfolioListingActionsSheetProps {
  open: boolean;
  accountId: string;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful action so the pill can refresh. */
  onActionsChanged?: () => void;
}

function bidListingFromAction(item: ListingActionItem): ScarceBidListing | null {
  if (!item.tokenId || !listingActionOpensBidSheet(item.kind)) return null;
  const postHref = postHrefFromSourcePath(item.sourcePostPath);
  return {
    tokenId: item.tokenId,
    title: item.title,
    mediaUrl: item.mediaUrl,
    sellerId: item.sellerId,
    ...(item.priceNear ? { priceNear: item.priceNear } : {}),
    ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
    ...(postHref ? { postHref } : {}),
    ...(item.listedAtMs != null && item.listedAtMs > 0
      ? { listedAtMs: item.listedAtMs }
      : {}),
  };
}

function ActionRow({
  item,
  pending,
  onAction,
  onOpenDetail,
}: {
  item: ListingActionItem;
  pending: boolean;
  onAction: (item: ListingActionItem) => void;
  onOpenDetail: (item: ListingActionItem) => void;
}) {
  const meta = listingActionRowMeta(item);
  const time = listingActionTimeLabel(item);
  const seller =
    item.kind === 'collect_win' ? `@${fallbackLabel(item.sellerId)}` : null;
  const opensDetail = listingActionOpensBidSheet(item.kind) && Boolean(item.tokenId);

  const body = (
    <>
      <div
        className={`market-listing-thumb portfolio-listing-action-thumb${
          item.mediaUrl ? ' has-media' : ''
        }`}
        aria-hidden
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </div>
      <div className="standing-row-copy portfolio-listing-action-copy">
        <span className="standing-row-name">{item.title}</span>
        {meta ? (
          <span className="portfolio-support-collect-info-row-kind">{meta}</span>
        ) : null}
        {seller ? (
          <span className="standing-row-handle portfolio-listing-action-seller">
            {seller}
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="standing-row portfolio-support-collect-info-row portfolio-listing-action-row">
      {opensDetail ? (
        <button
          type="button"
          className="portfolio-listing-action-hit"
          disabled={pending}
          onClick={() => onOpenDetail(item)}
          aria-label={`Open ${item.title}`}
        >
          {body}
        </button>
      ) : (
        <div className="portfolio-listing-action-hit">{body}</div>
      )}
      <div className="standing-row-aside portfolio-listing-action-aside">
        {time ? (
          <span className="standing-row-time" aria-label={time}>
            {time}
          </span>
        ) : null}
        <OsSheetActions
          layout="row-compact"
          tone="frosted-primary"
          borderless
          className="market-listing-action portfolio-listing-action-cta"
        >
          <OsSheetAction
            type="button"
            variant={
              item.kind === 'cancel_auction' ||
              item.kind === 'delist' ||
              item.kind === 'cancel_lazy'
                ? 'ghost'
                : 'primary'
            }
            ready={!pending}
            pending={pending}
            pendingLabel={listingActionPendingLabel(item.kind)}
            disabled={pending}
            onClick={() => onAction(item)}
          >
            {listingActionPrimaryLabel(item.kind)}
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </div>
  );
}

function groupItems(items: ListingActionItem[]): {
  title: string;
  kind: ListingActionKind;
  items: ListingActionItem[];
}[] {
  const collect = items.filter((item) => item.kind === 'collect_win');
  const complete = items.filter((item) => item.kind === 'complete_sale');
  const manage = items.filter(
    (item) =>
      item.kind === 'cancel_auction' ||
      item.kind === 'delist' ||
      item.kind === 'cancel_lazy'
  );
  return [
    ...(collect.length
      ? [
          {
            title: listingActionSectionTitle('collect_win'),
            kind: 'collect_win' as const,
            items: collect,
          },
        ]
      : []),
    ...(complete.length
      ? [
          {
            title: listingActionSectionTitle('complete_sale'),
            kind: 'complete_sale' as const,
            items: complete,
          },
        ]
      : []),
    ...(manage.length
      ? [
          {
            title: listingActionSectionTitle('delist'),
            kind: 'delist' as const,
            items: manage,
          },
        ]
      : []),
  ];
}

/**
 * Owner drawer — quiet header, standing-style time above CTA, Market bid sheet
 * for collect / complete.
 */
export function PortfolioListingActionsSheet({
  open,
  accountId,
  onOpenChange,
  onActionsChanged,
}: PortfolioListingActionsSheetProps) {
  const titleId = useId();
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [items, setItems] = useState<ListingActionItem[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bidListing, setBidListing] = useState<ScarceBidListing | null>(null);
  const [focusActionId, setFocusActionId] = useState<string | null>(null);
  const sheetOpen = open && !closing;
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? null;
  const panelStyle = mood
    ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
    : undefined;

  useScrollLock(open || closing);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setBidListing(null);
    setFocusActionId(null);
    void fetchListingActions(accountId).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
      },
      () => {
        if (cancelled) return;
        setLoadError('Couldn’t load listing actions.');
        setItems([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const removeAction = useCallback(
    (actionId: string) => {
      const remaining = (items ?? []).filter((row) => row.id !== actionId);
      setItems(remaining);
      onActionsChanged?.();
      if (remaining.length === 0) requestClose();
    },
    [items, onActionsChanged, requestClose]
  );

  const handleOpenDetail = useCallback((item: ListingActionItem) => {
    const listing = bidListingFromAction(item);
    if (!listing) return;
    setFocusActionId(item.id);
    setBidListing(listing);
  }, []);

  const handleBidSettled = useCallback(() => {
    const actionId = focusActionId;
    setBidListing(null);
    setFocusActionId(null);
    if (actionId) removeAction(actionId);
  }, [focusActionId, removeAction]);

  const handleAction = useCallback(
    async (item: ListingActionItem) => {
      if (pendingId) return;
      setPendingId(item.id);
      try {
        const { accountId: signer, wallet } = await getSigningWallet();
        const confirmed = await executeListingAction({
          item,
          accountId: signer,
          wallet,
          trackTransaction,
        });
        if (!confirmed) return;
        removeAction(item.id);
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.cancelScarceListingFailed,
        });
      } finally {
        setPendingId(null);
      }
    },
    [getSigningWallet, pendingId, removeAction, setTxResult, trackTransaction]
  );

  const sections = items ? groupItems(items) : [];
  const count = items?.length ?? 0;
  const subtitle =
    items == null
      ? undefined
      : count === 0
        ? 'Nothing pending'
        : count === 1
          ? '1 needs attention'
          : `${count} need attention`;

  return (
    <>
      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        tone="os"
        sizing="hug"
        moodId={mood?.id}
        initialDetent="full"
        zIndex={56}
        ariaLabelledBy={titleId}
        backdropLabel="Close listing actions"
        bodyClassName="portfolio-support-collect-info-body"
        panelClassName="portfolio-support-collect-info-panel"
        panelStyle={panelStyle}
        header={
          <>
            <SheetHeader
              titleId={titleId}
              title="Listings"
              subtitle={subtitle}
              actions={
                <div className="standing-sheet-actions standing-sheet-actions--payout">
                  <Link
                    href={APP_MARKET_PATH}
                    className={osIconActionClassName}
                    scroll={false}
                    onClick={requestClose}
                    aria-label="Open Market"
                  >
                    <ShopFillIcon
                      className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                      aria-hidden
                    />
                  </Link>
                  <SheetCloseButton
                    onClick={requestClose}
                    ariaLabel="Close listing actions"
                  />
                </div>
              }
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
      >
        <section className="portfolio-support-collect-info-block">
          {loadError ? (
            <p className="portfolio-support-collect-info-empty">{loadError}</p>
          ) : items == null ? (
            <p className="portfolio-support-collect-info-empty">Loading…</p>
          ) : sections.length === 0 ? (
            <p className="portfolio-support-collect-info-empty">
              Nothing needs your attention right now.
            </p>
          ) : (
            sections.map((section) => (
              <div
                key={section.title}
                className="portfolio-listing-action-section"
              >
                <p className="portfolio-support-collect-info-section-note">
                  {section.title}
                </p>
                <div className="standing-list portfolio-support-collect-info-list">
                  {section.items.map((item, index) => (
                    <div key={item.id}>
                      {index > 0 ? <Divider variant="item" /> : null}
                      <ActionRow
                        item={item}
                        pending={pendingId === item.id}
                        onAction={(row) => {
                          void handleAction(row);
                        }}
                        onOpenDetail={handleOpenDetail}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </GlassSheet>

      <ScarceBidSheet
        open={bidListing != null}
        listing={bidListing}
        zIndex={58}
        onOpenChange={(next) => {
          if (!next) {
            setBidListing(null);
            setFocusActionId(null);
          }
        }}
        onBid={handleBidSettled}
      />
    </>
  );
}

/** Identity-row mark — Time icon + count when listing actions exist. */
export function PortfolioListingActionsMark({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      className="portfolio-identity-gesture portfolio-identity-gesture--payout group"
      onClick={onOpen}
      aria-label={`${count} listing ${count === 1 ? 'action' : 'actions'} needed`}
    >
      <span className="signal-group signal-group-endorse" aria-hidden>
        <span className="portfolio-payout-mark-icon portfolio-payout-mark-icon--actions portfolio-payout-mark-icon--nudge">
          <TimeFillIcon className="portfolio-payout-mark-svg" />
        </span>
      </span>
      <span className="portfolio-payout-mark-amount">{count}</span>
    </button>
  );
}
