'use client';

/**
 * In-app protocol leaderboard (appear page sheet — same shell as create post).
 *
 * Reputation, Influence, and Earners sit side by side. The chips share the
 * user-line inset and tuck while that list scrolls. The selected fill travels
 * with the page. Each list keeps its place.
 *
 * Reuses @onsocial/ui StandingIdentity + standing-row chrome and OsPageSheet.
 * Rank / pct bars / viewer pin stay host-local — no second UI consumer yet.
 * Period/Δ needs indexer history — not faked here.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  MultiplyIcon,
  OsHugSheet,
  OsIconAction,
  OsPageSheet,
  SheetCloseButton,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { StandingListLoadMoreFooter } from '@/components/panels/standing-list-load-more-footer';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  DOCK_TOGGLE_COOLDOWN_MS,
  nextDockAutoHidden,
  scrollRoomOf,
} from '@/hooks/use-dock-auto-hide';
import { useViewerWalletMoodVars } from '@/hooks/use-viewer-wallet-mood-vars';
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
  leaderboardHeaderYouLine,
  leaderboardPrimaryUnit,
  leaderboardPagerProgress,
  leaderboardThumbBlend,
  leaderboardThumbBox,
  leaderboardTrackFromPager,
  leaderboardTrackHint,
  leaderboardTrackIndex,
  pctOfLeader,
  reputationEntryToProfile,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardBoardResponse,
  type LeaderboardTrack,
  type LeaderboardTrackCache,
  type ReputationEntry,
} from '@/lib/leaderboard';
import {
  pageContentDrawerPanelStyle,
  portfolioMoodShellStyle,
  resolvePortfolioMood,
} from '@/lib/moods/resolve';
import { portfolioPath } from '@/lib/overlay-routes';
import { displayName } from '@/lib/profile-display';

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
  const who = displayName(accountId, profile?.displayName);
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
          className={`leaderboard-row-rank-dense${rankTied ? '' : ' is-empty'}`}
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
        nameTrailing={<ProtocolNameTrailing accountId={accountId} />}
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

function presentationForEntry<T extends { accountId: string; rank: number }>(
  entry: T,
  rows: ReadonlyArray<T>
): { denseIndex: number; rankLabel: string; rankTied: boolean } {
  const index = rows.findIndex((row) => row.accountId === entry.accountId);
  if (index >= 0) {
    const presentation = computeLeaderboardRankPresentation(rows)[index]!;
    return {
      denseIndex: presentation.denseIndex,
      rankLabel: presentation.rankLabel,
      rankTied: presentation.tied,
    };
  }
  const rank = Math.max(1, Math.floor(entry.rank));
  const rankTied =
    rows.filter((row) => Math.max(1, Math.floor(row.rank)) === rank).length > 1;
  return {
    denseIndex: rank,
    rankTied,
    rankLabel: leaderboardRankLabel(rank, rankTied),
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
      chrome="facts"
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
      panelClassName="guild-facts-sheet-panel os-sheet-cap-standard"
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

const LEADERBOARD_THUMB_COLOR: Record<LeaderboardTrack, string> = {
  reputation: 'var(--signal-reputation)',
  influence: 'var(--signal-standing)',
  earners: 'var(--signal-endorse)',
};

/** Glue the selected fill to the pager. Labels stay put. */
function placeLeaderboardThumb(
  pager: HTMLElement | null,
  row: HTMLElement | null
): void {
  if (!pager || !row) return;
  const buttons = [...row.querySelectorAll<HTMLElement>('[role="tab"]')];
  const progress = leaderboardPagerProgress(
    pager.scrollLeft,
    pager.clientWidth
  );
  const box = leaderboardThumbBox(
    progress,
    buttons.map((button) => ({
      left: button.offsetLeft,
      width: button.offsetWidth,
    }))
  );
  const thumb = row.querySelector<HTMLElement>('.leaderboard-track-thumb');
  const sample = buttons[0];
  if (!box || !thumb || !sample) return;
  const blend = leaderboardThumbBlend(progress);
  thumb.style.width = `${box.width}px`;
  thumb.style.height = `${sample.offsetHeight}px`;
  thumb.style.transform = `translate3d(${box.left}px, ${sample.offsetTop}px, 0)`;
  row.style.setProperty('--lb-a', LEADERBOARD_THUMB_COLOR[blend.from]);
  row.style.setProperty('--lb-b', LEADERBOARD_THUMB_COLOR[blend.to]);
  row.style.setProperty('--lb-mix', String(blend.mix));
}

