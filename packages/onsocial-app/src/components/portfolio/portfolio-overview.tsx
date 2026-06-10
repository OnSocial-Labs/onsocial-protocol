import type { PublicPageData } from '@/lib/page-data';
import { PortfolioNav } from '@/components/portfolio/portfolio-nav';

interface PortfolioOverviewProps {
  accountId: string;
  data: PublicPageData;
}

export function PortfolioOverview({ accountId, data }: PortfolioOverviewProps) {
  const postCount = data.recentPosts?.length ?? 0;

  return (
    <>
      <PortfolioNav accountId={accountId} />

      <section className="portfolio-section">
        <div className="portfolio-section-header">
          <h2 className="portfolio-section-title">OnSocial page</h2>
          <p className="portfolio-section-copy">
            Open feed, endorsements, and standing as glass panels over this
            portfolio.
          </p>
        </div>

        <div className="portfolio-preview-grid">
          <article className="portfolio-preview-card">
            <span className="portfolio-preview-label">Recent posts</span>
            <strong className="portfolio-preview-value">{postCount}</strong>
            <p className="portfolio-preview-copy">
              {postCount > 0
                ? 'Latest activity from this account.'
                : 'No posts indexed yet.'}
            </p>
          </article>

          <article className="portfolio-preview-card">
            <span className="portfolio-preview-label">Badges</span>
            <strong className="portfolio-preview-value">
              {data.badges?.length ?? 0}
            </strong>
            <p className="portfolio-preview-copy">
              Collectibles and attestations will appear here.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
