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
  ProfileAvatar,
  SheetCloseButton,
  ShopFillIcon,
  osIconActionClassName,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  fetchScarceCreatorEarnings,
  formatEarningKindSuffix,
  formatEarningsNear,
  type ScarceCreatorEarningRow,
} from '@/lib/scarce-creator-earnings';

interface PortfolioScarceEarningsSheetProps {
  open: boolean;
  accountId: string;
  totalLabel: string;
  onOpenChange: (open: boolean) => void;
}

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
        const name = profile?.displayName?.trim() || null;
        const label = name || `@${row.buyerId}`;
        const when = formatSaleWhen(row.blockTimestamp);
        const kindLabel = row.kind === 'royalty' ? 'Royalty' : 'Sale';
        const title = row.title.trim();
        return (
          <div key={row.key}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row portfolio-support-collect-info-row">
              <div className="standing-row-main">
                <Link
                  href={portfolioPath(row.buyerId)}
                  className="standing-row-avatar-slot"
                  scroll={false}
                  aria-label={label}
                >
                  <ProfileAvatar
                    src={profile?.avatarUrl ?? null}
                    fallbackInitial={name || row.buyerId}
                    size="md"
                  />
                </Link>
                <div className="standing-row-copy">
                  <Link
                    href={portfolioPath(row.buyerId)}
                    className="standing-row-head"
                    scroll={false}
                  >
                    <span className="standing-row-name-row">
                      <span className="standing-row-name">{label}</span>
                    </span>
                    {name ? (
                      <span className="standing-row-handle">
                        @{row.buyerId}
                      </span>
                    ) : null}
                  </Link>
                  <span className="portfolio-support-collect-info-row-kind">
                    {kindLabel}
                    {title ? (
                      <>
                        {' · '}
                        {row.postHref ? (
                          <Link
                            href={row.postHref}
                            scroll={false}
                            className="portfolio-scarce-earnings-post-link"
                          >
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </>
                    ) : null}
                    {formatEarningKindSuffix(row)}
                  </span>
                </div>
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
  onOpenChange,
}: PortfolioScarceEarningsSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [items, setItems] = useState<ScarceCreatorEarningRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
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
    setItems(null);
    setHasMore(false);
    setLoadError(null);
    void (async () => {
      try {
        const page = await fetchScarceCreatorEarnings(accountId, { limit: 40 });
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.items.length >= 40);
      } catch (cause) {
        if (cancelled) return;
        setItems([]);
        setHasMore(false);
        setLoadError(
          cause instanceof Error ? cause.message : 'Could not load scarce sales'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
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

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      moodId={mood?.id}
      initialDetent="full"
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close scarce earnings"
      bodyClassName="portfolio-support-collect-info-body"
      bodyRef={bodyRef}
      panelClassName="portfolio-support-collect-info-panel"
      panelStyle={panelStyle}
      header={
        <>
          <div className="standing-sheet-header portfolio-support-collect-info-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <p className="portfolio-payout-sheet-eyebrow">Scarce sales</p>
                  <h2 id={titleId} className="portfolio-payout-sheet-total">
                    {totalLabel}{' '}
                    <span className="portfolio-payout-sheet-unit">NEAR</span>
                  </h2>
                  <p className="portfolio-payout-sheet-sub">
                    Already in your wallet — no claim needed. Primary sales and
                    resale royalties pay you directly when the buyer confirms.
                  </p>
                </div>
              </div>
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
                  ariaLabel="Close scarce earnings"
                />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <section className="portfolio-support-collect-info-block">
        {loadError ? (
          <p className="portfolio-support-collect-info-empty">{loadError}</p>
        ) : items == null ? (
          <p className="portfolio-support-collect-info-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="portfolio-support-collect-info-empty">
            No scarce sales yet.
          </p>
        ) : (
          <EarningsList items={items} profiles={profiles} />
        )}
        {hasMore ? (
          <div
            ref={loadMoreRef}
            className="portfolio-support-collect-info-sentinel"
            aria-hidden
          />
        ) : null}
        {loadingMore ? (
          <p className="portfolio-support-collect-info-empty">Loading…</p>
        ) : null}
      </section>
    </GlassSheet>
  );
}
