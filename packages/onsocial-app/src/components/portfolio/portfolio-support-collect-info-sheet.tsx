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
import { Divider, GlassSheet, ProfileAvatar, SheetCloseButton } from '@onsocial/ui';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  SUPPORT_POT_LEGEND,
  supportPotActionLabel,
  type ProfileSupportReceivedHistoryPage,
  type ProfileSupportReceivedSummary,
} from '@/lib/profile-support-received';
import type { SupportReceivedRow } from '@onsocial/sdk';

interface PortfolioSupportCollectInfoSheetProps {
  open: boolean;
  accountId: string;
  claimableLabel: string;
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
        const name = profile?.displayName?.trim() || null;
        const label = name || `@${row.spenderId}`;
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
                <ProfileAvatar
                  src={profile?.avatarUrl ?? null}
                  fallbackInitial={name || row.spenderId}
                  size="md"
                  className="standing-row-avatar-slot"
                />
                <div className="standing-row-copy">
                  <span className="standing-row-head">
                    <span className="standing-row-name-row">
                      <span className="standing-row-name">{label}</span>
                    </span>
                    {name ? (
                      <span className="standing-row-handle">
                        @{row.spenderId}
                      </span>
                    ) : null}
                  </span>
                  <span className="portfolio-support-collect-info-row-kind">
                    {kind}
                    {when ? ` · ${when}` : ''}
                  </span>
                </div>
              </Link>
              <div className="standing-row-aside">
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
 * Owner Collect info — pot legend, credits in the current claimable pot,
 * then earlier (already collected) support loaded on scroll.
 */
export function PortfolioSupportCollectInfoSheet({
  open,
  accountId,
  claimableLabel,
  onOpenChange,
}: PortfolioSupportCollectInfoSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [current, setCurrent] = useState<SupportReceivedRow[] | null>(null);
  const [history, setHistory] = useState<SupportReceivedRow[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    ...history.map((row) => row.spenderId),
  ];
  const profiles = usePostAuthorProfiles(spenderIds);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCurrent(null);
    setHistory([]);
    setHistoryHasMore(false);
    setLoadError(null);
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
            !seen.has(
              `${row.blockHeight}:${row.spenderId}:${row.amountYocto}`
            )
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

  const showEarlier =
    current != null && (history.length > 0 || historyHasMore);

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
      backdropLabel="Close support pot"
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
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Support pot
                  </h2>
                  <p className="discover-sheet-subtitle">
                    {claimableLabel} SOCIAL ready to collect
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel="Close support pot"
                />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <ul className="portfolio-support-collect-info-legend">
        {SUPPORT_POT_LEGEND.map((row) => (
          <li key={row.action}>
            <span className="portfolio-support-collect-info-legend-label">
              {row.label}
            </span>
            <span className="portfolio-support-collect-info-legend-detail">
              {row.detail}
            </span>
          </li>
        ))}
      </ul>

      <section className="portfolio-support-collect-info-block">
        <h3 className="portfolio-support-collect-info-section">
          In this collect
        </h3>
        {loadError ? (
          <p className="portfolio-support-collect-info-empty">{loadError}</p>
        ) : current == null ? (
          <p className="portfolio-support-collect-info-empty">Loading…</p>
        ) : current.length === 0 ? (
          <p className="portfolio-support-collect-info-empty">
            No indexed credits for this pot yet.
          </p>
        ) : (
          <SupportCreditList items={current} profiles={profiles} />
        )}
      </section>

      {showEarlier ? (
        <section className="portfolio-support-collect-info-block">
          <h3 className="portfolio-support-collect-info-section">Earlier</h3>
          <p className="portfolio-support-collect-info-section-note">
            Already collected in a previous claim
          </p>
          {history.length > 0 ? (
            <SupportCreditList items={history} profiles={profiles} />
          ) : null}
          {historyHasMore ? (
            <div
              ref={loadMoreRef}
              className="portfolio-support-collect-info-sentinel"
              aria-hidden
            />
          ) : null}
          {historyLoading ? (
            <p className="portfolio-support-collect-info-empty">Loading…</p>
          ) : null}
        </section>
      ) : null}
    </GlassSheet>
  );
}
