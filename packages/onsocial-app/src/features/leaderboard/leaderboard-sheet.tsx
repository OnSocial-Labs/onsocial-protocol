'use client';

/**
 * In-app protocol leaderboard (slide-over).
 *
 * Reuses @onsocial/ui StandingIdentity + standing-row chrome and OsSlideOverScreen.
 * Rank / pct bars / viewer pin stay host-local — no second UI consumer yet.
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
import { Divider, StandingIdentity } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import {
  commitmentLabel,
  entriesForTrack,
  fetchLeaderboardBoard,
  findViewerEntry,
  formatReputationScore,
  formatSocialCompact,
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  LEADERBOARD_Z,
  leaderboardTrackSubtitle,
  pctOfLeader,
  reputationBoardMeta,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardBoardResponse,
  type LeaderboardTrack,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { portfolioPath } from '@/lib/overlay-routes';

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
  isViewer?: boolean;
  rowRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      className={`standing-row leaderboard-row${isViewer ? ' is-viewer' : ''}${topRankClass(rank)}`}
    >
      <Link
        href={portfolioPath(accountId)}
        className="standing-row-main"
        scroll={false}
        aria-label={
          profile?.displayName?.trim()
            ? `${profile.displayName} · rank ${rank}`
            : `@${accountId} · rank ${rank}`
        }
        onClick={onNavigate}
      >
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
      </Link>
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
  onNavigate,
  viewerAccountId,
  viewerRowRef,
}: {
  rows: ReputationEntry[];
  profiles: Record<string, PostAuthorProfile>;
  onNavigate?: () => void;
  viewerAccountId?: string | null;
  viewerRowRef?: Ref<HTMLDivElement>;
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
}: {
  track: LeaderboardTrack;
  entry: InfluenceEntry | ReputationEntry | EarnerEntry;
  leaderValue: string;
  profile?: PostAuthorProfile;
  onNavigate?: () => void;
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
          onNavigate={onNavigate}
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
    Partial<Record<LeaderboardTrack, LeaderboardBoardResponse>>
  >({});
  const [cacheViewerKey, setCacheViewerKey] = useState(viewerKey);
  if (cacheViewerKey !== viewerKey) {
    setCacheViewerKey(viewerKey);
    setCache({});
  }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerPinned, setViewerPinned] = useState(false);
  const requestIdRef = useRef(0);
  const viewerRowRef = useRef<HTMLDivElement | null>(null);
  const scrolledForKeyRef = useRef('');

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setCache({});
    setError(null);
    setPending(false);
    setViewerPinned(false);
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

    void fetchLeaderboardBoard(
      track,
      LEADERBOARD_PAGE_SIZE,
      isConnected ? viewerAccountId : null
    ).then((data) => {
      if (cancelled || requestId !== requestIdRef.current) return;
      setPending(false);
      if (!data) {
        setError('Could not load leaderboard.');
        return;
      }
      setCache((prev) => ({ ...prev, [track]: data }));
    });

    return () => {
      cancelled = true;
    };
  }, [sheetOpen, track, cache, isConnected, viewerAccountId]);

  const board = cache[track] ?? null;
  const rows = entriesForTrack(track, board);
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
      />
    ) : null;

  return (
    <OsSlideOverScreen
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title="Leaderboard"
      subtitle={leaderboardTrackSubtitle(track)}
      zIndex={LEADERBOARD_Z}
      closeAriaLabel="Back from leaderboard"
      className="leaderboard-slide"
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
              onNavigate={requestClose}
              viewerAccountId={viewerAccountId}
              viewerRowRef={viewerRowRef}
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
          {!isConnected ? (
            <p className="leaderboard-sheet-footnote">
              Connect a wallet to see your rank on this board.
            </p>
          ) : null}
        </>
      )}
    </OsSlideOverScreen>
  );
}
