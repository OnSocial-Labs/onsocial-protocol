'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { displayName } from '@/lib/profile-display';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  formatRallyRankLabel,
  resolveRallyMeritWhy,
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
  ended = false,
}: {
  rows: readonly RallyBoardRow[];
  viewerAccountId?: string | null;
  ended?: boolean;
}) {
  const you = viewerAccountId?.trim().toLowerCase() ?? '';
  const whyId = useId();
  const [whyOpen, setWhyOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <ol className="portfolio-rally-strip" aria-label="Standings">
      {rows.map((row) => {
        const isYou = you.length > 0 && row.accountId.toLowerCase() === you;
        const name = isYou ? 'You' : displayName(row.accountId, row.displayName);
        const why = isYou ? resolveRallyMeritWhy(row.breakdown, ended) : '';
        return (
          <li
            key={`${row.rank}:${row.accountId}`}
            className={`portfolio-rally-strip-item${isYou ? ' is-you' : ''}`}
          >
            {isYou ? (
              <button
                type="button"
                className="portfolio-rally-strip-row portfolio-rally-strip-you"
                aria-expanded={whyOpen}
                aria-controls={whyId}
                onClick={() => setWhyOpen((open) => !open)}
              >
                <span className="portfolio-rally-strip-rank">
                  {formatRallyRankLabel(row.rank)}
                </span>
                <span className="portfolio-rally-strip-name">{name}</span>
                <span className="portfolio-rally-strip-score">
                  {formatScore(row.score)}
                </span>
              </button>
            ) : (
              <div className="portfolio-rally-strip-row">
                <span className="portfolio-rally-strip-rank">
                  {formatRallyRankLabel(row.rank)}
                </span>
                <Link
                  href={portfolioPath(row.accountId)}
                  scroll={false}
                  className="portfolio-rally-strip-name"
                >
                  {name}
                </Link>
                <span className="portfolio-rally-strip-score">
                  {formatScore(row.score)}
                </span>
              </div>
            )}
            {isYou && whyOpen ? (
              <p id={whyId} className="portfolio-rally-why">
                {why}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