function leaderboardPagerMotion(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}

function readLeaderboardTrack(
  track: LeaderboardTrack,
  trackCache: LeaderboardTrackCache | null | undefined,
  viewerAccountId: string | null | undefined
) {
  const board = trackCache?.board ?? null;
  const rawRows = entriesForTrack(track, board);
  const rows = rawRows
    ? track === 'earners'
      ? filterLeaderboardEarnerRows(rawRows as EarnerEntry[])
      : rawRows
    : null;
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
  let leaderValue = '1';
  if (rows && rows.length > 0) {
    if (track === 'influence') {
      leaderValue = (rows[0] as InfluenceEntry).effectiveBoost;
    } else if (track === 'reputation') {
      leaderValue = (rows[0] as ReputationEntry).reputation;
    } else {
      leaderValue = (rows[0] as EarnerEntry).totalEarned;
    }
  }
  return {
    board,
    rows,
    hasMore: trackCache?.hasMore ?? false,
    viewerInListRow,
    viewerOutside,
    shareViewer: viewerInListRow ?? viewerOutside,
    leaderValue,
  };
}

function scrollRowIntoPage(scroller: HTMLElement, row: HTMLElement): void {
  const top = row.offsetTop - scroller.clientHeight / 2 + row.offsetHeight / 2;
  scroller.scrollTo({
    top: Math.max(0, top),
    behavior: leaderboardPagerMotion(),
  });
}

