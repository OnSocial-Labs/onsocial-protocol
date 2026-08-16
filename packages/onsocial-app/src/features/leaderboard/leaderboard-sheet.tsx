'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Divider, StandingIdentity } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import {
  commitmentLabel,
  fetchLeaderboardBoard,
  formatLeaderboardScore,
  formatReputationScore,
  formatSocialCompact,
  pctOfLeader,
  reputationTierLabel,
  type EarnerEntry,
  type InfluenceEntry,
  type LeaderboardTrack,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { portfolioPath } from '@/lib/overlay-routes';

const BOARD_LIMIT = 20;
const LEADERBOARD_Z = 74;

const TRACKS: { id: LeaderboardTrack; label: string }[] = [
  { id: 'reputation', label: 'Reputation' },
  { id: 'influence', label: 'Influence' },
  { id: 'earners', label: 'Earners' },
];

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

function BoardRowShell({
  accountId,
  rank,
  meta,
  primary,
  primaryLabel,
  pct,
  onNavigate,
}: {
  accountId: string;
  rank: number;
  meta: string;
  primary: string;
  primaryLabel: string;
  pct: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="standing-row leaderboard-row">
      <div className="standing-row-main">
        <Link
          href={portfolioPath(accountId)}
          className="standing-row-hit"
          scroll={false}
          aria-label={`@${accountId}`}
          onClick={onNavigate}
        />
        <span className="leaderboard-row-rank" aria-hidden>
          {rank}
        </span>
        <StandingIdentity accountId={accountId} size="md" showHandle={false}>
          <span className="standing-row-bio leaderboard-row-meta">{meta}</span>
          <ProgressBar pct={pct} />
        </StandingIdentity>
      </div>
      <div className="standing-row-aside leaderboard-row-aside">
        <span className="leaderboard-row-primary">{primary}</span>
        <span className="leaderboard-row-primary-label">{primaryLabel}</span>
      </div>
    </div>
  );
}

function InfluenceRows({
  rows,
  onNavigate,
}: {
  rows: InfluenceEntry[];
  onNavigate?: () => void;
}) {
  const leader = rows[0]?.effectiveBoost ?? '1';
  return (
    <div className="leaderboard-list" role="list">
      {rows.map((entry, index) => (
        <div key={entry.accountId} role="listitem">
          <BoardRowShell
            accountId={entry.accountId}
            rank={entry.rank}
            meta={commitmentLabel(entry.lockMonths)}
            primary={formatSocialCompact(entry.effectiveBoost)}
            primaryLabel="Boost"
            pct={pctOfLeader(entry.effectiveBoost, leader)}
            onNavigate={onNavigate}
          />
          {index < rows.length - 1 ? <Divider /> : null}
        </div>
      ))}
    </div>
  );
}

function ReputationRows({
  rows,
  onNavigate,
}: {
  rows: ReputationEntry[];
  onNavigate?: () => void;
}) {
  const leader = rows[0]?.reputation ?? '1';
  return (
    <div className="leaderboard-list" role="list">
      {rows.map((entry, index) => {
        const bits = [
          entry.standingWith > 0 ? `${entry.standingWith} stand` : null,
          entry.totalPosts > 0 ? `${entry.totalPosts} posts` : null,
          entry.activeDays > 0 ? `${entry.activeDays}d` : null,
        ].filter(Boolean);
        return (
          <div key={entry.accountId} role="listitem">
            <BoardRowShell
              accountId={entry.accountId}
              rank={entry.rank}
              meta={[reputationTierLabel(entry.rank), ...bits].join(' · ')}
              primary={formatReputationScore(entry.reputation)}
              primaryLabel="Rep"
              pct={pctOfLeader(entry.reputation, leader)}
              onNavigate={onNavigate}
            />
            {index < rows.length - 1 ? <Divider /> : null}
          </div>
        );
      })}
    </div>
  );
}

function EarnerRows({
  rows,
  onNavigate,
}: {
  rows: EarnerEntry[];
  onNavigate?: () => void;
}) {
  const leader = rows[0]?.totalEarned ?? '1';
  return (
    <div className="leaderboard-list" role="list">
      {rows.map((entry, index) => {
        const unclaimed =
          entry.unclaimed &&
          entry.unclaimed !== '0' &&
          entry.unclaimed !== ''
            ? `${formatSocialCompact(entry.unclaimed)} claimable`
            : null;
        return (
          <div key={entry.accountId} role="listitem">
            <BoardRowShell
              accountId={entry.accountId}
              rank={entry.rank}
              meta={unclaimed ?? 'Earned on protocol'}
              primary={formatSocialCompact(entry.totalEarned)}
              primaryLabel="Earned"
              pct={pctOfLeader(entry.totalEarned, leader)}
              onNavigate={onNavigate}
            />
            {index < rows.length - 1 ? <Divider /> : null}
          </div>
        );
      })}
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
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const [track, setTrack] = useState<LeaderboardTrack>(initialTrack);
  const [influence, setInfluence] = useState<InfluenceEntry[] | null>(null);
  const [reputation, setReputation] = useState<ReputationEntry[] | null>(null);
  const [earners, setEarners] = useState<EarnerEntry[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setInfluence(null);
    setReputation(null);
    setEarners(null);
    setError(null);
    setPending(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setTrack(initialTrack);
  }, [open, initialTrack]);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });

    void fetchLeaderboardBoard(track, BOARD_LIMIT).then((data) => {
      if (cancelled) return;
      setPending(false);
      if (!data) {
        setError('Could not load leaderboard.');
        return;
      }
      if (track === 'influence') {
        setInfluence(data.leaderboardBoost ?? []);
      } else if (track === 'reputation') {
        setReputation(data.reputationScores ?? []);
      } else {
        setEarners(data.leaderboardRewards ?? []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sheetOpen, track]);

  const rows =
    track === 'influence'
      ? influence
      : track === 'reputation'
        ? reputation
        : earners;
  const empty =
    rows != null && rows.length === 0
      ? 'No rankings yet. Activity will appear once indexed.'
      : null;

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
          {TRACKS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={track === item.id}
              className={`os-surface-chip${
                track === item.id ? ' is-selected' : ''
              }`}
              onClick={() => setTrack(item.id)}
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
      ) : pending && rows == null ? (
        <ProfileSocialListSkeleton count={6} />
      ) : empty ? (
        <p className="leaderboard-sheet-empty">{empty}</p>
      ) : track === 'influence' && influence ? (
        <InfluenceRows rows={influence} onNavigate={requestClose} />
      ) : track === 'reputation' && reputation ? (
        <ReputationRows rows={reputation} onNavigate={requestClose} />
      ) : track === 'earners' && earners ? (
        <EarnerRows rows={earners} onNavigate={requestClose} />
      ) : (
        <ProfileSocialListSkeleton count={6} />
      )}
      {track === 'reputation' && reputation?.[0] ? (
        <p className="leaderboard-sheet-footnote">
          Top score {formatLeaderboardScore(reputation[0].socialScore)} social ·{' '}
          {formatLeaderboardScore(reputation[0].commitmentScore)} commitment ·{' '}
          {formatLeaderboardScore(reputation[0].qualityScore)} quality
        </p>
      ) : null}
    </OsSlideOverScreen>
  );
}
