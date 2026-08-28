'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Divider,
  OsHugSheet,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  SheetCloseButton,
  ShopFillIcon,
  TimeFillIcon,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import {
  executeListingAction,
  fetchListingActions,
  listingActionConfirmLabel,
  listingActionNeedsConfirm,
  listingActionOpensBidSheet,
  listingActionOpensBuySheet,
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
import {
  ScarceBuySheet,
  type ScarceBuyListing,
} from '@/features/scarces/scarce-buy-sheet';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import { fallbackLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';
import { txToastError } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/** Match Market owned-row Delist arm window. */
const CONFIRM_LEAVE_MS = 4_000;
/** Skip refetch when face/cache seed is newer than this. */
const LISTINGS_SEED_FRESH_MS = 30_000;

interface PortfolioListingActionsSheetProps {
  open: boolean;
  accountId: string;
  onOpenChange: (open: boolean) => void;
  /** Face-mark fetch — paint immediately; skip refetch while fresh. */
  initialItems?: ListingActionItem[];
  initialFetchedAt?: number;
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

function buyListingFromAction(item: ListingActionItem): ScarceBuyListing | null {
  if (!listingActionOpensBuySheet(item.kind)) return null;
  const postHref = postHrefFromSourcePath(item.sourcePostPath);
  const collectionId = item.tokenId
    ? collectionIdFromTokenId(item.tokenId)
    : null;

  if (item.kind === 'delist' && item.tokenId) {
    return {
      tokenId: item.tokenId,
      status: 'listed',
      title: item.title,
      mediaUrl: item.mediaUrl,
      creatorId: item.sellerId,
      ...(item.priceNear ? { priceNear: item.priceNear } : {}),
      ...(collectionId ? { collectionId } : {}),
      ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
      ...(postHref ? { postHref } : {}),
      ...(item.listedAtMs != null && item.listedAtMs > 0
        ? { listedAtMs: item.listedAtMs }
        : {}),
      alreadyOwnsEdition: true,
    };
  }

  if (item.kind === 'cancel_lazy' && item.listingId) {
    return {
      listingId: item.listingId,
      status: 'lazy_listing',
      title: item.title,
      mediaUrl: item.mediaUrl,
      creatorId: item.sellerId,
      ...(item.priceNear ? { priceNear: item.priceNear } : {}),
      ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
      ...(postHref ? { postHref } : {}),
      ...(item.listedAtMs != null && item.listedAtMs > 0
        ? { listedAtMs: item.listedAtMs }
        : {}),
    };
  }

  return null;
}

function ActionRow({
  item,
  pending,
  confirming,
  onAction,
  onOpenDetail,
  onClearConfirm,
}: {
  item: ListingActionItem;
  pending: boolean;
  confirming: boolean;
  onAction: (item: ListingActionItem) => void;
  onOpenDetail: (item: ListingActionItem) => void;
  onClearConfirm: () => void;
}) {
  const meta = listingActionRowMeta(item);
  const time = listingActionTimeLabel(item);
  const seller =
    item.kind === 'collect_win' ? `@${fallbackLabel(item.sellerId)}` : null;
  const opensDetail =
    (listingActionOpensBidSheet(item.kind) && Boolean(item.tokenId)) ||
    (listingActionOpensBuySheet(item.kind) &&
      Boolean(item.tokenId || item.listingId));
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
          aria-label={`Open listing ${item.title}`}
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
          size="sm"
          borderless
          className="market-listing-action portfolio-listing-action-cta"
        >
          <OsSheetAction
            type="button"
            variant={confirming ? 'danger' : 'primary'}
            ready={!pending}
            pending={pending}
            pendingLabel={listingActionPendingLabel(item.kind)}
            disabled={pending}
            aria-label={
              pending
                ? listingActionPendingLabel(item.kind)
                : confirming
                  ? `Confirm ${listingActionPrimaryLabel(item.kind).toLowerCase()}`
                  : listingActionPrimaryLabel(item.kind)
            }
            onClick={() => onAction(item)}
            onBlur={confirming ? onClearConfirm : undefined}
          >
            {confirming
              ? listingActionConfirmLabel(item.kind)
              : listingActionPrimaryLabel(item.kind)}
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
    ...(collect.length > 0
      ? [
          {
            title: listingActionSectionTitle('collect_win'),
            kind: 'collect_win' as const,
            items: collect,
          },
        ]
      : []),
    ...(complete.length > 0
      ? [
          {
            title: listingActionSectionTitle('complete_sale'),
            kind: 'complete_sale' as const,
            items: complete,
          },
        ]
      : []),
    ...(manage.length > 0
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
 * Owner drawer — quiet header, standing-style time above CTA, Market buy/bid
 * sheets for the live listing; two-press Delist/Cancel like Market.
 */
export function PortfolioListingActionsSheet({
  open,
  accountId,
  onOpenChange,
  initialItems,
  initialFetchedAt = 0,
  onActionsChanged,
}: PortfolioListingActionsSheetProps) {
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [items, setItems] = useState<ListingActionItem[] | null>(null);
  const cacheRef = useRef<{
    accountId: string;
    items: ListingActionItem[];
    fetchedAt: number;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bidListing, setBidListing] = useState<ScarceBidListing | null>(null);
  const [buyListing, setBuyListing] = useState<ScarceBuyListing | null>(null);
  const [focusActionId, setFocusActionId] = useState<string | null>(null);
  const sheetOpen = open && !closing;
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? null;
  const panelStyle = mood
    ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
    : undefined;

  const clearConfirm = useCallback(() => {
    if (confirmTimerRef.current != null) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmId(null);
  }, []);

  const armConfirm = useCallback(
    (actionId: string) => {
      clearConfirm();
      setConfirmId(actionId);
      confirmTimerRef.current = window.setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmId(null);
      }, CONFIRM_LEAVE_MS);
    },
    [clearConfirm]
  );

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current != null) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Face fetch (even empty) seeds when fetchedAt is set.
    const seed =
      initialFetchedAt > 0 && initialItems != null ? initialItems : null;
    const cached =
      cacheRef.current?.accountId === accountId ? cacheRef.current : null;
    const warm = seed ?? cached?.items ?? null;
    const warmAt = seed
      ? initialFetchedAt
      : (cached?.fetchedAt ?? 0);
    if (warm) {
      setItems(warm);
      if (seed) {
        cacheRef.current = {
          accountId,
          items: seed,
          fetchedAt: initialFetchedAt,
        };
      }
    } else {
      setItems(null);
    }
    setLoadError(null);
    setBidListing(null);
    setBuyListing(null);
    setFocusActionId(null);
    clearConfirm();

    const fresh =
      warm != null &&
      warmAt > 0 &&
      Date.now() - warmAt < LISTINGS_SEED_FRESH_MS;
    if (fresh) {
      return;
    }

    void fetchListingActions(accountId).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
        cacheRef.current = {
          accountId,
          items: page.items,
          fetchedAt: Date.now(),
        };
      },
      () => {
        if (cancelled) return;
        if (!warm) {
          setLoadError('Couldn’t load listing actions.');
          setItems([]);
        }
      }
    );
    return () => {
      cancelled = true;
    };
    // initialItems only seeds paint — omit from deps so parent refresh doesn’t remount mid-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/accountId gate
  }, [open, accountId, clearConfirm]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    clearConfirm();
    onOpenChange(false);
  }, [clearConfirm, onOpenChange]);

  const removeAction = useCallback(
    (actionId: string) => {
      const remaining = (items ?? []).filter((row) => row.id !== actionId);
      setItems(remaining);
      cacheRef.current = {
        accountId,
        items: remaining,
        fetchedAt: Date.now(),
      };
      onActionsChanged?.();
      if (remaining.length === 0) requestClose();
    },
    [accountId, items, onActionsChanged, requestClose]
  );

  const handleOpenDetail = useCallback((item: ListingActionItem) => {
    clearConfirm();
    if (listingActionOpensBuySheet(item.kind)) {
      const listing = buyListingFromAction(item);
      if (!listing) return;
      setFocusActionId(item.id);
      setBuyListing(listing);
      return;
    }
    const listing = bidListingFromAction(item);
    if (!listing) return;
    setFocusActionId(item.id);
    setBidListing(listing);
  }, [clearConfirm]);

  const handleBidSettled = useCallback(() => {
    const actionId = focusActionId;
    setBidListing(null);
    setFocusActionId(null);
    if (actionId) removeAction(actionId);
  }, [focusActionId, removeAction]);

  const handleAction = useCallback(
    async (item: ListingActionItem) => {
      if (pendingId) return;
      if (listingActionNeedsConfirm(item.kind)) {
        if (confirmId !== item.id) {
          armConfirm(item.id);
          return;
        }
        clearConfirm();
      }
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
    [
      armConfirm,
      clearConfirm,
      confirmId,
      getSigningWallet,
      pendingId,
      removeAction,
      setTxResult,
      trackTransaction,
    ]
  );

  const sections = items ? groupItems(items) : [];
  // Count lives on the face mark (the clickable control). Don't repeat
  // "N need attention" as inert header copy — reads like a dead button.
  const subtitle =
    items != null && items.length === 0 ? 'Nothing pending' : undefined;

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        label="Listings"
        {...(subtitle ? { copy: subtitle } : {})}
        closeAriaLabel="Close listing actions"
        backdropLabel="Close listing actions"
        zIndex={SHEET_Z.gesture}
        {...(mood?.id ? { moodId: mood.id } : {})}
        bodyClassName="portfolio-support-collect-info-body"
        panelClassName="portfolio-support-collect-info-panel os-sheet-cap-standard"
        {...(panelStyle ? { panelStyle } : {})}
        headerActions={
          <div className="standing-sheet-actions standing-sheet-actions--payout">
            <OsIconAction asChild ariaLabel="Open Market">
              <Link
                href={APP_MARKET_PATH}
                scroll={false}
                onClick={requestClose}
              >
                <ShopFillIcon
                  className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                  aria-hidden
                />
              </Link>
            </OsIconAction>
            <SheetCloseButton
              onClick={requestClose}
              ariaLabel="Close listing actions"
            />
          </div>
        }
      >
        <section className="portfolio-support-collect-info-block">
          {loadError ? (
            <p className="portfolio-support-collect-info-empty">{loadError}</p>
          ) : items == null ? (
            <ProfileSocialListSkeleton count={2} />
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
                {section.title ? (
                  <p className="portfolio-support-collect-info-section-note">
                    {section.title}
                  </p>
                ) : null}
                <div className="standing-list portfolio-support-collect-info-list">
                  {section.items.map((item, index) => (
                    <div key={item.id}>
                      {index > 0 ? <Divider variant="item" /> : null}
                      <ActionRow
                        item={item}
                        pending={pendingId === item.id}
                        confirming={
                          confirmId === item.id && pendingId !== item.id
                        }
                        onAction={(row) => {
                          void handleAction(row);
                        }}
                        onOpenDetail={handleOpenDetail}
                        onClearConfirm={clearConfirm}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </OsHugSheet>

      <ScarceBidSheet
        open={bidListing != null}
        listing={bidListing}
        zIndex={SHEET_Z.list}
        onOpenChange={(next) => {
          if (!next) {
            setBidListing(null);
            setFocusActionId(null);
          }
        }}
        onBid={handleBidSettled}
      />

      <ScarceBuySheet
        open={buyListing != null}
        listing={buyListing}
        alreadyOwnsEdition
        zIndex={SHEET_Z.list}
        onOpenChange={(next) => {
          if (!next) {
            setBuyListing(null);
            setFocusActionId(null);
          }
        }}
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
      aria-label={
        count === 1
          ? '1 listing needs attention — open'
          : `${count} listings need attention — open`
      }
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
