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
  ChevronDownIcon,
  Divider,
  GlassSheet,
  osHugSheetBodyClassName,
  useScrollLock,
} from '@onsocial/ui';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { SheetChromeHeader } from '@/components/panels/sheet-chrome-header';
import { PortfolioPayoutKindFilters } from '@/components/portfolio/portfolio-payout-kind-filters';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import { APP_COLLECT_ACTION_LABEL } from '@/lib/app-reward-constants';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  SUPPORT_POT_LEGEND,
  sumSupportReceivedYocto,
  supportPotActionLabel,
  supportReceivedKindTotals,
  type ProfileSupportReceivedHistoryPage,
  type ProfileSupportReceivedSummary,
} from '@/lib/profile-support-received';
import { SHEET_Z } from '@/lib/sheet-z';
import type { SupportPotAction, SupportReceivedRow } from '@onsocial/sdk';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';

interface PortfolioSupportCollectInfoSheetProps {
  open: boolean;
  accountId: string;
  claimableLabel: string;
  collectPending?: boolean;
  onCollect?: () => void;
  onOpenChange: (open: boolean) => void;
}

function formatSupportWhen(blockTimestamp: number): string {
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

function SupportCreditList({
  items,
  profiles,
}: {
  items: SupportReceivedRow[];
  profiles: Record<string, PostAuthorProfile>;
}) {
  return (
    <div className="standing-list portfolio-support-collect-info-list">
      {items.map((row, index) => {
        const profile = profiles[row.spenderId];
        const when = formatSupportWhen(row.blockTimestamp);
        const kind = supportPotActionLabel(row.action);
        return (
          <div
            key={`${row.spenderId}-${row.action}-${row.blockHeight}-${row.blockTimestamp}-${index}`}
          >
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row portfolio-support-collect-info-row">
              <Link
                href={portfolioPath(row.spenderId)}
                className="standing-row-main"
                scroll={false}
              >
                <StandingIdentity
                  accountId={row.spenderId}
                  profileName={profile?.displayName}
                  avatarUrl={profile?.avatarUrl}
                >
                  <span className="portfolio-support-collect-info-row-kind">
                    {kind}
                  </span>
                </StandingIdentity>
              </Link>
              <div className="standing-row-aside">
                {when ? (
                  <span className="standing-row-time">{when}</span>
                ) : null}
                <span className="portfolio-support-collect-info-amount">
                  {formatSocialCompact(row.amountYocto)} SOCIAL
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
 * Owner support drawer — Collect CTA, current pot credits, earlier history.
 */
export function PortfolioSupportCollectInfoSheet({
  open,
  accountId,
  claimableLabel,
  collectPending = false,
  onCollect,
  onOpenChange,
}: PortfolioSupportCollectInfoSheetProps) {
  const titleId = useId();
  const earlierPanelId = useId();
  const [closing, setClosing] = useState(false);
  const [current, setCurrent] = useState<SupportReceivedRow[] | null>(null);
  const [history, setHistory] = useState<SupportReceivedRow[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<SupportPotAction | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const historyLoadingRef = useRef(false);
  const sheetOpen = open && !closing;
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? null;
  const panelStyle = mood
    ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
    : undefined;

  useScrollLock(open || closing);

  const spenderIds = [
    ...(current ?? []).map((row) => row.spenderId),
    ...(earlierOpen ? history.map((row) => row.spenderId) : []),
  ];
  const profiles = usePostAuthorProfiles(spenderIds);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCurrent(null);
    setHistory([]);
    setHistoryHasMore(false);
    setEarlierOpen(false);
    setLoadError(null);
    setKindFilter(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/profile/support-received?accountId=${encodeURIComponent(accountId)}`,
          { cache: 'no-store' }
        );
        const body = (await response.json().catch(() => null)) as
          | ProfileSupportReceivedSummary
          | { error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(
            body && 'error' in body && body.error
              ? body.error
              : 'Could not load support history'
          );
        }
        const summary = body as ProfileSupportReceivedSummary;
        setCurrent(summary.current);
        setHistory(summary.history);
        setHistoryHasMore(summary.historyHasMore);
      } catch (cause) {
        if (cancelled) return;
        setCurrent([]);
        setHistory([]);
        setHistoryHasMore(false);
        setLoadError(
          cause instanceof Error
            ? cause.message
            : 'Could not load support history'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, open]);

  const loadMoreHistory = useCallback(async () => {
    if (historyLoadingRef.current || !historyHasMore) return;
    const oldest = history[history.length - 1];
    if (!oldest?.blockHeight) return;

    historyLoadingRef.current = true;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        accountId,
        section: 'history',
        beforeBlockHeight: String(oldest.blockHeight),
      });
      const response = await fetch(
        `/api/profile/support-received?${params.toString()}`,
        { cache: 'no-store' }
      );
      const body = (await response.json().catch(() => null)) as
        | ProfileSupportReceivedHistoryPage
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body && 'error' in body && body.error
            ? body.error
            : 'Could not load earlier support'
        );
      }
      const page = body as ProfileSupportReceivedHistoryPage;
      setHistory((prev) => {
        const seen = new Set(
          prev.map(
            (row) => `${row.blockHeight}:${row.spenderId}:${row.amountYocto}`
          )
        );
        const next = page.items.filter(
          (row) =>
            !seen.has(`${row.blockHeight}:${row.spenderId}:${row.amountYocto}`)
        );
        return next.length ? [...prev, ...next] : prev;
      });
      setHistoryHasMore(page.hasMore);
    } catch {
      setHistoryHasMore(false);
    } finally {
      historyLoadingRef.current = false;
      setHistoryLoading(false);
    }
  }, [accountId, history, historyHasMore]);

  useInfiniteScrollSentinel({
    scrollRootRef: bodyRef,
    sentinelRef: loadMoreRef,
    enabled:
      sheetOpen &&
      earlierOpen &&
      historyHasMore &&
      !historyLoading &&
      current != null &&
      !loadError,
    onIntersect: () => {
      void loadMoreHistory();
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

  const showEarlier = current != null && (history.length > 0 || historyHasMore);
  const kindTotals =
    current && current.length > 0
      ? supportReceivedKindTotals(current, formatSocialCompact)
      : [];
  const filteredCurrent =
    current == null
      ? null
      : kindFilter
        ? current.filter((row) => row.action === kindFilter)
        : current;
  const filteredHistory = kindFilter
    ? history.filter((row) => row.action === kindFilter)
    : history;
  const kindFilterLabel = kindFilter
    ? (SUPPORT_POT_LEGEND.find((entry) => entry.action === kindFilter)?.label ??
      kindFilter)
    : null;
  const earlierTotalYocto = sumSupportReceivedYocto(history);
  const earlierCountLabel = historyHasMore
    ? `${history.length}+`
    : String(history.length);
  const earlierSummaryAmount =
    earlierTotalYocto > 0n
      ? `${formatSocialCompact(earlierTotalYocto.toString())} SOCIAL`
      : null;

  const footerState = ((): CommerceSheetFooterState | null => {
    if (!onCollect) return null;
    return {
      visible: true,
      primaryLabel: APP_COLLECT_ACTION_LABEL,
      primaryPendingLabel: 'Collecting…',
      canSubmit: !collectPending,
      pending: collectPending,
      disabled: collectPending,
      primaryType: 'button',
      onPrimaryClick: onCollect,
    };
  })();

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
      backdropLabel="Close support"
      bodyClassName={`portfolio-support-collect-info-body ${osHugSheetBodyClassName}`}
      bodyRef={bodyRef}
      panelClassName="portfolio-support-collect-info-panel os-sheet-cap-standard"
      panelStyle={panelStyle}
      header={
        <SheetChromeHeader
          className="portfolio-support-collect-info-header"
          onClose={requestClose}
          closeAriaLabel="Close support"
        >
          <div className="standing-sheet-subject">
            <div className="standing-sheet-subject-copy">
              <p className="portfolio-payout-sheet-eyebrow">Support</p>
              <h2 id={titleId} className="portfolio-payout-sheet-total">
                {claimableLabel}{' '}
                <span className="portfolio-payout-sheet-unit">SOCIAL</span>
              </h2>
              {kindTotals.length > 0 ? (
                <PortfolioPayoutKindFilters
                  parts={kindTotals.map((entry) => ({
                    id: entry.action,
                    label: entry.label,
                    amountLabel: entry.amountLabel,
                  }))}
                  active={kindFilter}
                  onChange={setKindFilter}
                  ariaLabel="Filter support by kind"
                />
              ) : null}
            </div>
          </div>
        </SheetChromeHeader>
      }
      footer={
        footerState ? (
          <CommerceSheetFooter
            formId="portfolio-support-collect"
            keyboardOpen={false}
            state={footerState}
          />
        ) : undefined
      }
    >
      <section className="portfolio-support-collect-info-block">
        {loadError ? (
          <p className="portfolio-support-collect-info-empty">{loadError}</p>
        ) : current == null || filteredCurrent == null ? (
          <ProfileSocialListSkeleton count={5} />
        ) : current.length === 0 ? (
          <p className="portfolio-support-collect-info-empty">
            No credits in this pot yet.
          </p>
        ) : filteredCurrent.length === 0 ? (
          <p className="portfolio-support-collect-info-empty">
            No {kindFilterLabel ?? 'credits'} in this pot.
          </p>
        ) : (
          <SupportCreditList items={filteredCurrent} profiles={profiles} />
        )}
      </section>

      {showEarlier ? (
        <section className="portfolio-support-collect-info-block">
          <button
            type="button"
            className={`portfolio-support-collect-earlier-toggle${
              earlierOpen ? ' is-open' : ''
            }`}
            aria-expanded={earlierOpen}
            aria-controls={earlierPanelId}
            onClick={() => setEarlierOpen((open) => !open)}
          >
            <span className="portfolio-support-collect-earlier-label">
              Earlier
              <span className="portfolio-support-collect-earlier-meta">
                {earlierSummaryAmount
                  ? ` · ${earlierSummaryAmount} · ${earlierCountLabel}`
                  : ` · ${earlierCountLabel}`}
              </span>
            </span>
            <ChevronDownIcon
              className="portfolio-support-collect-earlier-chevron"
              aria-hidden
            />
          </button>

          {earlierOpen ? (
            <div id={earlierPanelId}>
              {filteredHistory.length > 0 ? (
                <SupportCreditList
                  items={filteredHistory}
                  profiles={profiles}
                />
              ) : history.length > 0 ? (
                <p className="portfolio-support-collect-info-empty">
                  No {kindFilterLabel ?? 'credits'} earlier.
                </p>
              ) : null}
              {historyHasMore ? (
                <div
                  ref={loadMoreRef}
                  className="portfolio-support-collect-info-sentinel"
                  aria-hidden
                />
              ) : null}
              {historyLoading ? (
                <ProfileSocialListSkeleton count={3} variant="append" />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </GlassSheet>
  );
}
