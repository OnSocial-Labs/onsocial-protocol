'use client';

/**
 * In-app protocol leaderboard (slide-over).
 *
 * Reuses @onsocial/ui StandingIdentity + standing-row chrome and OsSlideOverScreen.
 * Rank / pct bars / viewer pin stay host-local — no second UI consumer yet.
 * Period/Δ needs indexer history — not faked here.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import Link from 'next/link';
import {
  CheckIcon,
  Divider,
  OsHugSheet,
  OsIconAction,
  ShareIcon,
  SheetCloseButton,
  StandingIdentity,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { StandingListLoadMoreFooter } from '@/components/panels/standing-list-load-more-footer';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import {
  appendLeaderboardPage,
  commitmentLabel,
  entriesForTrack,
  fetchLeaderboardBoard,
  findViewerEntry,
  formatReputationScore,
  formatSocialCompact,
  LEADERBOARD_FACTS_Z,
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  LEADERBOARD_Z,
  leaderboardShareCopy,
  leaderboardTrackSubtitle,
  pctOfLeader,
  reputationBoardMeta,
  reputationEntryToProfile,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardTrack,
  type LeaderboardTrackCache,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { overlayPath, portfolioPath } from '@/lib/overlay-routes';
import { shareUrl } from '@/lib/share-url';

function ProgressBar({
  pct,
  track,
}: {
  pct: number;
  track: LeaderboardTrack;
}) {
  return (
    <div className="leaderboard-row-bar" aria-hidden>
      <span
        className="leaderboard-row-bar-fill"
        data-track={track}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

function topRankClass(rank: number): string {
  if (rank === 1) return ' is-top is-top-1';
  if (rank === 2) return ' is-top is-top-2';
  if (rank === 3) return ' is-top is-top-3';
  return '';
}

function BoardRow({
  accountId,
  rank,
  meta,
  primary,
  primaryLabel,
  pct,
  track,
  profile,
  onNavigate,
  onOpenFacts,
  isViewer = false,
  rowRef,
}: {
  accountId: string;
  rank: number;
  meta?: string | null;
  primary: string;
  primaryLabel: string;
  pct: number;
  track: LeaderboardTrack;
  profile?: PostAuthorProfile;
  onNavigate?: () => void;
  /** Reputation track: open factor peek instead of jumping to portfolio. */
  onOpenFacts?: () => void;
  isViewer?: boolean;
  rowRef?: Ref<HTMLDivElement>;
}) {
  const label = profile?.displayName?.trim()
    ? `${profile.displayName} · rank ${rank}`
    : `@${accountId} · rank ${rank}`;

  const main = (
    <>
      <span className="leaderboard-row-rank" aria-hidden>
        {rank}
      </span>
      <StandingIdentity
        accountId={accountId}
        profileName={profile?.displayName}
        avatarUrl={profile?.avatarUrl}
        size="lg"
        showHandle="when-named"
      >
        {meta ? <span className="standing-row-bio">{meta}</span> : null}
        <ProgressBar pct={pct} track={track} />
      </StandingIdentity>
    </>
  );

  return (
    <div
      ref={rowRef}
      className={`standing-row leaderboard-row${isViewer ? ' is-viewer' : ''}${topRankClass(rank)}`}
    >
      {onOpenFacts ? (
        <button
          type="button"
          className="standing-row-main leaderboard-row-main-button"
          aria-label={`${label} · reputation factors`}
          onClick={onOpenFacts}
        >
          {main}
        </button>
      ) : (
        <Link
          href={portfolioPath(accountId)}
          className="standing-row-main"
          scroll={false}
          aria-label={label}
          onClick={onNavigate}
        >
          {main}
        </Link>
      )}
      <div className="standing-row-aside leaderboard-row-aside">
        <span className="leaderboard-row-primary">{primary}</span>
        <span className="leaderboard-row-primary-label">{primaryLabel}</span>
      </div>
    </div>
  );
}

function BoardList({ children }: { children: React.ReactNode }) {
  return (
    <div className="standing-list leaderboard-list" role="list">
      {children}
    </div>
  );
}

