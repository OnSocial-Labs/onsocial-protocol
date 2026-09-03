'use client';

import { PortfolioIdentityTopics } from '@/components/portfolio/portfolio-identity-topics';
import { PostRichText } from '@/features/home/post-rich-text';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { displayName, portfolioHandleForMood } from '@/lib/profile-display';
import {
  portfolioAboutPrintUrl,
  profileAboutEssayBlocks,
} from '@/lib/profile-bio-face';
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
 * Professional About — a written page, not a bigger face.
 * Masthead + essay for everyone; a real print only when a photo exists.
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
  const essayBlocks = profileAboutEssayBlocks(bio ?? '');
  const printUrl = portfolioAboutPrintUrl(avatarUrl);

  return (
    <article
      className="portfolio-about"
      data-profile-kind={displayKind}
      data-has-print={printUrl ? 'true' : 'false'}
      data-testid="portfolio-about-panel"
    >
      <header className="portfolio-about-masthead">
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
      {printUrl || essayBlocks.length > 0 ? (
        <div className="portfolio-about-stage">
          {printUrl ? (
            <figure className="portfolio-about-print">
              <img
                alt={titleLabel}
                className="portfolio-about-shot"
                src={printUrl}
              />
            </figure>
          ) : null}
          {essayBlocks.length > 0 ? (
            <div className="portfolio-about-essay">
              {essayBlocks.map((block, index) => (
                <p
                  key={`${index}-${block.slice(0, 24)}`}
                  className="portfolio-about-bio"
                >
                  <PostRichText text={block} emptyFallback="" showLinkIcon />
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
