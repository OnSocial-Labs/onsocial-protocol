'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Divider,
  GlassSheet,
  OsIconAction,
  ShopFillIcon,
  osHugSheetBodyClassName,
  osIconActionGlyphClassName,
  useScrollLock,
} from '@onsocial/ui';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { SheetChromeHeader } from '@/components/panels/sheet-chrome-header';
import { PortfolioPayoutKindFilters } from '@/components/portfolio/portfolio-payout-kind-filters';
import { standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  EARNINGS_KIND_LEGEND,
  fetchScarceCreatorEarnings,
  formatEarningKindSuffix,
  formatEarningsNear,
  scarceEarningsKindTotals,
  type ScarceCreatorEarningRow,
  type ScarceEarningKind,
} from '@/lib/scarce-creator-earnings';
import { SHEET_Z } from '@/lib/sheet-z';

interface PortfolioScarceEarningsSheetProps {
  open: boolean;
  accountId: string;
  totalLabel: string;
  /** Face-mark fetch — paint immediately; skip refetch while fresh. */
  initialItems?: ScarceCreatorEarningRow[];
  initialFetchedAt?: number;
  onOpenChange: (open: boolean) => void;
}

/** Skip refetch when face/cache seed is newer than this. */
const SALES_SEED_FRESH_MS = 30_000;

