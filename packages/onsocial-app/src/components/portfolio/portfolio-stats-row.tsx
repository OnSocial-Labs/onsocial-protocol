'use client';

import Link from 'next/link';
import { formatCount } from '@/lib/profile-display';
import { overlayPath } from '@/lib/overlay-routes';
import type { PublicPageStats } from '@/lib/page-data';

interface PortfolioStatsRowProps {
  accountId: string;
  stats: PublicPageStats;
}

interface StatItem {
  count: number;
  label: string;
  href?: string;
}

export function PortfolioStatsRow({ accountId, stats }: PortfolioStatsRowProps) {
  const items: StatItem[] = [
    {
      count: stats.standingCount,
      label: 'standing',
      href: overlayPath(accountId, 'standing'),
    },
    {
      count: stats.postCount,
      label: 'posts',
      href: overlayPath(accountId, 'feed'),
    },
  ];

  if (stats.badgeCount > 0) {
    items.push({
      count: stats.badgeCount,
      label: 'badges',
    });
  }

  return (
    <p className="portfolio-stats-inline" aria-label="Profile stats">
      {items.map((item, index) => (
        <span key={item.label} className="portfolio-stats-item">
          {index > 0 ? (
            <span className="portfolio-stats-sep" aria-hidden>
              ·
            </span>
          ) : null}
          {item.href ? (
            <Link
              className="portfolio-stats-link"
              href={item.href}
              scroll={false}
            >
              {formatCount(item.count)} {item.label}
            </Link>
          ) : (
            <span className="portfolio-stats-text">
              {formatCount(item.count)} {item.label}
            </span>
          )}
        </span>
      ))}
    </p>
  );
}