function InfluenceRows({
  rows,
  profiles,
  onNavigate,
  viewerAccountId,
  viewerRowRef,
}: {
  rows: InfluenceEntry[];
  profiles: Record<string, PostAuthorProfile>;
  onNavigate?: () => void;
  viewerAccountId?: string | null;
  viewerRowRef?: Ref<HTMLDivElement>;
}) {
  const leader = rows[0]?.effectiveBoost ?? '1';
  return (
    <BoardList>
      {rows.map((entry, index) => {
        const isViewer = Boolean(findViewerEntry([entry], viewerAccountId));
        return (
          <div key={entry.accountId} role="listitem">
            {index > 0 ? <Divider variant="item" /> : null}
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              meta={commitmentLabel(entry.lockMonths)}
              primary={formatSocialCompact(entry.effectiveBoost)}
              primaryLabel="Boost"
              pct={pctOfLeader(entry.effectiveBoost, leader)}
              track="influence"
              profile={profiles[entry.accountId]}
              onNavigate={onNavigate}
              isViewer={isViewer}
              rowRef={isViewer ? viewerRowRef : undefined}
            />
          </div>
        );
      })}
    </BoardList>
  );
}

function ReputationRows({
  rows,
  profiles,
  viewerAccountId,
  viewerRowRef,
  onOpenFacts,
}: {
  rows: ReputationEntry[];
  profiles: Record<string, PostAuthorProfile>;
  viewerAccountId?: string | null;
  viewerRowRef?: Ref<HTMLDivElement>;
  onOpenFacts: (entry: ReputationEntry) => void;
}) {
  const leader = rows[0]?.reputation ?? '1';
  return (
    <BoardList>
      {rows.map((entry, index) => {
        const isViewer = Boolean(findViewerEntry([entry], viewerAccountId));
        return (
          <div key={entry.accountId} role="listitem">
            {index > 0 ? <Divider variant="item" /> : null}
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              meta={reputationBoardMeta(entry)}
              primary={formatReputationScore(entry.reputation)}
              primaryLabel="Rep"
              pct={pctOfLeader(entry.reputation, leader)}
              track="reputation"
              profile={profiles[entry.accountId]}
              onOpenFacts={() => onOpenFacts(entry)}
              isViewer={isViewer}
              rowRef={isViewer ? viewerRowRef : undefined}
            />
          </div>
        );
      })}
    </BoardList>
  );
}

function EarnerRows({
  rows,
  profiles,
  onNavigate,
  viewerAccountId,
  viewerRowRef,
}: {
  rows: EarnerEntry[];
  profiles: Record<string, PostAuthorProfile>;
  onNavigate?: () => void;
  viewerAccountId?: string | null;
  viewerRowRef?: Ref<HTMLDivElement>;
}) {
  const leader = rows[0]?.totalEarned ?? '1';
  return (
    <BoardList>
      {rows.map((entry, index) => {
        const unclaimed =
          entry.unclaimed && entry.unclaimed !== '0' && entry.unclaimed !== ''
            ? `${formatSocialCompact(entry.unclaimed)} claimable`
            : null;
        const isViewer = Boolean(findViewerEntry([entry], viewerAccountId));
        return (
          <div key={entry.accountId} role="listitem">
            {index > 0 ? <Divider variant="item" /> : null}
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              meta={unclaimed}
              primary={formatSocialCompact(entry.totalEarned)}
              primaryLabel="Earned"
              pct={pctOfLeader(entry.totalEarned, leader)}
              track="earners"
              profile={profiles[entry.accountId]}
              onNavigate={onNavigate}
              isViewer={isViewer}
              rowRef={isViewer ? viewerRowRef : undefined}
            />
          </div>
        );
      })}
    </BoardList>
  );
}

