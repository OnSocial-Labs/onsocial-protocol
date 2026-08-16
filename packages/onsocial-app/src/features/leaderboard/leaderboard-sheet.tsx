'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Divider, StandingIdentity } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import {
  commitmentLabel,
  entriesForTrack,
  fetchLeaderboardBoard,
  formatReputationScore,
  formatSocialCompact,
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_TRACKS,
  LEADERBOARD_Z,
  pctOfLeader,
  reputationTierLabel,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardBoardResponse,
  type LeaderboardTrack,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { portfolioPath } from '@/lib/overlay-routes';

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="leaderboard-row-bar" aria-hidden>
      <span
        className="leaderboard-row-bar-fill"
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

function BoardRow({
  accountId,
  rank,
  meta,
  primary,
  primaryLabel,
  pct,
  profile,
  onNavigate,
}: {
  accountId: string;
  rank: number;
  meta: string;
  primary: string;
  primaryLabel: string;
  pct: number;
  profile?: PostAuthorProfile;
  onNavigate?: () => void;
}) {
  return (
    <div className="standing-row leaderboard-row">
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
          <span className="standing-row-bio leaderboard-row-meta">{meta}</span>
          <ProgressBar pct={pct} />
        </StandingIdentity>
      </Link>
      <div className="standing-row-aside leaderboard-row-aside">
        <span className="leaderboard-row-primary">{primary}</span>
        <span className="leaderboard-row-primary-label">{primaryLabel}</span>
      </div>
    </div>
  );
}

function BoardList({
  children,
}: {
  children: React.ReactNode;
}) {
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
}: {
  rows: InfluenceEntry[];
  profiles: Record<string, PostAuthorProfile>;
  onNavigate?: () => void;
}) {
  const leader = rows[0]?.effectiveBoost ?? '1';
  return (
    <BoardList>
      {rows.map((entry, index) => (
        <div key={entry.accountId} role="listitem">
          {index > 0 ? <Divider variant="item" /> : null}
          <BoardRow
            accountId={entry.accountId}
            rank={entry.rank}
            meta={commitmentLabel(entry.lockMonths)}
            primary={formatSocialCompact(entry.effectiveBoost)}
            primaryLabel="Boost"
            pct={pctOfLeader(entry.effectiveBoost, leader)}
            profile={profiles[entry.accountId]}
            onNavigate={onNavigate}
          />
        </div>
      ))}
    </BoardList>
  );
}

function ReputationRows({
  rows,
  profiles,
  onNavigate,
}: {
  rows: ReputationEntry[];
  profiles: Record<string, PostAuthorProfile>;
  onNavigate?: () => void;
}) {
  const leader = rows[0]?.reputation ?? '1';
  return (
    <BoardList>
      {rows.map((entry, index) => {
        const bits = [
          entry.standingWith > 0 ? `${entry.standingWith} stand` : null,
          entry.totalPosts > 0 ? `${entry.totalPosts} posts` : null,
          entry.activeDays > 0 ? `${entry.activeDays}d` : null,
        ].filter(Boolean);
        return (
          <div key={entry.accountId} role="listitem">
            {index > 0 ? <Divider variant="item" /> : null}
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              meta={[reputationTierLabel(entry.rank), ...bits].join(' · ')}
              primary={formatReputationScore(entry.reputation)}
              primaryLabel="Rep"
              pct={pctOfLeader(entry.reputation, leader)}
              profile={profiles[entry.accountId]}
              onNavigate={onNavigate}
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
}: {
  rows: EarnerEntry[];
  profiles: Record<string, PostAuthorProfile>;
  onNavigate?: () => void;
}) {
  const leader = rows[0]?.totalEarned ?? '1';
  return (
    <BoardList>
      {rows.map((entry, index) => {
        const unclaimed =
          entry.unclaimed &&
          entry.unclaimed !== '0' &&
          entry.unclaimed !== ''
            ? `${formatSocialCompact(entry.unclaimed)} claimable`
            : null;
        return (
          <div key={entry.accountId} role="listitem">
            {index > 0 ? <Divider variant="item" /> : null}
            <BoardRow
              accountId={entry.accountId}
              rank={entry.rank}
              meta={unclaimed ?? 'Earned on protocol'}
              primary={formatSocialCompact(entry.totalEarned)}
              primaryLabel="Earned"
              pct={pctOfLeader(entry.totalEarned, leader)}
              profile={profiles[entry.accountId]}
              onNavigate={onNavigate}
            />
          </div>
        );
      })}
    </BoardList>
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
  const [sheetOpen, setSheetOpen] = useState(open);
  const [track, setTrack] = useState<LeaderboardTrack>(initialTrack);
  if (open && !sheetOpen) {
    setSheetOpen(true);
    setTrack(initialTrack);
  }

  const [cache, setCache] = useState<
    Partial<Record<LeaderboardTrack, LeaderboardBoardResponse>>
  >({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setCache({});
    setError(null);
    setPending(false);
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

    void fetchLeaderboardBoard(track, LEADERBOARD_PAGE_SIZE).then((data) => {
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
  }, [sheetOpen, track, cache]);

  const board = cache[track] ?? null;
  const rows = entriesForTrack(track, board);
  const accountIds = useMemo(
    () => (rows ?? []).map((row) => row.accountId),
    [rows]
  );
  const profiles = usePostAuthorProfiles(accountIds);

  const empty =
    rows != null && rows.length === 0
      ? 'No rankings yet. Activity will appear once indexed.'
      : null;
  const showSkeleton = pending && rows == null;

  return (
    <OsSlideOverScreen
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title="Leaderboard"
      subtitle="Protocol rankings"
      zIndex={LEADERBOARD_Z}
      closeAriaLabel="Back from leaderboard"
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
              className={`os-surface-chip${
                track === item.id ? ' is-selected' : ''
              }`}
              onClick={() => {
                setError(null);
                setTrack(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
      contentClassName="leaderboard-sheet-content"
    >
      {error ? (
        <p className="leaderboard-sheet-empty">{error}</p>
      ) : showSkeleton ? (
        <ProfileSocialListSkeleton count={6} />
      ) : empty ? (
        <p className="leaderboard-sheet-empty">{empty}</p>
      ) : track === 'influence' && rows ? (
        <InfluenceRows
          rows={rows as InfluenceEntry[]}
          profiles={profiles}
          onNavigate={requestClose}
        />
      ) : track === 'reputation' && rows ? (
        <ReputationRows
          rows={rows as ReputationEntry[]}
          profiles={profiles}
          onNavigate={requestClose}
        />
      ) : track === 'earners' && rows ? (
        <EarnerRows
          rows={rows as EarnerEntry[]}
          profiles={profiles}
          onNavigate={requestClose}
        />
      ) : (
        <ProfileSocialListSkeleton count={6} />
      )}
    </OsSlideOverScreen>
  );
}
