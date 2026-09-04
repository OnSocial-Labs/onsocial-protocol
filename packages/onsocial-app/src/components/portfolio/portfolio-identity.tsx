'use client';

import { useEffect } from 'react';
import { PortfolioDaoKindSwitch } from '@/components/portfolio/portfolio-dao-kind-switch';
import { PortfolioIdentityGestures } from '@/components/portfolio/portfolio-identity-gestures';
import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import { PortfolioFaceBio } from '@/components/portfolio/portfolio-face-bio';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { PortfolioOrgMetaLine } from '@/components/portfolio/portfolio-org-meta-line';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { isProtocolFacePairDao } from '@/lib/portfolio-dao-entity';
import {
  profileKindFaceLabel,
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
import { profileIdentityTopics } from '@/lib/profile-identity-topics';
import type { ResolvedMood } from '@/lib/moods/types';

interface PortfolioIdentityProps {
  accountId: string;
  profileName?: string | null;
  location?: string | null;
  /** User-curated org line next to the building mark. */
  industry?: string | null;
  bio?: string | null;
  /** About continuation (`profile/about`) — opens About when longer than the face. */
  aboutBio?: string | null;
  /** Quiet About lead (`profile/lead`) — opens About when set. */
  lead?: string | null;
  /** Curated identity topics (`profile/tags`) — About / Launch only. */
  tags?: string[] | null;
  /** About gallery count — opens About even when the face bio is short. */
  photoCount?: number;
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
  lead = null,
  tags = null,
  photoCount = 0,
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
  const tagCount = profileIdentityTopics(tags).length;
  const showAbout = profileAboutHasMoreThanFace({
    faceText: summary,
    aboutText: aboutBio,
    leadText: lead,
    photoCount,
    tagCount,
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
        {displayKind === 'org' ? (
          <PortfolioOrgMetaLine
            accountId={accountId}
            orgName={titleLabel}
            industry={industry}
            location={locationLabel}
            initialJobs={openJobs}
          />
        ) : locationLabel ? (
          <p className="portfolio-location">
            <PortfolioLocationMark />
            <span>{locationLabel}</span>
          </p>
        ) : null}
        {summary ? (
          <PortfolioFaceBio
            accountId={accountId}
            text={summary}
            showAbout={showAbout}
          />
        ) : showAbout ? (
          <PortfolioAboutLink accountId={accountId} />
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