function ViewerFooter({
  track,
  entry,
  leaderValue,
  profile,
  onNavigate,
  onOpenFacts,
}: {
  track: LeaderboardTrack;
  entry: InfluenceEntry | ReputationEntry | EarnerEntry;
  leaderValue: string;
  profile?: PostAuthorProfile;
  onNavigate?: () => void;
  onOpenFacts?: (entry: ReputationEntry) => void;
}) {
  if (track === 'influence') {
    const row = entry as InfluenceEntry;
    return (
      <div className="leaderboard-viewer-footer" role="complementary">
        <p className="leaderboard-viewer-footer-label">Your rank</p>
        <BoardRow
          accountId={row.accountId}
          rank={row.rank}
          meta={commitmentLabel(row.lockMonths)}
          primary={formatSocialCompact(row.effectiveBoost)}
          primaryLabel="Boost"
          pct={pctOfLeader(row.effectiveBoost, leaderValue)}
          track="influence"
          profile={profile}
          onNavigate={onNavigate}
          isViewer
        />
      </div>
    );
  }
  if (track === 'reputation') {
    const row = entry as ReputationEntry;
    return (
      <div className="leaderboard-viewer-footer" role="complementary">
        <p className="leaderboard-viewer-footer-label">Your rank</p>
        <BoardRow
          accountId={row.accountId}
          rank={row.rank}
          meta={reputationBoardMeta(row)}
          primary={formatReputationScore(row.reputation)}
          primaryLabel="Rep"
          pct={pctOfLeader(row.reputation, leaderValue)}
          track="reputation"
          profile={profile}
          onOpenFacts={
            onOpenFacts ? () => onOpenFacts(row) : undefined
          }
          isViewer
        />
      </div>
    );
  }
  const row = entry as EarnerEntry;
  const unclaimed =
    row.unclaimed && row.unclaimed !== '0' && row.unclaimed !== ''
      ? `${formatSocialCompact(row.unclaimed)} claimable`
      : null;
  return (
    <div className="leaderboard-viewer-footer" role="complementary">
      <p className="leaderboard-viewer-footer-label">Your rank</p>
      <BoardRow
        accountId={row.accountId}
        rank={row.rank}
        meta={unclaimed}
        primary={formatSocialCompact(row.totalEarned)}
        primaryLabel="Earned"
        pct={pctOfLeader(row.totalEarned, leaderValue)}
        track="earners"
        profile={profile}
        onNavigate={onNavigate}
        isViewer
      />
    </div>
  );
}

function LeaderboardReputationPeek({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: ReputationEntry | null;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing && entry != null;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const reputation = entry ? reputationEntryToProfile(entry) : null;
  const accountId = entry?.accountId ?? '';

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Reputation"
      copy={
        reputation
          ? reputation.rank > 0
            ? `Rank #${reputation.rank} · protocol v1`
            : 'Protocol reputation v1'
          : 'Not indexed yet'
      }
      closeAriaLabel="Close reputation"
      backdropLabel="Close reputation"
      zIndex={LEADERBOARD_FACTS_Z}
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
      headerActions={
        <div className="standing-sheet-actions standing-sheet-actions--payout">
          <SheetCloseButton
            onClick={requestClose}
            ariaLabel="Close reputation"
          />
        </div>
      }
    >
      <div className="guild-facts">
        <ReputationBreakdownFacts
          accountId={accountId}
          reputation={reputation}
        />
        {accountId ? (
          <p className="leaderboard-facts-profile-link">
            <Link
              href={portfolioPath(accountId)}
              scroll={false}
              onClick={requestClose}
            >
              View profile
            </Link>
          </p>
        ) : null}
      </div>
    </OsHugSheet>
  );
}

