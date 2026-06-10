import { formatCount } from '@/lib/profile-display';
import type { PublicPageStats } from '@/lib/page-data';

interface PortfolioStatsProps {
  stats: PublicPageStats;
}

const STAT_ITEMS = [
  { key: 'standingCount', label: 'Standing' },
  { key: 'postCount', label: 'Posts' },
  { key: 'badgeCount', label: 'Badges' },
  { key: 'groupCount', label: 'Groups' },
] as const;

export function PortfolioStats({ stats }: PortfolioStatsProps) {
  return (
    <section className="portfolio-stats" aria-label="Profile stats">
      {STAT_ITEMS.map(({ key, label }) => (
        <div key={key} className="portfolio-stat">
          <span className="portfolio-stat-value">
            {formatCount(stats[key] ?? 0)}
          </span>
          <span className="portfolio-stat-label">{label}</span>
        </div>
      ))}
    </section>
  );
}