function LeaderboardTrackPage({
  track,
  active,
  trackCache,
  pageError,
  viewerAccountId,
  isConnected,
  onNavigate,
  onOpenFacts,
  onAppend,
  onPinnedChange,
  onScrollTop,
  registerScroll,
  registerViewerRow,
}: {
  track: LeaderboardTrack;
  active: boolean;
  trackCache: LeaderboardTrackCache | null | undefined;
  pageError: string | null;
  viewerAccountId: string | null;
  isConnected: boolean;
  onNavigate?: () => void;
  onOpenFacts: (entry: ReputationEntry) => void;
  onAppend: (track: LeaderboardTrack, page: LeaderboardBoardResponse) => void;
  onPinnedChange: (track: LeaderboardTrack, pinned: boolean) => void;
  onScrollTop: (track: LeaderboardTrack, top: number) => void;
  registerScroll: (
    track: LeaderboardTrack,
    node: HTMLDivElement | null
  ) => void;
  registerViewerRow: (
    track: LeaderboardTrack,
    node: HTMLDivElement | null
  ) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewerRowRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const settledViewerRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const model = useMemo(
    () => readLeaderboardTrack(track, trackCache, viewerAccountId),
    [track, trackCache, viewerAccountId]
  );
  const { board, rows, hasMore, viewerInListRow, shareViewer } = model;
  const accountIds = useMemo(
    () => (rows ?? []).map((row) => row.accountId),
    [rows]
  );
  const profiles = usePostAuthorProfiles(accountIds);

  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      registerScroll(track, node);
    },
    [registerScroll, track]
  );
  const setViewerNode = useCallback(
    (node: HTMLDivElement | null) => {
      viewerRowRef.current = node;
      registerViewerRow(track, node);
    },
    [registerViewerRow, track]
  );

  useEffect(() => {
    if (!active) return;
    const el = scrollRef.current;
    if (!el) return;
    const publish = () => onScrollTop(track, el.scrollTop);
    publish();
    el.addEventListener('scroll', publish, { passive: true });
    return () => el.removeEventListener('scroll', publish);
  }, [active, onScrollTop, rows, track]);

  useEffect(() => {
    if (!active || !viewerInListRow) {
      if (active) onPinnedChange(track, false);
      return;
    }
    const row = viewerRowRef.current;
    const root = scrollRef.current;
    if (!row || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        onPinnedChange(track, !entry.isIntersecting);
      },
      {
        root,
        threshold: 0.4,
        rootMargin: '0px 0px -6% 0px',
      }
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [active, onPinnedChange, rows, track, viewerInListRow]);

  useEffect(() => {
    if (!active || settledViewerRef.current) return;
    if (!viewerInListRow) {
      if (rows) settledViewerRef.current = true;
      return;
    }
    const row = viewerRowRef.current;
    const scroller = scrollRef.current;
    if (!row || !scroller) return;
    settledViewerRef.current = true;
    scrollRowIntoPage(scroller, row);
  }, [active, rows, viewerInListRow]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !rows) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const data = await fetchLeaderboardBoard(track, {
      limit: LEADERBOARD_PAGE_SIZE,
      offset: rows.length,
      viewerAccountId: null,
    });
    loadingMoreRef.current = false;
    setLoadingMore(false);
    if (!data) return;
    onAppend(track, data);
  }, [hasMore, onAppend, rows, track]);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const node = loadMoreSentinelRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: '120px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingMore, rows]);

  const showSkeleton = !pageError && rows == null;
  const empty = rows != null && rows.length === 0;

  return (
    <section
      role="tabpanel"
      id={`leaderboard-panel-${track}`}
      aria-labelledby={`leaderboard-tab-${track}`}
      aria-hidden={!active}
      className="leaderboard-pager-page"
      data-track={track}
    >
      <div ref={setScrollNode} className="leaderboard-pager-scroll">
        <div className="leaderboard-sheet-page">
          {pageError ? (
            <p className="leaderboard-sheet-empty">{pageError}</p>
          ) : showSkeleton ? (
            <ProfileSocialListSkeleton count={6} rowVariant="leaderboard" />
          ) : empty ? (
            <p className="leaderboard-sheet-empty">
              No rankings yet. Activity will appear once indexed.
            </p>
          ) : (
            <>
              {track === 'influence' && rows ? (
                <InfluenceRows
                  rows={rows as InfluenceEntry[]}
                  profiles={profiles}
                  onNavigate={onNavigate}
                  viewerAccountId={viewerAccountId}
                  viewerRowRef={setViewerNode}
                />
              ) : track === 'reputation' && rows ? (
                <ReputationRows
                  rows={rows as ReputationEntry[]}
                  profiles={profiles}
                  onNavigate={onNavigate}
                  viewerAccountId={viewerAccountId}
                  viewerRowRef={setViewerNode}
                  onOpenFacts={onOpenFacts}
                />
              ) : track === 'earners' && rows ? (
                <EarnerRows
                  rows={rows as EarnerEntry[]}
                  profiles={profiles}
                  onNavigate={onNavigate}
                  viewerAccountId={viewerAccountId}
                  viewerRowRef={setViewerNode}
                />
              ) : null}
              <StandingListLoadMoreFooter
                loadMoreSentinelRef={loadMoreSentinelRef}
                isLoadingMore={loadingMore}
                showSentinel={hasMore}
                skeletonRowVariant="leaderboard"
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
              ) : track === 'earners' &&
                isConnected &&
                !shareViewer &&
                board ? (
                <p className="leaderboard-sheet-footnote">
                  No SOCIAL earned yet — you won&apos;t appear on this board.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
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
  /** Fired when a row link is taken — parent should not also leave to Home. */
  onRowNavigate?: () => void;
}) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [internalTrack, setInternalTrack] =
    useState<LeaderboardTrack>(initialTrack);
  const track = trackProp ?? internalTrack;
  const sheetOpen = open && !closing;
  const { moodId: fetchedMoodId, style: fetchedMoodStyle } =
    useViewerWalletMoodVars(
      viewerAccountId ?? '',
      undefined,
      sheetOpen && Boolean(viewerAccountId)
    );
  const fallbackMood = useMemo(() => resolvePortfolioMood({}), []);
  const viewerMoodId =
    fetchedMoodId ?? (viewerAccountId ? fallbackMood.id : null);
  const viewerMoodStyle = useMemo(() => {
    if (fetchedMoodStyle) return fetchedMoodStyle;
    if (!viewerAccountId) return undefined;
    return {
      ...portfolioMoodShellStyle(fallbackMood.cssVars),
      ...pageContentDrawerPanelStyle(fallbackMood.cssVars),
    } as CSSProperties;
  }, [fallbackMood.cssVars, fetchedMoodStyle, viewerAccountId]);
  const [boostOpen, setBoostOpen] = useState(false);
  const [influenceHintSeen, setInfluenceHintSeen] = useState(
    readInfluenceHintSeen
  );

  const dismissInfluenceHint = useCallback(() => {
    persistInfluenceHintSeen();
    setInfluenceHintSeen(true);
  }, []);

  const committedTrackRef = useRef(track);
  const trackSourceRef = useRef<'open' | 'select' | 'pager' | 'idle'>('open');
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const trackRowRef = useRef<HTMLDivElement | null>(null);
  const thumbBindingRef = useRef<(() => void) | null>(null);
  const pageScrollRefs = useRef<
    Partial<Record<LeaderboardTrack, HTMLDivElement | null>>
  >({});
  const railHiddenRef = useRef<Record<LeaderboardTrack, boolean>>({
    reputation: false,
    influence: false,
    earners: false,
  });
  const railLastTopRef = useRef<Record<LeaderboardTrack, number>>({
    reputation: 0,
    influence: 0,
    earners: 0,
  });
  const railCooldownRef = useRef(0);
  const [trackRailHidden, setTrackRailHidden] = useState(false);
  const viewerRowRefs = useRef<
    Partial<Record<LeaderboardTrack, HTMLDivElement | null>>
  >({});
  const failedTracksRef = useRef<Partial<Record<LeaderboardTrack, boolean>>>(
    {}
  );

  const commitTrack = useCallback(
    (next: LeaderboardTrack) => {
      const previous = committedTrackRef.current;
      if (previous === next) return;
      committedTrackRef.current = next;
      if (previous === 'influence' && next !== 'influence') {
        dismissInfluenceHint();
      }
      if (next !== 'influence') {
        setBoostOpen(false);
      }
      onTrackChange?.(next);
      if (trackProp === undefined) {
        setInternalTrack(next);
      }
    },
    [dismissInfluenceHint, onTrackChange, trackProp]
  );

  const viewerKey = isConnected ? (viewerAccountId ?? '') : '';
  const [cache, setCache] = useState<
    Partial<Record<LeaderboardTrack, LeaderboardTrackCache>>
  >({});
  const cacheRef = useRef(cache);
  const [cacheViewerKey, setCacheViewerKey] = useState(viewerKey);
  const [pageErrors, setPageErrors] = useState<
    Partial<Record<LeaderboardTrack, string>>
  >({});
  if (cacheViewerKey !== viewerKey) {
    setCacheViewerKey(viewerKey);
    setCache({});
    setPageErrors({});
  }
  const [pinnedByTrack, setPinnedByTrack] = useState<
    Partial<Record<LeaderboardTrack, boolean>>
  >({});
  const [listScrolled, setListScrolled] = useState(false);
  const [factsEntry, setFactsEntry] = useState<ReputationEntry | null>(null);

  const boostAccountId = isConnected ? (viewerAccountId ?? '') : '';
  const boostSheetOpen =
    boostOpen &&
    sheetOpen &&
    track === 'influence' &&
    boostAccountId.length > 0;
  const boost = useBoostPosition(boostAccountId, {
    live: boostSheetOpen,
  });

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleRowNavigate = useCallback(() => {
    onRowNavigate?.();
    requestClose();
  }, [onRowNavigate, requestClose]);

  const handleClosed = useCallback(() => {
    if (track === 'influence') {
      dismissInfluenceHint();
    }
    setClosing(false);
    if (trackProp === undefined) {
      setInternalTrack(initialTrack);
    }
    setCache({});
    setPageErrors({});
    failedTracksRef.current = {};
    setPinnedByTrack({});
    setListScrolled(false);
    setFactsEntry(null);
    setBoostOpen(false);
    trackSourceRef.current = 'open';
    onClose();
  }, [dismissInfluenceHint, initialTrack, onClose, track, trackProp]);

  useEffect(() => {
    committedTrackRef.current = track;
  }, [track]);

  const alignPager = useCallback((behavior: ScrollBehavior) => {
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth <= 0) return;
    const left =
      leaderboardTrackIndex(committedTrackRef.current) * pager.clientWidth;
    if (Math.abs(pager.scrollLeft - left) < 2) return;
    pager.scrollTo({ left, behavior });
  }, []);

  useLayoutEffect(() => {
    if (!sheetOpen) {
      trackSourceRef.current = 'open';
      return;
    }
    if (trackSourceRef.current === 'pager') {
      trackSourceRef.current = 'idle';
      placeLeaderboardThumb(pagerRef.current, trackRowRef.current);
      return;
    }
    const behavior =
      trackSourceRef.current === 'select' ? leaderboardPagerMotion() : 'auto';
    alignPager(behavior);
    placeLeaderboardThumb(pagerRef.current, trackRowRef.current);
    trackSourceRef.current = 'idle';
  }, [alignPager, sheetOpen, track]);

  const bindThumb = useCallback(() => {
    thumbBindingRef.current?.();
    thumbBindingRef.current = null;
    const pager = pagerRef.current;
    if (!pager) return;
    const place = () => placeLeaderboardThumb(pager, trackRowRef.current);
    const observer = new ResizeObserver(() => {
      place();
      if (trackSourceRef.current === 'pager') return;
      alignPager('auto');
    });
    // The page sheet portals in after this component's effects. Bind when the
    // nodes exist, and follow the scroll in the same event as the swipe.
    pager.addEventListener('scroll', place, { passive: true });
    observer.observe(pager);
    if (trackRowRef.current) observer.observe(trackRowRef.current);
    const frame = requestAnimationFrame(place);
    thumbBindingRef.current = () => {
      cancelAnimationFrame(frame);
      pager.removeEventListener('scroll', place);
      observer.disconnect();
    };
  }, [alignPager]);

  const setTrackRowNode = useCallback(
    (node: HTMLDivElement | null) => {
      trackRowRef.current = node;
      bindThumb();
    },
    [bindThumb]
  );

  const setPagerNode = useCallback(
    (node: HTMLDivElement | null) => {
      pagerRef.current = node;
      bindThumb();
    },
    [bindThumb]
  );

  useEffect(() => () => thumbBindingRef.current?.(), []);

  const handlePagerScroll = useCallback(() => {
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth <= 0) return;
    placeLeaderboardThumb(pager, trackRowRef.current);
    const next = leaderboardTrackFromPager(pager.scrollLeft, pager.clientWidth);
    if (next === committedTrackRef.current) return;
    trackSourceRef.current = 'pager';
    commitTrack(next);
  }, [commitTrack]);

  const selectTrack = useCallback(
    (next: LeaderboardTrack) => {
      if (next === committedTrackRef.current) return;
      setFactsEntry(null);
      trackSourceRef.current = 'select';
      commitTrack(next);
    },
    [commitTrack]
  );

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    failedTracksRef.current = {};
  }, [viewerKey]);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    const viewer = isConnected ? viewerAccountId : null;
    for (const item of LEADERBOARD_TRACKS) {
      const scope = item.id;
      if (cacheRef.current[scope] || failedTracksRef.current[scope]) continue;
      void fetchLeaderboardBoard(scope, {
        limit: LEADERBOARD_PAGE_SIZE,
        offset: 0,
        viewerAccountId: viewer,
      }).then((data) => {
        if (cancelled) return;
        if (!data) {
          failedTracksRef.current[scope] = true;
          setPageErrors((prev) => ({
            ...prev,
            [scope]: 'Could not load leaderboard.',
          }));
          return;
        }
        setCache((prev) => {
          if (prev[scope]) return prev;
          return {
            ...prev,
            [scope]: appendLeaderboardPage(scope, null, data),
          };
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [sheetOpen, isConnected, viewerAccountId]);

  const appendPage = useCallback(
    (scope: LeaderboardTrack, page: LeaderboardBoardResponse) => {
      setCache((prev) => {
        const current = prev[scope]?.board ?? null;
        return {
          ...prev,
          [scope]: appendLeaderboardPage(scope, current, page),
        };
      });
    },
    []
  );

  const registerScroll = useCallback(
    (scope: LeaderboardTrack, node: HTMLDivElement | null) => {
      pageScrollRefs.current[scope] = node;
    },
    []
  );
  const registerViewerRow = useCallback(
    (scope: LeaderboardTrack, node: HTMLDivElement | null) => {
      viewerRowRefs.current[scope] = node;
    },
    []
  );
  const onPinnedChange = useCallback(
    (scope: LeaderboardTrack, pinned: boolean) => {
      setPinnedByTrack((prev) =>
        prev[scope] === pinned ? prev : { ...prev, [scope]: pinned }
      );
    },
    []
  );
  const onScrollTop = useCallback((scope: LeaderboardTrack, top: number) => {
    const last = railLastTopRef.current[scope] ?? 0;
    const delta = top - last;
    railLastTopRef.current[scope] = top;
    const next = nextDockAutoHidden({
      scrollTop: top,
      delta,
      scrollRoom: scrollRoomOf(pageScrollRefs.current[scope] ?? null),
      hidden: railHiddenRef.current[scope],
    });
    if (next !== railHiddenRef.current[scope]) {
      const now = performance.now();
      const cooling = delta !== 0 && now < railCooldownRef.current;
      if (!cooling) {
        if (delta !== 0) {
          railCooldownRef.current = now + DOCK_TOGGLE_COOLDOWN_MS;
        }
        railHiddenRef.current[scope] = next;
      }
    }
    if (scope !== committedTrackRef.current) return;
    setListScrolled((prev) => {
      const elevated = top > 8;
      return prev === elevated ? prev : elevated;
    });
    setTrackRailHidden(railHiddenRef.current[scope]);
  }, []);

  const viewerId = isConnected ? (viewerAccountId ?? null) : null;
  const activeModel = useMemo(
    () => readLeaderboardTrack(track, cache[track], viewerId),
    [cache, track, viewerId]
  );
  const { rows, shareViewer, leaderValue } = activeModel;
  const pinVisible = pinnedByTrack[track] === true;
  const stickyViewer =
    activeModel.viewerOutside ??
    (pinVisible ? activeModel.viewerInListRow : null);
  const trackHint =
    track === 'influence' && !influenceHintSeen && leaderboardTrackHint(track);
  const showYouLine = Boolean(shareViewer && isConnected);
  const footerIds = useMemo(
    () => (stickyViewer ? [stickyViewer.accountId] : []),
    [stickyViewer]
  );
  const profiles = usePostAuthorProfiles(footerIds);

  const scrollToViewer = useCallback(() => {
    const scroller = pageScrollRefs.current[track];
    const row = viewerRowRefs.current[track];
    if (!scroller || !row) return;
    scrollRowIntoPage(scroller, row);
  }, [track]);

  const stickyFooter =
    stickyViewer && rows && !pageErrors[track] ? (
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

  const headerYouLine = leaderboardHeaderYouLine({
    rank: showYouLine && shareViewer ? shareViewer.rank : null,
    pinVisible: stickyViewer != null,
  });

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
      <OsPageSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        surface="page"
        presentation="appear"
        zIndex={LEADERBOARD_Z}
        ariaLabelledBy={titleId}
        backdropLabel="Close leaderboard"
        moodId={viewerMoodId ?? undefined}
        moodStyle={viewerMoodStyle}
        panelClassName="leaderboard-page-sheet"
        bodyClassName="leaderboard-page-body"
        header={null}
        footer={
          stickyFooter ? (
            <div className="leaderboard-page-footer">{stickyFooter}</div>
          ) : null
        }
      >
        <OsAppScreen
          title="Leaderboard"
          glassChrome
          embedded
          glassScrollElevated={listScrolled}
          moodId={viewerMoodId}
          moodStyle={viewerMoodStyle}
          leading={null}
          heading={
            <>
              <h1 id={titleId} className="os-app-screen-title">
                Leaderboard
              </h1>
              {headerYouLine ? (
                <p className="os-app-screen-subtitle leaderboard-sheet-subline">
                  <button
                    type="button"
                    className="leaderboard-sheet-subline-you is-jump"
                    onClick={scrollToViewer}
                  >
                    {headerYouLine}
                  </button>
                </p>
              ) : null}
            </>
          }
          actions={
            <div className="standing-sheet-actions standing-sheet-actions--payout">
              {showBoostAction ? (
                <OsIconAction
                  ariaLabel={boostAriaLabel}
                  onClick={() => setBoostOpen(true)}
                >
                  <FireFillIcon
                    className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
                    aria-hidden
                  />
                </OsIconAction>
              ) : null}
              <OsIconAction
                ariaLabel="Close leaderboard"
                onClick={requestClose}
              >
                <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
              </OsIconAction>
            </div>
          }
          toolbar={
            <div className="leaderboard-toolbar">
              <div
                className={`os-app-chrome-rail leaderboard-track-rail${
                  trackRailHidden ? ' is-scroll-hidden' : ''
                }`}
              >
                <div
                  ref={setTrackRowNode}
                  className="app-storage-mode-toggle leaderboard-track-row"
                  data-track={track}
                  role="tablist"
                  aria-label="Leaderboard tracks"
                  onKeyDown={(event) => {
                    if (
                      event.key !== 'ArrowRight' &&
                      event.key !== 'ArrowLeft'
                    ) {
                      return;
                    }
                    event.preventDefault();
                    const index = leaderboardTrackIndex(track);
                    const nextIndex =
                      event.key === 'ArrowRight' ? index + 1 : index - 1;
                    const next = LEADERBOARD_TRACKS[nextIndex];
                    if (!next) return;
                    selectTrack(next.id);
                  }}
                >
                  <span className="leaderboard-track-thumb" aria-hidden />
                  {LEADERBOARD_TRACKS.map((item) => (
                    <button
                      key={item.id}
                      id={`leaderboard-tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={track === item.id}
                      aria-controls={`leaderboard-panel-${item.id}`}
                      className={`app-storage-mode${
                        track === item.id ? ' is-active' : ''
                      }`}
                      onClick={() => selectTrack(item.id)}
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
        >
          <div className="leaderboard-sheet-content">
            <div
              ref={setPagerNode}
              className="leaderboard-pager"
              onScroll={handlePagerScroll}
            >
              {LEADERBOARD_TRACKS.map((item) => (
                <LeaderboardTrackPage
                  key={item.id}
                  track={item.id}
                  active={track === item.id}
                  trackCache={cache[item.id]}
                  pageError={pageErrors[item.id] ?? null}
                  viewerAccountId={viewerId}
                  isConnected={isConnected}
                  onNavigate={handleRowNavigate}
                  onOpenFacts={setFactsEntry}
                  onAppend={appendPage}
                  onPinnedChange={onPinnedChange}
                  onScrollTop={onScrollTop}
                  registerScroll={registerScroll}
                  registerViewerRow={registerViewerRow}
                />
              ))}
            </div>
          </div>
        </OsAppScreen>
      </OsPageSheet>

      <LeaderboardReputationPeek
        open={factsEntry != null}
        entry={factsEntry}
        onClose={() => setFactsEntry(null)}
      />

      {showBoostAction ? (
        <PortfolioBoostSheet
          open={boostSheetOpen}
          accountId={boostAccountId}
          position={boost}
          onOpenChange={setBoostOpen}
          zIndex={LEADERBOARD_FACTS_Z}
        />
      ) : null}
    </>
  );
}
