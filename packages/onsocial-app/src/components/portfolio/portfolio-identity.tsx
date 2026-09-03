'use client';

import { useEffect } from 'react';
import { PortfolioDaoKindSwitch } from '@/components/portfolio/portfolio-dao-kind-switch';
import { PortfolioIdentityGestures } from '@/components/portfolio/portfolio-identity-gestures';
import { PortfolioFaceBio } from '@/components/portfolio/portfolio-face-bio';
import { PortfolioIdentityTopics } from '@/components/portfolio/portfolio-identity-topics';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { PortfolioHiringLine } from '@/components/portfolio/portfolio-hiring-line';
import { PortfolioOrgKindMark } from '@/components/portfolio/portfolio-org-kind-mark';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { isProtocolFacePairDao } from '@/lib/portfolio-dao-entity';
import {
  profileKindFaceLabel,
  profileOrgLineLabel,
  resolveDisplayProfileKind,
  type JobSearchRow,
  type ProfileKind,
} from '@onsocial/sdk';
import {
  displayName,
  initials,
  portfolioHandleForMood,
} from '@/lib/profile-display';
import { profileAboutHasMoreThanFace } from '@/lib/profile-bio-face';
import type { ResolvedMood } from '@/lib/moods/types';

interface PortfolioIdentityProps {
  accountId: string;
  profileName?: string | null;
  location?: string | null;
  /** User-curated org line next to the building mark. */
  industry?: string | null;
  bio?: string | null;
  /** Full `profile/bio` (and dao fallback) — About, not the face tagline. */
  aboutBio?: string | null;
  /** Curated identity topics (`profile/tags`). */
  tags?: string[] | null;
  tagline?: string;
  avatarUrl?: string | null;
  mood: ResolvedMood;
  /** DAO org face — square crest + quiet kind chrome. */
  isDao?: boolean;
  /** Optional `profile/kind`. Omit / person is an individual. */
  profileKind?: ProfileKind | null;
  kindLabel?: string | null;
  incomingStandingCount?: number;
  openJobs?: JobSearchRow[];
}

export function PortfolioIdentity({
  accountId,
  profileName,
  location,
  industry = null,
  bio,
  aboutBio = null,
  tags = null,
  tagline,
  avatarUrl,
  mood: savedMood,
  isDao = false,
  profileKind = null,
  kindLabel = null,
  incomingStandingCount = 0,
  openJobs = [],
}: PortfolioIdentityProps) {
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? savedMood;
  const displayKind = resolveDisplayProfileKind(profileKind, isDao);
  const profileKindLabel = profileKindFaceLabel(displayKind);

  const titleLabel = displayName(accountId, profileName ?? undefined);
  const summary = tagline?.trim() || bio?.trim() || '';
  const locationLabel = location?.trim() || null;
  const showAbout = profileAboutHasMoreThanFace({
    faceText: summary,
    aboutText: aboutBio,
  });
  const handleLabel = portfolioHandleForMood(accountId, mood.id);

  useEffect(() => {
    if (!isDao) return;
    rememberDaoStandingTarget(accountId);
  }, [accountId, isDao]);

  return (
    <section
      className="portfolio-identity animate-rise-in"
      data-profile-kind={displayKind}
    >
      {avatarUrl ? (
        <img alt={titleLabel} className="portfolio-avatar" src={avatarUrl} />
      ) : (
        <div className="portfolio-avatar portfolio-avatar-fallback">
          {initials(titleLabel)}
        </div>
      )}

      <div className="portfolio-identity-copy">
        {displayKind !== 'org' &&
        isDao &&
        isProtocolFacePairDao(accountId) ? (
          <PortfolioDaoKindSwitch accountId={accountId} />
        ) : displayKind !== 'org' && isDao && kindLabel ? (
          <p className="portfolio-entity-kind">{kindLabel}</p>
        ) : displayKind === 'dao' && profileKindLabel ? (
          <p className="portfolio-entity-kind">{profileKindLabel}</p>
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
        <PortfolioIdentityTopics tags={tags} />
        {displayKind === 'org' ? (
          <p className="portfolio-location" data-profile-kind-line="org">
            <PortfolioOrgKindMark />
            <span>{profileOrgLineLabel(industry)}</span>
          </p>
        ) : null}
        {displayKind === 'org' ? (
          <PortfolioHiringLine
            accountId={accountId}
            orgName={titleLabel}
            initialJobs={openJobs}
          />
        ) : null}
        {locationLabel ? (
          <p className="portfolio-location">
            <PortfolioLocationMark />
            <span>{locationLabel}</span>
          </p>
        ) : null}
        {summary ? (
          <PortfolioFaceBio
            accountId={accountId}
            text={summary}
            forceAbout={showAbout}
          />
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
