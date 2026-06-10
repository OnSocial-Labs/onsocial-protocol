import {
  displayName,
  initials,
  normalizeLink,
} from '@/lib/profile-display';
import { getActiveNearNetwork } from '@/lib/page-data';
import type { ResolvedMood } from '@/lib/moods/types';
import { MoodIndicator } from '@/components/moods/mood-indicator';

interface PortfolioIdentityProps {
  accountId: string;
  profileName?: string;
  bio?: string;
  tagline?: string;
  avatar?: string;
  activated?: boolean;
  mood: ResolvedMood;
}

export function PortfolioIdentity({
  accountId,
  profileName,
  bio,
  tagline,
  avatar,
  activated = false,
  mood,
}: PortfolioIdentityProps) {
  const titleLabel = displayName(accountId, profileName);
  const avatarUrl = normalizeLink(avatar ?? '');
  const summary = tagline?.trim() || bio?.trim();
  const nearNetwork = getActiveNearNetwork();

  return (
    <section className="portfolio-identity animate-rise-in">
      <div className="portfolio-banner" aria-hidden="true" />

      <div className="portfolio-identity-body">
        {avatarUrl ? (
          <img
            alt={titleLabel}
            className="portfolio-avatar"
            height={96}
            src={avatarUrl}
            width={96}
          />
        ) : (
          <div className="portfolio-avatar portfolio-avatar-fallback">
            {initials(titleLabel)}
          </div>
        )}

        <div className="portfolio-identity-copy">
          <h1 className="portfolio-name">{titleLabel}</h1>
          <p className="portfolio-handle">@{accountId}</p>
          <MoodIndicator mood={mood} pageAccountId={accountId} />
          {summary ? <p className="portfolio-tagline">{summary}</p> : null}
        </div>

        <div className="portfolio-status">
          <span className="profile-dot" data-active={activated} />
          <span>{activated ? 'Active' : 'Dormant'}</span>
          <span className="profile-sep" />
          <span>{nearNetwork}</span>
        </div>
      </div>
    </section>
  );
}
