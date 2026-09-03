'use client';

import { useEffect } from 'react';
import { PortfolioDaoKindSwitch } from '@/components/portfolio/portfolio-dao-kind-switch';
import { PortfolioIdentityGestures } from '@/components/portfolio/portfolio-identity-gestures';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { PostRichText } from '@/features/home/post-rich-text';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { isProtocolFacePairDao } from '@/lib/portfolio-dao-entity';
import {
  displayName,
  initials,
  portfolioHandleForMood,
} from '@/lib/profile-display';
import type { ResolvedMood } from '@/lib/moods/types';

interface PortfolioIdentityProps {
  accountId: string;
  profileName?: string | null;
  location?: string | null;
  bio?: string | null;
  tagline?: string;
  avatarUrl?: string | null;
  mood: ResolvedMood;
  /** DAO org face — square crest + quiet kind chrome. */
  isDao?: boolean;
  kindLabel?: string | null;
  incomingStandingCount?: number;
}

export function PortfolioIdentity({
  accountId,
  profileName,
  location,
  bio,
  tagline,
  avatarUrl,
  mood: savedMood,
  isDao = false,
  kindLabel = null,
  incomingStandingCount = 0,
}: PortfolioIdentityProps) {
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? savedMood;

  const titleLabel = displayName(accountId, profileName ?? undefined);
  const summary = tagline?.trim() || bio?.trim();
  const locationLabel = location?.trim() || null;
  const handleLabel = portfolioHandleForMood(accountId, mood.id);

  useEffect(() => {
    if (!isDao) return;
    rememberDaoStandingTarget(accountId);
  }, [accountId, isDao]);

  return (
    <section
      className="portfolio-identity animate-rise-in"
      data-entity={isDao ? 'dao' : undefined}
    >
      {avatarUrl ? (
        <img alt={titleLabel} className="portfolio-avatar" src={avatarUrl} />
      ) : (
        <div className="portfolio-avatar portfolio-avatar-fallback">
          {initials(titleLabel)}
        </div>
      )}

      <div className="portfolio-identity-copy">
        {isDao && isProtocolFacePairDao(accountId) ? (
          <PortfolioDaoKindSwitch accountId={accountId} />
        ) : isDao && kindLabel ? (
          <p className="portfolio-entity-kind">{kindLabel}</p>
        ) : null}
        <div className="portfolio-name-row">
          <h1 className="portfolio-name">{titleLabel}</h1>
          {isDao ? (
            <ProtocolNameTrailing accountId={accountId} isDao={isDao} />
          ) : null}
        </div>
        <p className="portfolio-handle-row">
          <span
            className={`portfolio-handle${mood.id === 'terminal' ? ' portfolio-handle--terminal' : ''}`}
          >
            {handleLabel}
          </span>
          {!isDao ? (
            <span className="portfolio-handle-marks">
              <ProtocolNameTrailing accountId={accountId} isDao={false} />
            </span>
          ) : null}
        </p>
        {locationLabel ? (
          <p className="portfolio-location">
            <PortfolioLocationMark />
            <span>{locationLabel}</span>
          </p>
        ) : null}
        {summary ? (
          <p className="portfolio-bio">
            <PostRichText text={summary} emptyFallback="" showLinkIcon />
          </p>
        ) : null}
        <PortfolioIdentityGestures
          pageAccountId={accountId}
          profileName={profileName}
          bio={bio}
          avatarUrl={avatarUrl}
          mood={mood}
          isDao={isDao}
          incomingStandingCount={incomingStandingCount}
        />
      </div>
    </section>
  );
}
