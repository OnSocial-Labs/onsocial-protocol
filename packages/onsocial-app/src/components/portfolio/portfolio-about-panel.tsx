'use client';

import { PortfolioIdentityTopics } from '@/components/portfolio/portfolio-identity-topics';
import { PostRichText } from '@/features/home/post-rich-text';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { displayName, portfolioHandleForMood } from '@/lib/profile-display';
import { resolveDisplayProfileKind, type ProfileKind } from '@onsocial/sdk';
import type { ResolvedMood } from '@/lib/moods/types';

export type PortfolioAboutPanelProps = {
  accountId: string;
  profileName?: string | null;
  bio?: string | null;
  tags?: string[] | null;
  avatarUrl?: string | null;
  mood: ResolvedMood;
  isDao?: boolean;
  profileKind?: ProfileKind | null;
};

/**
 * Lookbook page — same OnSocial name / handle / topics as the face,
 * composed as a print + type, not a banner or a kind-shaped chip.
 */
export function PortfolioAboutPanel({
  accountId,
  profileName,
  bio,
  tags = null,
  avatarUrl,
  mood,
  isDao = false,
  profileKind = null,
}: PortfolioAboutPanelProps) {
  const displayKind = resolveDisplayProfileKind(profileKind, isDao);
  const titleLabel = displayName(accountId, profileName ?? undefined);
  const handleLabel = portfolioHandleForMood(accountId, mood.id);
  const aboutBio = bio?.trim() || '';
  const printUrl = avatarUrl?.trim() || '';

  return (
    <article
      className="portfolio-about"
      data-profile-kind={displayKind}
      data-has-print={printUrl ? 'true' : 'false'}
      data-testid="portfolio-about-panel"
    >
      {printUrl ? (
        <div className="portfolio-about-print">
          <img alt="" className="portfolio-about-shot" src={printUrl} />
        </div>
      ) : null}
      <header className="portfolio-about-identity">
        <div className="portfolio-about-name-row">
          <h1 className="portfolio-about-name">{titleLabel}</h1>
          {isDao ? <ProtocolNameTrailing accountId={accountId} isDao /> : null}
        </div>
        <p className="portfolio-about-handle-row">
          <span
            className={`portfolio-handle${mood.id === 'terminal' ? ' portfolio-handle--terminal' : ''}`}
          >
            {handleLabel}
          </span>
          {!isDao ? (
            <ProtocolNameTrailing accountId={accountId} isDao={false} />
          ) : null}
        </p>
        <PortfolioIdentityTopics tags={tags} />
      </header>
      {aboutBio ? (
        <p className="portfolio-bio portfolio-about-bio">
          <PostRichText text={aboutBio} emptyFallback="" showLinkIcon />
        </p>
      ) : null}
    </article>
  );
}
