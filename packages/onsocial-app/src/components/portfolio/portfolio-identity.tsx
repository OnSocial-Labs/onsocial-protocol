import { displayName, initials } from '@/lib/profile-display';
import type { PublicPageConfig } from '@/lib/page-data';
import type { ResolvedMood } from '@/lib/moods/types';
import { MoodIndicator } from '@/components/moods/mood-indicator';

interface PortfolioIdentityProps {
  accountId: string;
  pageConfig: PublicPageConfig;
  profileName?: string | null;
  bio?: string | null;
  tagline?: string;
  avatarUrl?: string | null;
  mood: ResolvedMood;
}

export function PortfolioIdentity({
  accountId,
  pageConfig,
  profileName,
  bio,
  tagline,
  avatarUrl,
  mood,
}: PortfolioIdentityProps) {
  const titleLabel = displayName(accountId, profileName ?? undefined);
  const summary = tagline?.trim() || bio?.trim();

  return (
    <section className="portfolio-identity animate-rise-in">
      {avatarUrl ? (
        <img alt={titleLabel} className="portfolio-avatar" src={avatarUrl} />
      ) : (
        <div className="portfolio-avatar portfolio-avatar-fallback">
          {initials(titleLabel)}
        </div>
      )}

      <div className="portfolio-identity-copy">
        <h1 className="portfolio-name">{titleLabel}</h1>
        <p className="portfolio-handle">@{accountId}</p>
        <MoodIndicator
          mood={mood}
          pageAccountId={accountId}
          pageConfig={pageConfig}
          compact
        />
        {summary ? <p className="portfolio-bio">{summary}</p> : null}
      </div>
    </section>
  );
}
