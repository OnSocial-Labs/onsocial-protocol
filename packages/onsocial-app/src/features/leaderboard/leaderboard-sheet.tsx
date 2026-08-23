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
  type CSSProperties,
  type Ref,
} from 'react';
import Link from 'next/link';
import {
  Divider,
  FireFillIcon,
  OsHugSheet,
  OsIconAction,
  SheetCloseButton,
  StandingIdentity,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { StandingListLoadMoreFooter } from '@/components/panels/standing-list-load-more-footer';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { PortfolioBoostSheet } from '@/features/boost/portfolio-boost-sheet';
import { useBoostPosition } from '@/features/boost/use-boost-position';
import { ReputationBreakdownFacts } from '@/features/leaderboard/reputation-breakdown-facts';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import {
  appendLeaderboardPage,
  computeLeaderboardRankPresentation,
  entriesForTrack,
  fetchLeaderboardBoard,
  filterLeaderboardEarnerRows,
  findViewerEntry,
  formatReputationScore,
  formatSocialCompact,
  isLeaderboardEarnerRanked,
  leaderboardRankLabel,
  LEADERBOARD_FACTS_Z,
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  LEADERBOARD_Z,
  leaderboardPrimaryUnit,
  leaderboardTrackHint,
  leaderboardTrackSubtitle,
  leaderboardViewerLine,
  pctOfLeader,
  reputationEntryToProfile,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardTrack,
  type LeaderboardTrackCache,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { portfolioPath } from '@/lib/overlay-routes';

const INFLUENCE_HINT_SESSION_KEY = 'leaderboard-influence-hint-seen';

function readInfluenceHintSeen(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(INFLUENCE_HINT_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function persistInfluenceHintSeen(): void {
  try {
    sessionStorage.setItem(INFLUENCE_HINT_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

function topRankClass(rank: number): string {
  return rank <= 3 ? ' is-top' : '';
}

function rowsWithRankPresentation<T extends { rank: number }>(
  rows: T[]
): Array<T & { denseIndex: number; rankLabel: string; tied: boolean }> {
  const presentation = computeLeaderboardRankPresentation(rows);
  return rows.map((row, index) => ({ ...row, ...presentation[index]! }));
}

function BoardRow({
  accountId,
  rank,
  rankLabel,
  denseIndex,
  rankTied = false,
  primary,
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
  rankLabel: string;
  denseIndex: number;
  rankTied?: boolean;
  primary: string;
  pct: number;
  track: LeaderboardTrack;
  profile?: PostAuthorProfile;
  onNavigate?: () => void;
  /** Reputation track: score opens the factor peek; the name still goes to profile. */
  onOpenFacts?: () => void;
  isViewer?: boolean;
  rowRef?: Ref<HTMLDivElement>;
}) {
  const who = profile?.displayName?.trim() || `@${accountId}`;
  const positionHint = rankTied ? `, position ${denseIndex}` : '';
  const primaryUnit = leaderboardPrimaryUnit(track);
  const label = `${who} · rank ${rankLabel}${positionHint} · ${primary} ${primaryUnit}`;

  const scoreColumn = (
    <span className="leaderboard-row-value">
      <span className="leaderboard-row-primary">{primary}</span>
      <span className="leaderboard-row-unit">{primaryUnit}</span>
    </span>
  );

  const main = (
    <>
      <span
        className={`leaderboard-row-rank${rankTied ? ' is-tied' : ''}`}
        aria-hidden
      >
        <span className="leaderboard-row-rank-label">{rankLabel}</span>
        <span
          className={`leaderboard-row-rank-dense${
            rankTied ? '' : ' is-empty'
          }`}
        >
          {rankTied ? denseIndex : '\u00a0'}
        </span>
      </span>
      <StandingIdentity
        accountId={accountId}
        profileName={profile?.displayName}
        avatarUrl={profile?.avatarUrl}
        size="sm"
        showHandle={false}
      />
    </>
  );

  return (
    <div
      ref={rowRef}
      className={`standing-row leaderboard-row${isViewer ? ' is-viewer' : ''}${topRankClass(rank)}`}
      data-track={track}
      style={{ '--lb-fill': `${Math.max(2, pct)}%` } as CSSProperties}
    >
      <Link
        href={portfolioPath(accountId)}
        className="standing-row-main"
        scroll={false}
        aria-label={label}
        onClick={onNavigate}
      >
        {main}
      </Link>
      {onOpenFacts ? (
        <button
          type="button"
          className="standing-row-aside leaderboard-row-aside leaderboard-row-score"
          aria-label={`${primary} ${primaryUnit} · factors`}
          onClick={onOpenFacts}
        >
          {scoreColumn}
        </button>
      ) : (
        <Link
          href={portfolioPath(accountId)}
          className="standing-row-aside leaderboard-row-aside"
          scroll={false}
          aria-label={label}
          onClick={onNavigate}
        >
          {scoreColumn}
        </Link>
      )}
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
  const presented = rowsWithRankPresentation(rows);
  return (
    <BoardList>
      {presented.map((entry) => {
        const isViewer = Boolean(findViewerEntry([entry], viewerAccountId));
        return (
          <div key={entry.accountId} role="listitem">
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              rankLabel={entry.rankLabel}
              denseIndex={entry.denseIndex}
              rankTied={entry.tied}
              primary={formatSocialCompact(entry.effectiveBoost)}
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
  onNavigate,
  viewerAccountId,
  viewerRowRef,
  onOpenFacts,
}: {
  rows: ReputationEntry[];
  profiles: Record<string, PostAuthorProfile>;
  onNavigate?: () => void;
  viewerAccountId?: string | null;
  viewerRowRef?: Ref<HTMLDivElement>;
  onOpenFacts: (entry: ReputationEntry) => void;
}) {
  const leader = rows[0]?.reputation ?? '1';
  const presented = rowsWithRankPresentation(rows);
  return (
    <BoardList>
      {presented.map((entry) => {
        const isViewer = Boolean(findViewerEntry([entry], viewerAccountId));
        return (
          <div key={entry.accountId} role="listitem">
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              rankLabel={entry.rankLabel}
              denseIndex={entry.denseIndex}
              rankTied={entry.tied}
              primary={formatReputationScore(entry.reputation)}
              pct={pctOfLeader(entry.reputation, leader)}
              track="reputation"
              profile={profiles[entry.accountId]}
              onNavigate={onNavigate}
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
  const presented = rowsWithRankPresentation(rows);
  return (
    <BoardList>
      {presented.map((entry) => {
        const isViewer = Boolean(findViewerEntry([entry], viewerAccountId));
        return (
          <div key={entry.accountId} role="listitem">
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              rankLabel={entry.rankLabel}
              denseIndex={entry.denseIndex}
              rankTied={entry.tied}
              primary={formatSocialCompact(entry.totalEarned)}
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

function viewerPrimary(
  track: LeaderboardTrack,
  entry: InfluenceEntry | ReputationEntry | EarnerEntry
): string {
  if (track === 'influence') {
    return formatSocialCompact((entry as InfluenceEntry).effectiveBoost);
  }
  if (track === 'reputation') {
    return formatReputationScore((entry as ReputationEntry).reputation);
  }
  return formatSocialCompact((entry as EarnerEntry).totalEarned);
}

function presentationForEntry<T extends { accountId: string; rank: number }>(
  entry: T,
  rows: ReadonlyArray<T>
): { denseIndex: number; rankLabel: string; tied: boolean } {
  const index = rows.findIndex((row) => row.accountId === entry.accountId);
  if (index >= 0) {
    return computeLeaderboardRankPresentation(rows)[index]!;
  }
  const rank = Math.max(1, Math.floor(entry.rank));
  const tied =
    rows.filter((row) => Math.max(1, Math.floor(row.rank)) === rank).length >
    1;
  return {
    denseIndex: rank,
    tied,
    rankLabel: leaderboardRankLabel(rank, tied),
  };
}

function ViewerFooter({
  track,
  entry,
  leaderValue,
  profile,
  rankLabel,
  denseIndex,
  rankTied,
  onNavigate,
  onOpenFacts,
}: {
  track: LeaderboardTrack;
  entry: InfluenceEntry | ReputationEntry | EarnerEntry;
  leaderValue: string;
  profile?: PostAuthorProfile;
  rankLabel: string;
  denseIndex: number;
  rankTied: boolean;
  onNavigate?: () => void;
  onOpenFacts?: (entry: ReputationEntry) => void;
}) {
  if (track === 'influence') {
    const row = entry as InfluenceEntry;
    return (
      <div className="leaderboard-viewer-footer" role="complementary">
        <BoardRow
          accountId={row.accountId}
          rank={row.rank}
          rankLabel={rankLabel}
          denseIndex={denseIndex}
          rankTied={rankTied}
          primary={formatSocialCompact(row.effectiveBoost)}
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
        <BoardRow
          accountId={row.accountId}
          rank={row.rank}
          rankLabel={rankLabel}
          denseIndex={denseIndex}
          rankTied={rankTied}
          primary={formatReputationScore(row.reputation)}
          pct={pctOfLeader(row.reputation, leaderValue)}
          track="reputation"
          profile={profile}
          onNavigate={onNavigate}
          onOpenFacts={onOpenFacts ? () => onOpenFacts(row) : undefined}
          isViewer
        />
      </div>
    );
  }
  const row = entry as EarnerEntry;
  return (
    <div className="leaderboard-viewer-footer" role="complementary">
      <BoardRow
        accountId={row.accountId}
        rank={row.rank}
        rankLabel={rankLabel}
        denseIndex={denseIndex}
        rankTied={rankTied}
        primary={formatSocialCompact(row.totalEarned)}
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
            ? `Rank #${reputation.rank}`
            : 'Protocol reputation'
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
  track: trackProp,
  onTrackChange,
  onRowNavigate,
}: {
  open: boolean;
  onClose: () => void;
  initialTrack?: LeaderboardTrack;
  /** Controlled track (URL-driven `/leaderboard?track=`). */
  track?: LeaderboardTrack;
  onTrackChange?: (track: LeaderboardTrack) => void;
  /** Fired when a row link is taken — parent can skip history.back(). */
  onRowNavigate?: () => void;
}) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const [sheetOpen, setSheetOpen] = useState(open);
  const [internalTrack, setInternalTrack] =
    useState<LeaderboardTrack>(initialTrack);
  const track = trackProp ?? internalTrack;
  const setTrack = useCallback(
    (next: LeaderboardTrack) => {
      onTrackChange?.(next);
      if (trackProp === undefined) {
        setInternalTrack(next);
      }
    },
    [onTrackChange, trackProp]
  );
  const prevParentOpenRef = useRef(open);
  useEffect(() => {
    const parentOpened = open && !prevParentOpenRef.current;
    const parentClosed = !open && prevParentOpenRef.current;
    if (parentOpened) {
      setSheetOpen(true);
      if (trackProp === undefined) {
        setInternalTrack(initialTrack);
      }
    } else if (parentClosed) {
      setSheetOpen(false);
    }
    prevParentOpenRef.current = open;
  }, [open, initialTrack, trackProp]);

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
  const [boostOpen, setBoostOpen] = useState(false);
  const requestIdRef = useRef(0);
  const viewerRowRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const scrolledForKeyRef = useRef('');
  const prevTrackRef = useRef<LeaderboardTrack>(track);
  const [influenceHintSeen, setInfluenceHintSeen] = useState(readInfluenceHintSeen);

  const boostAccountId = isConnected ? (viewerAccountId ?? '') : '';
  const boost = useBoostPosition(boostAccountId, {
    live: boostOpen && track === 'influence' && boostAccountId.length > 0,
  });

  const dismissInfluenceHint = useCallback(() => {
    persistInfluenceHintSeen();
    setInfluenceHintSeen(true);
  }, []);

  const trackRailHidden = useDockAutoHide(false, scrollRootRef);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleRowNavigate = useCallback(() => {
    onRowNavigate?.();
    requestClose();
  }, [onRowNavigate, requestClose]);

  const handleClosed = useCallback(() => {
    if (track === 'influence') {
      dismissInfluenceHint();
    }
    setCache({});
    setError(null);
    setPending(false);
    setLoadingMore(false);
    setViewerPinned(false);
    setFactsEntry(null);
    setBoostOpen(false);
    scrolledForKeyRef.current = '';
    onClose();
  }, [dismissInfluenceHint, onClose, track]);

  useEffect(() => {
    if (prevTrackRef.current === 'influence' && track !== 'influence') {
      dismissInfluenceHint();
    }
    prevTrackRef.current = track;
  }, [dismissInfluenceHint, track]);

  useEffect(() => {
    if (track !== 'influence') {
      setBoostOpen(false);
    }
  }, [track]);

  useEffect(() => {
    if (!sheetOpen) {
      setBoostOpen(false);
    }
  }, [sheetOpen]);

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
  const rawRows = entriesForTrack(track, board);
  const rows = useMemo(() => {
    if (!rawRows) return null;
    if (track === 'earners') {
      return filterLeaderboardEarnerRows(rawRows as EarnerEntry[]);
    }
    return rawRows;
  }, [rawRows, track]);
  const hasMore = trackCache?.hasMore ?? false;
  const viewerInList = findViewerEntry(rows ?? [], viewerAccountId);
  const viewerInListRow =
    viewerInList && rows
      ? (rows[viewerInList.index] as
          | InfluenceEntry
          | ReputationEntry
          | EarnerEntry)
      : null;
  const rawViewerOutside =
    !viewerInListRow && board?.viewerEntry
      ? (board.viewerEntry as InfluenceEntry | ReputationEntry | EarnerEntry)
      : null;
  const viewerOutside =
    track === 'earners' && rawViewerOutside
      ? isLeaderboardEarnerRanked(rawViewerOutside as EarnerEntry)
        ? rawViewerOutside
        : null
      : rawViewerOutside;
  const stickyViewer = viewerOutside ?? (viewerPinned ? viewerInListRow : null);
  const shareViewer = viewerInListRow ?? viewerOutside;
  const trackHint =
    track === 'influence' &&
    !influenceHintSeen &&
    leaderboardTrackHint(track);
  /** Quiet you-line whenever the viewer has a rank on this track. */
  const showYouLine = Boolean(shareViewer && isConnected);

  const scrollToViewer = useCallback(() => {
    viewerRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

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

  const empty =
    rows != null && rows.length === 0
      ? 'No rankings yet. Activity will appear once indexed.'
      : null;
  const showSkeleton = pending && rows == null;

  const stickyFooter =
    stickyViewer && rows && !showSkeleton && !error && !empty ? (
      <>
        <Divider variant="section" className="leaderboard-footer-divider" />
        <ViewerFooter
          track={track}
          entry={stickyViewer}
          leaderValue={leaderValue}
          profile={profiles[stickyViewer.accountId]}
          {...presentationForEntry(stickyViewer, rows)}
          onNavigate={handleRowNavigate}
          onOpenFacts={setFactsEntry}
        />
      </>
    ) : null;

  const youLineText =
    showYouLine && shareViewer
      ? ` · ${leaderboardViewerLine({
          rank: shareViewer.rank,
          primary: viewerPrimary(track, shareViewer),
        })}`
      : null;

  const showBoostAction =
    track === 'influence' && isConnected && boostAccountId.length > 0;
  const boostLockedLabel = boost.hasPosition
    ? formatSocialCompact(boost.lockedYocto)
    : '';
  const boostAriaLabel = boost.hasPosition
    ? `${boostLockedLabel} SOCIAL boosting — manage`
    : 'Boost — lock SOCIAL to grow influence';

  return (
    <>
      <OsSlideOverScreen
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        title="Leaderboard"
        heading={
          <>
            <h1 className="os-app-screen-title">Leaderboard</h1>
            <p className="os-app-screen-subtitle leaderboard-sheet-subline">
              <span className="leaderboard-sheet-subline-metric">
                {leaderboardTrackSubtitle(track)}
              </span>
              {youLineText ? (
                viewerInListRow ? (
                  <button
                    type="button"
                    className="leaderboard-sheet-subline-you is-jump"
                    onClick={scrollToViewer}
                  >
                    {youLineText}
                  </button>
                ) : (
                  <span className="leaderboard-sheet-subline-you">
                    {youLineText}
                  </span>
                )
              ) : null}
            </p>
          </>
        }
        zIndex={LEADERBOARD_Z}
        closeAriaLabel="Back from leaderboard"
        className="leaderboard-slide"
        scrollRootRef={scrollRootRef}
        actions={
          showBoostAction ? (
            <div className="standing-sheet-actions standing-sheet-actions--payout">
              <OsIconAction
                ariaLabel={boostAriaLabel}
                onClick={() => setBoostOpen(true)}
              >
                <FireFillIcon
                  className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                  aria-hidden
                />
              </OsIconAction>
            </div>
          ) : null
        }
        toolbar={
          <div className="leaderboard-toolbar">
            <div
              className={`os-app-chrome-rail leaderboard-track-rail${
                trackRailHidden ? ' is-scroll-hidden' : ''
              }`}
            >
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
                    className={`leaderboard-track-seg${
                      track === item.id ? ' is-selected' : ''
                    }`}
                    onClick={() => {
                      if (item.id === track) return;
                      setError(null);
                      setViewerPinned(false);
                      setFactsEntry(null);
                      scrolledForKeyRef.current = '';
                      setTrack(item.id);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {trackHint ? (
              <p className="leaderboard-track-hint">{trackHint}</p>
            ) : null}
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
                onNavigate={handleRowNavigate}
                viewerAccountId={viewerAccountId}
                viewerRowRef={viewerRowRef}
              />
            ) : track === 'reputation' && rows ? (
              <ReputationRows
                rows={rows as ReputationEntry[]}
                profiles={profiles}
                onNavigate={handleRowNavigate}
                viewerAccountId={viewerAccountId}
                viewerRowRef={viewerRowRef}
                onOpenFacts={setFactsEntry}
              />
            ) : track === 'earners' && rows ? (
              <EarnerRows
                rows={rows as EarnerEntry[]}
                profiles={profiles}
                onNavigate={handleRowNavigate}
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
            ) : track === 'earners' && isConnected && !shareViewer && board ? (
              <p className="leaderboard-sheet-footnote">
                No SOCIAL earned yet — you won&apos;t appear on this board.
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

      {showBoostAction ? (
        <PortfolioBoostSheet
          open={boostOpen}
          accountId={boostAccountId}
          position={boost}
          onOpenChange={setBoostOpen}
          zIndex={LEADERBOARD_FACTS_Z}
        />
      ) : null}
    </>
  );
}
