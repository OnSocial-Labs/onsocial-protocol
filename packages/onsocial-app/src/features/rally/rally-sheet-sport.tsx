'use client';

import { MediaFaceIdentity } from '@/components/profile/media-face-identity';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import type { RallyBoardRow } from '@/lib/rally-season';

function formatScore(score: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    score
  );
}

export function RallySheetSport({ rows }: { rows: readonly RallyBoardRow[] }) {
  const profiles = usePostAuthorProfiles(rows.map((row) => row.accountId));
  if (rows.length === 0) return null;

  return (
    <ol className="portfolio-rally-strip" aria-label="Standings">
      {rows.map((row) => {
        const profile = profiles[row.accountId];
        return (
          <li
            key={`${row.rank}:${row.accountId}`}
            className="portfolio-rally-strip-item"
          >
            <div
              className={`portfolio-rally-strip-row${row.rank <= 3 ? ' is-top' : ''}`}
            >
              <span className="portfolio-rally-strip-rank">{row.rank}</span>
              <MediaFaceIdentity
                accountId={row.accountId}
                profileName={profile?.displayName || row.displayName}
                avatarUrl={profile?.avatarUrl || row.avatarUrl}
                kind={profile?.kind}
                size="sm"
              />
              <span className="portfolio-rally-strip-score">
                {formatScore(row.score)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