function formatSaleWhen(blockTimestamp: number): string {
  const ms =
    blockTimestamp > 1e15
      ? Math.floor(blockTimestamp / 1e6)
      : blockTimestamp > 1e12
        ? blockTimestamp
        : blockTimestamp * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function EarningsList({
  items,
  profiles,
}: {
  items: ScarceCreatorEarningRow[];
  profiles: Record<string, PostAuthorProfile>;
}) {
  return (
    <div className="standing-list portfolio-support-collect-info-list">
      {items.map((row, index) => {
        const profile = profiles[row.buyerId];
        const { label } = standingIdentityLabel(
          row.buyerId,
          profile?.displayName
        );
        const when = formatSaleWhen(row.blockTimestamp);
        const kindLabel = row.kind === 'royalty' ? 'Royalty' : 'Sale';
        const title = row.title.trim();
        const kindSuffix = formatEarningKindSuffix(row);
        return (
          <div key={row.key}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row portfolio-support-collect-info-row">
              <div className="standing-row-main">
                <Link
                  href={portfolioPath(row.buyerId)}
                  className="standing-row-hit"
                  scroll={false}
                  aria-label={`View ${label}'s profile`}
                />
                <StandingIdentity
                  accountId={row.buyerId}
                  profileName={profile?.displayName}
                  avatarUrl={profile?.avatarUrl}
                >
                  <span className="portfolio-support-collect-info-row-kind">
                    <span className="portfolio-scarce-earnings-kind-prefix">
                      {kindLabel}
                      {title ? ' · ' : ''}
                    </span>
                    {title ? (
                      row.postHref ? (
                        <Link
                          href={row.postHref}
                          scroll={false}
                          className="portfolio-scarce-earnings-kind-title portfolio-scarce-earnings-post-link"
                          title={title}
                        >
                          {title}
                        </Link>
                      ) : (
                        <span
                          className="portfolio-scarce-earnings-kind-title"
                          title={title}
                        >
                          {title}
                        </span>
                      )
                    ) : null}
                    {kindSuffix ? (
                      <span className="portfolio-scarce-earnings-kind-suffix">
                        {kindSuffix}
                      </span>
                    ) : null}
                  </span>
                </StandingIdentity>
              </div>
              <div className="standing-row-aside">
                {when ? (
                  <span className="standing-row-time">{when}</span>
                ) : null}
                <span className="portfolio-support-collect-info-amount portfolio-scarce-earnings-amount">
                  {formatEarningsNear(row.paymentYocto)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Owner scarce earnings — lifetime creator payments already sent to wallet.
 */
export function PortfolioScarceEarningsSheet({
  open,
  accountId,
  totalLabel,
  initialItems,
  initialFetchedAt = 0,
  onOpenChange,
}: PortfolioScarceEarningsSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [items, setItems] = useState<ScarceCreatorEarningRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<ScarceEarningKind | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  /** Last successful page — reopen shows rows instead of guessing skeleton count. */
  const cacheRef = useRef<{
    accountId: string;
    items: ScarceCreatorEarningRow[];
    hasMore: boolean;
    fetchedAt: number;
  } | null>(null);
  const sheetOpen = open && !closing;
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? null;
  const panelStyle = mood
    ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
    : undefined;

  useScrollLock(open || closing);

  const buyerIds = (items ?? []).map((row) => row.buyerId);
  const profiles = usePostAuthorProfiles(buyerIds);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Face fetch (even empty) seeds when fetchedAt is set.
    const seed =
      initialFetchedAt > 0 && initialItems != null ? initialItems : null;
    const cached =
      cacheRef.current?.accountId === accountId ? cacheRef.current : null;
    const warmItems = seed ?? cached?.items ?? null;
    const warmHasMore = seed
      ? seed.length >= 40
      : Boolean(cached?.hasMore);
    const warmAt = seed
      ? initialFetchedAt
      : (cached?.fetchedAt ?? 0);

    if (warmItems) {
      setItems(warmItems);
      setHasMore(warmHasMore);
      if (seed) {
        cacheRef.current = {
          accountId,
          items: seed,
          hasMore: warmHasMore,
          fetchedAt: initialFetchedAt,
        };
      }
    } else {
      setItems(null);
      setHasMore(false);
    }
    setLoadError(null);
    setKindFilter(null);

    const fresh =
      warmItems != null &&
      warmAt > 0 &&
      Date.now() - warmAt < SALES_SEED_FRESH_MS;
    if (fresh) {
      return;
    }

    void (async () => {
      try {
        const page = await fetchScarceCreatorEarnings(accountId, { limit: 40 });
        if (cancelled) return;
        const hasMoreNext = page.items.length >= 40;
        setItems(page.items);
        setHasMore(hasMoreNext);
        cacheRef.current = {
          accountId,
          items: page.items,
          hasMore: hasMoreNext,
          fetchedAt: Date.now(),
        };
      } catch (cause) {
        if (cancelled) return;
        if (!warmItems) {
          setItems([]);
          setHasMore(false);
        }
        setLoadError(
          cause instanceof Error ? cause.message : 'Could not load scarce sales'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // initialItems only seeds paint — omit from deps so parent refresh doesn’t remount mid-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/accountId gate
  }, [accountId, open]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || !items) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchScarceCreatorEarnings(accountId, {
        limit: 40,
        offset: items.length,
      });
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((row) => row.key));
        const next = page.items.filter((row) => !seen.has(row.key));
        return next.length ? [...(prev ?? []), ...next] : (prev ?? []);
      });
      setHasMore(page.items.length >= 40);
    } catch {
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [accountId, hasMore, items]);

  useInfiniteScrollSentinel({
    scrollRootRef: bodyRef,
    sentinelRef: loadMoreRef,
    enabled:
      sheetOpen && hasMore && !loadingMore && items != null && !loadError,
    onIntersect: () => {
      void loadMore();
    },
    rootMargin: '120px 0px',
  });

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const kindTotals =
    items && items.length > 0 ? scarceEarningsKindTotals(items) : [];
  const filteredItems =
    items == null
      ? null
      : kindFilter
        ? items.filter((row) => row.kind === kindFilter)
        : items;
  const kindFilterLabel = kindFilter
    ? (EARNINGS_KIND_LEGEND.find((entry) => entry.kind === kindFilter)?.label ??
      kindFilter)
    : null;

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      sizing="hug"
      moodId={mood?.id}
      initialDetent="full"
      zIndex={SHEET_Z.gesture}
      ariaLabelledBy={titleId}
      backdropLabel="Close scarce earnings"
      bodyClassName={`portfolio-support-collect-info-body ${osHugSheetBodyClassName}`}
      bodyRef={bodyRef}
      panelClassName="portfolio-support-collect-info-panel os-sheet-cap-standard"
      panelStyle={panelStyle}
      header={
        <SheetChromeHeader
          className="portfolio-support-collect-info-header"
          actionsClassName="standing-sheet-actions--payout"
          actions={
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
          }
          onClose={requestClose}
          closeAriaLabel="Close scarce earnings"
        >
          <div className="standing-sheet-subject">
            <div className="standing-sheet-subject-copy">
              <p className="portfolio-payout-sheet-eyebrow">Scarce sales</p>
              <h2 id={titleId} className="portfolio-payout-sheet-total">
                {totalLabel}{' '}
                <span className="portfolio-payout-sheet-unit">NEAR</span>
              </h2>
              {kindTotals.length > 0 ? (
                <PortfolioPayoutKindFilters
                  parts={kindTotals.map((entry) => ({
                    id: entry.kind,
                    label: entry.label,
                    amountLabel: entry.amountLabel,
                  }))}
                  active={kindFilter}
                  onChange={setKindFilter}
                  ariaLabel="Filter scarce sales by kind"
                />
              ) : null}
            </div>
          </div>
        </SheetChromeHeader>
      }
    >
      <section className="portfolio-support-collect-info-block">
        {loadError ? (
          <p className="portfolio-support-collect-info-empty">{loadError}</p>
        ) : items == null || filteredItems == null ? (
          <ProfileSocialListSkeleton count={3} />
        ) : items.length === 0 ? (
          <p className="portfolio-support-collect-info-empty">
            No scarce sales yet.
          </p>
        ) : filteredItems.length === 0 ? (
          <p className="portfolio-support-collect-info-empty">
            No {kindFilterLabel ?? 'earnings'} yet.
          </p>
        ) : (
          <EarningsList items={filteredItems} profiles={profiles} />
        )}
        {hasMore ? (
          <div
            ref={loadMoreRef}
            className="portfolio-support-collect-info-sentinel"
            aria-hidden
          />
        ) : null}
        {loadingMore ? (
          <ProfileSocialListSkeleton count={3} variant="append" />
        ) : null}
      </section>
    </GlassSheet>
  );
}
