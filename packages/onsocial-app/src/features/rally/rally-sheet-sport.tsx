'use client';

import Link from 'next/link';
import { displayName } from '@/lib/profile-display';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  formatRallyRankLabel,
  type RallyBoardRow,
} from '@/lib/rally-season';

function formatScore(score: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    score
  );
}

export function RallySheetSport({
  rows,
  viewerAccountId,
}: {
  rows: readonly RallyBoardRow[];
  viewerAccountId?: string | null;
}) {
  const you = viewerAccountId?.trim().toLowerCase() ?? '';
  if (rows.length === 0) return null;

  return (
    <ol className="portfolio-rally-strip" aria-label="Standings">
      {rows.map((row) => {
        const isYou = you.length > 0 && row.accountId.toLowerCase() === you;
        const name = isYou ? 'You' : displayName(row.accountId, row.displayName);
        return (
          <li
            key={`${row.rank}:${row.accountId}`}
            className={`portfolio-rally-strip-row${isYou ? ' is-you' : ''}`}
          >
            <span className="portfolio-rally-strip-rank">
              {formatRallyRankLabel(row.rank)}
            </span>
            {isYou ? (
              <span className="portfolio-rally-strip-name">{name}</span>
            ) : (
              <Link
                href={portfolioPath(row.accountId)}
                scroll={false}
                className="portfolio-rally-strip-name"
              >
                {name}
              </Link>
            )}
            <span className="portfolio-rally-strip-score">
              {formatScore(row.score)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
