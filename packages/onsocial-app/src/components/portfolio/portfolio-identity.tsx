'use client';

import { useEffect } from 'react';
import { PortfolioDaoKindSwitch } from '@/components/portfolio/portfolio-dao-kind-switch';
import { PortfolioIdentityGestures } from '@/components/portfolio/portfolio-identity-gestures';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { PostRichText } from '@/features/home/post-rich-text';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { isProtocolFacePairDao } from '@/lib/portfolio-dao-entity';
import { displayName, initials } from '@/lib/profile-display';
import type { ResolvedMood } from '@/lib/moods/types';

interface PortfolioIdentityProps {
  accountId: string;
  profileName?: string | null;
  bio?: string | null;
  tagline?: string;
  avatarUrl?: string | null;
  mood: ResolvedMood;
  /** DAO org face — square crest + quiet kind chrome. */
  isDao?: boolean;
  kindLabel?: string | null;
}

export function PortfolioIdentity({
  accountId,
  profileName,
  bio,
  tagline,
  avatarUrl,
  mood: savedMood,
  isDao = false,
  kindLabel = null,
}: PortfolioIdentityProps) {
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? savedMood;

  const titleLabel = displayName(accountId, profileName ?? undefined);
  const summary = tagline?.trim() || bio?.trim();
  const handleLabel =
    mood.id === 'terminal'
      ? `~/${accountId}`
      : mood.id === 'signature'
        ? `@${accountId.toLowerCase()}`
        : `@${accountId}`;

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
        <h1 className="portfolio-name">{titleLabel}</h1>
        <p
          className={`portfolio-handle${mood.id === 'terminal' ? ' portfolio-handle--terminal' : ''}`}
        >
          {handleLabel}
        </p>
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
        />
      </div>
    </section>
  );
}
