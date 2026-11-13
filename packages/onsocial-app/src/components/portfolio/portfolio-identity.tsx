'use client';

import { useEffect, useState } from 'react';
import {
  IpfsBlurPreview,
  IpfsImg,
  ipfsImgSrcSet,
  ipfsImgVariantUrl,
} from '@onsocial/ui';
import { PortfolioDaoKindSwitch } from '@/components/portfolio/portfolio-dao-kind-switch';
import { PortfolioIdentityGestures } from '@/components/portfolio/portfolio-identity-gestures';
import { PortfolioDepthLinks } from '@/components/portfolio/portfolio-depth-links';
import { PortfolioFaceBio } from '@/components/portfolio/portfolio-face-bio';
import { PortfolioOffersLine } from '@/components/portfolio/portfolio-offers-line';
import { PortfolioOrgMetaLine } from '@/components/portfolio/portfolio-org-meta-line';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { isProtocolFacePairDao } from '@/lib/portfolio-dao-entity';
import {
  profileKindFaceLabel,
  profileKindShowsCrafts,
  resolveDisplayProfileKind,
  type JobSearchRow,
  type OfferRecord,
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

function portraitKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const cid = /\/ipfs\/([A-Za-z0-9]+)/.exec(url)?.[1];
  return cid ?? url;
}

interface PortfolioIdentityProps {
  accountId: string;
  profileName?: string | null;
  location?: string | null;
  /** User-curated org line next to the building mark. */
  industry?: string | null;
  bio?: string | null;
  /** About essay (`profile/about`) — opens About when set. */
  aboutBio?: string | null;
  /** Full DAO purpose — overflowing face bio opens a hug. */
  fullBio?: string | null;
  /** Quiet About lead (`profile/lead`) — opens About when set. */
  lead?: string | null;
  /** Curated identity topics (`profile/tags`) — person About only. */
  tags?: string[] | null;
  /** About gallery count — opens About even when the face bio is short. */
  photoCount?: number;
  avatarUrl?: string | null;
  mood: ResolvedMood;
  /** DAO org face — square crest + quiet kind chrome. */
  isDao?: boolean;
  /** Optional `profile/kind`. Omit / person is an individual. */
  profileKind?: ProfileKind | null;
  kindLabel?: string | null;
  incomingStandingCount?: number;
  openJobs?: JobSearchRow[];
  /** Standing offers already known with the shell. */
  initialOffers?: OfferRecord[];
  /** First Writing window. Null when that read failed. */
  articlePresence?: boolean | null;
}

export function PortfolioIdentity({
  accountId,
  profileName,
  location,
  industry = null,
  bio,
  aboutBio = null,
  fullBio = null,
  lead = null,
  tags = null,
  photoCount = 0,
  avatarUrl,
  mood: savedMood,
  isDao = false,
  profileKind = null,
  kindLabel = null,
  incomingStandingCount = 0,
  openJobs = [],
  initialOffers = [],
  articlePresence = null,
}: PortfolioIdentityProps) {
  const moodPreview = usePortfolioMoodPreviewOptional();
  const mood = moodPreview?.effectiveMood ?? savedMood;
  const displayKind = resolveDisplayProfileKind(profileKind, isDao);
  const profileKindLabel = profileKindFaceLabel(displayKind);

  const titleLabel = displayName(accountId, profileName ?? undefined);
  const summary = bio?.trim() || '';
  const locationLabel = location?.trim() || null;
  const tagCount = profileKindShowsCrafts(displayKind)
    ? profileIdentityTopics(tags).length
    : 0;
  const showAbout = profileAboutHasMoreThanFace({
    aboutText: aboutBio,
    leadText: lead,
    photoCount,
    tagCount,
  });
  const handleLabel = portfolioHandleForMood(accountId, mood.id);
  const avatarSrcSet = ipfsImgSrcSet(avatarUrl, [128, 384]);
  const avatarBlurPreview = Boolean(ipfsImgVariantUrl(avatarUrl, 128));
  const portrait = portraitKey(avatarUrl);
  const [shownPortrait, setShownPortrait] = useState<string | null>(null);
  const avatarReady = portrait != null && shownPortrait === portrait;
  const markAvatarReady = () => {
    if (portrait && shownPortrait !== portrait) setShownPortrait(portrait);
  };

  useEffect(() => {
    if (!isDao) return;
    rememberDaoStandingTarget(accountId);
  }, [accountId, isDao]);

  return (
    <section
      className="portfolio-identity"
      data-profile-kind={displayKind}
    >
      {avatarUrl ? (
        <span
          className={
            avatarBlurPreview
              ? 'portfolio-avatar has-blur-preview'
              : 'portfolio-avatar'
          }
        >
          {avatarBlurPreview && !avatarReady ? (
            <IpfsBlurPreview src={avatarUrl} />
          ) : null}
          <IpfsImg
            ref={(node) => {
              if (node?.complete && node.naturalWidth > 0) markAvatarReady();
            }}
            alt={titleLabel}
            className={
              avatarReady
                ? 'portfolio-avatar-img is-resolved'
                : 'portfolio-avatar-img'
            }
            src={avatarUrl}
            srcSet={avatarSrcSet}
            sizes={avatarSrcSet ? '104px' : undefined}
            decoding="async"
            onLoad={markAvatarReady}
            onError={markAvatarReady}
          />
        </span>
      ) : (
        <div className="portfolio-avatar portfolio-avatar-fallback">
          {initials(titleLabel)}
        </div>
      )}

      <div className="portfolio-identity-copy">
        {displayKind !== 'org' && isDao && isProtocolFacePairDao(accountId) ? (
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
            initialOffers={initialOffers}
            mood={mood}
          />
        ) : displayKind === 'dao' ? (
          <PortfolioOrgMetaLine
            accountId={accountId}
            orgName={titleLabel}
            industry={industry}
            location={locationLabel}
            showHiring={false}
            showOffers={false}
            emptyIndustryLabel={null}
            kindLine="dao"
          />
        ) : (
          <PortfolioOffersLine
            accountId={accountId}
            profileName={titleLabel}
            mood={mood}
            locationLabel={locationLabel}
            kind="person"
            initialOffers={initialOffers}
          />
        )}
        {summary ? (
          <PortfolioFaceBio
            text={summary}
            fullText={isDao ? fullBio : null}
            title={titleLabel}
            moodId={mood.id}
          />
        ) : null}
        <PortfolioDepthLinks
          accountId={accountId}
          showAbout={showAbout}
          articlePresence={articlePresence}
        />
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