export function LeaderboardSheet({
  open,
  onClose,
  initialTrack = 'reputation',
}: {
  open: boolean;
  onClose: () => void;
  initialTrack?: LeaderboardTrack;
}) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const [sheetOpen, setSheetOpen] = useState(open);
  const [track, setTrack] = useState<LeaderboardTrack>(initialTrack);
  if (open && !sheetOpen) {
    setSheetOpen(true);
    setTrack(initialTrack);
  }

  const viewerKey = isConnected ? (viewerAccountId ?? '') : '';
  const [cache, setCache] = useState<
    Partial<Record<LeaderboardTrack, LeaderboardTrackCache>>
  >({});
  const [cacheViewerKey, setCacheViewerKey] = useState(viewerKey);
  if (cacheViewerKey !== viewerKey) {
    setCacheViewerKey(viewerKey);
    setCache({});
  }
  const [pending, setPending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerPinned, setViewerPinned] = useState(false);
  const [factsEntry, setFactsEntry] = useState<ReputationEntry | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const requestIdRef = useRef(0);
  const viewerRowRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrolledForKeyRef = useRef('');

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setCache({});
    setError(null);
    setPending(false);
    setLoadingMore(false);
    setViewerPinned(false);
    setFactsEntry(null);
    setShareCopied(false);
    scrolledForKeyRef.current = '';
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!sheetOpen) return;
    if (cache[track]) return;

    const requestId = ++requestIdRef.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && requestId === requestIdRef.current) {
        setPending(true);
        setError(null);
      }
    });

    void fetchLeaderboardBoard(track, {
      limit: LEADERBOARD_PAGE_SIZE,
      offset: 0,
      viewerAccountId: isConnected ? viewerAccountId : null,
    }).then((data) => {
      if (cancelled || requestId !== requestIdRef.current) return;
      setPending(false);
      if (!data) {
        setError('Could not load leaderboard.');
        return;
      }
      const page = appendLeaderboardPage(track, null, data);
      setCache((prev) => ({ ...prev, [track]: page }));
    });

    return () => {
      cancelled = true;
    };
  }, [sheetOpen, track, cache, isConnected, viewerAccountId]);

  const trackCache = cache[track] ?? null;
  const board = trackCache?.board ?? null;
  const rows = entriesForTrack(track, board);
  const hasMore = trackCache?.hasMore ?? false;
  const viewerInList = findViewerEntry(rows ?? [], viewerAccountId);
  const viewerInListRow =
    viewerInList && rows
      ? (rows[viewerInList.index] as
          | InfluenceEntry
          | ReputationEntry
          | EarnerEntry)
      : null;
  const viewerOutside =
    !viewerInListRow && board?.viewerEntry
      ? (board.viewerEntry as InfluenceEntry | ReputationEntry | EarnerEntry)
      : null;
  const stickyViewer = viewerOutside ?? (viewerPinned ? viewerInListRow : null);
  const shareViewer = viewerInListRow ?? viewerOutside;

  const accountIds = useMemo(() => {
    const ids = (rows ?? []).map((row) => row.accountId);
    if (viewerOutside) ids.push(viewerOutside.accountId);
    return ids;
  }, [rows, viewerOutside]);
  const profiles = usePostAuthorProfiles(accountIds);

  const leaderValue = useMemo(() => {
    if (!rows || rows.length === 0) return '1';
    if (track === 'influence') {
      return (rows[0] as InfluenceEntry).effectiveBoost;
    }
    if (track === 'reputation') {
      return (rows[0] as ReputationEntry).reputation;
    }
    return (rows[0] as EarnerEntry).totalEarned;
  }, [rows, track]);

  useEffect(() => {
    if (!sheetOpen || !viewerInListRow) return;
    const key = `${track}:${viewerAccountId ?? ''}`;
    if (scrolledForKeyRef.current === key) return;
    const node = viewerRowRef.current;
    if (!node) return;
    scrolledForKeyRef.current = key;
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [sheetOpen, track, viewerAccountId, viewerInListRow, rows]);

  useEffect(() => {
    if (!sheetOpen || !viewerInListRow) {
      return;
    }

    const node = viewerRowRef.current;
    if (!node) return;

    const root = node.closest('.os-app-screen-body');
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setViewerPinned(!entry.isIntersecting);
      },
      {
        root: root instanceof Element ? root : null,
        threshold: 0.4,
        rootMargin: '0px 0px -6% 0px',
      }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [sheetOpen, track, viewerInListRow, rows]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || pending) return;
    const offset = rows?.length ?? 0;
    setLoadingMore(true);
    const data = await fetchLeaderboardBoard(track, {
      limit: LEADERBOARD_PAGE_SIZE,
      offset,
      viewerAccountId: null,
    });
    setLoadingMore(false);
    if (!data) return;
    setCache((prev) => {
      const current = prev[track]?.board ?? null;
      const next = appendLeaderboardPage(track, current, data);
      return { ...prev, [track]: next };
    });
  }, [hasMore, loadingMore, pending, rows, track]);

  useEffect(() => {
    if (!sheetOpen || !hasMore || loadingMore || pending) return;
    const node = loadMoreSentinelRef.current;
    if (!node) return;
    const root = node.closest('.os-app-screen-body');
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: '120px 0px',
      }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [sheetOpen, hasMore, loadingMore, pending, loadMore, rows]);

  const handleShare = useCallback(async () => {
    if (!shareViewer || !viewerAccountId) return;
    const copy = leaderboardShareCopy({
      track,
      rank: shareViewer.rank,
      accountId: viewerAccountId,
    });
    const path =
      track === 'reputation'
        ? overlayPath(viewerAccountId, 'reputation')
        : portfolioPath(viewerAccountId);
    const url = new URL(path, window.location.origin).toString();
    const result = await shareUrl({
      url,
      title: copy.title,
      text: copy.text,
    });
    if (result === 'copied') {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    }
  }, [shareViewer, track, viewerAccountId]);

  const empty =
    rows != null && rows.length === 0
      ? 'No rankings yet. Activity will appear once indexed.'
      : null;
  const showSkeleton = pending && rows == null;

  const stickyFooter =
    stickyViewer && !showSkeleton && !error && !empty ? (
      <ViewerFooter
        track={track}
        entry={stickyViewer}
        leaderValue={leaderValue}
        profile={profiles[stickyViewer.accountId]}
        onNavigate={requestClose}
        onOpenFacts={setFactsEntry}
      />
    ) : null;

  return (
    <>
      <OsSlideOverScreen
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        title="Leaderboard"
        subtitle={leaderboardTrackSubtitle(track)}
        zIndex={LEADERBOARD_Z}
        closeAriaLabel="Back from leaderboard"
        className="leaderboard-slide"
        actions={
          shareViewer && isConnected ? (
            <OsIconAction
              ariaLabel="Share your rank"
              onClick={() => {
                void handleShare();
              }}
            >
              {shareCopied ? (
                <CheckIcon aria-hidden />
              ) : (
                <ShareIcon aria-hidden />
              )}
            </OsIconAction>
          ) : null
        }
        toolbar={
          <div
            className="leaderboard-track-row"
            role="tablist"
            aria-label="Leaderboard tracks"
          >
            {LEADERBOARD_TRACKS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={track === item.id}
                className={`os-surface-chip leaderboard-track-chip${
                  track === item.id ? ' is-selected' : ''
                }${item.emphasis === 'tertiary' ? ' is-tertiary' : ''}`}
                onClick={() => {
                  setError(null);
                  setViewerPinned(false);
                  setFactsEntry(null);
                  scrolledForKeyRef.current = '';
                  setCache((prev) => {
                    const next = { ...prev };
                    delete next[item.id];
                    return next;
                  });
                  setTrack(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
        contentClassName="leaderboard-sheet-content"
        footer={stickyFooter}
      >
        {error ? (
          <p className="leaderboard-sheet-empty">{error}</p>
        ) : showSkeleton ? (
          <ProfileSocialListSkeleton count={6} />
        ) : empty ? (
          <p className="leaderboard-sheet-empty">{empty}</p>
        ) : (
          <>
            {track === 'influence' && rows ? (
              <InfluenceRows
                rows={rows as InfluenceEntry[]}
                profiles={profiles}
                onNavigate={requestClose}
                viewerAccountId={viewerAccountId}
                viewerRowRef={viewerRowRef}
              />
            ) : track === 'reputation' && rows ? (
              <ReputationRows
                rows={rows as ReputationEntry[]}
                profiles={profiles}
                viewerAccountId={viewerAccountId}
                viewerRowRef={viewerRowRef}
                onOpenFacts={setFactsEntry}
              />
            ) : track === 'earners' && rows ? (
              <EarnerRows
                rows={rows as EarnerEntry[]}
                profiles={profiles}
                onNavigate={requestClose}
                viewerAccountId={viewerAccountId}
                viewerRowRef={viewerRowRef}
              />
            ) : (
              <ProfileSocialListSkeleton count={6} />
            )}
            <StandingListLoadMoreFooter
              loadMoreSentinelRef={loadMoreSentinelRef}
              isLoadingMore={loadingMore}
              showSentinel={hasMore}
              resultsSummary={
                hasMore
                  ? null
                  : rows && rows.length > LEADERBOARD_PAGE_SIZE
                    ? `Showing top ${rows.length}`
                    : null
              }
            />
            {!isConnected ? (
              <p className="leaderboard-sheet-footnote">
                Connect a wallet to see your rank on this board.
              </p>
            ) : null}
          </>
        )}
      </OsSlideOverScreen>

      <LeaderboardReputationPeek
        open={factsEntry != null}
        entry={factsEntry}
        onClose={() => setFactsEntry(null)}
      />
    </>
  );
}
