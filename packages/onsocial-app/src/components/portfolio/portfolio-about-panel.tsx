'use client';

import { PortfolioIdentityTopics } from '@/components/portfolio/portfolio-identity-topics';
import { PostRichText } from '@/features/home/post-rich-text';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { displayName, portfolioHandleForMood } from '@/lib/profile-display';
import { portfolioAboutPrintUrl } from '@/lib/profile-bio-face';
import { profileAboutBlocks } from '@/lib/profile-bio-rich';
import {
  profileAboutPhotoUrls,
  type ProfileAboutPhoto,
} from '@/lib/profile-about-photos';
import { resolveDisplayProfileKind, type ProfileKind } from '@onsocial/sdk';
import type { ResolvedMood } from '@/lib/moods/types';

export type PortfolioAboutPanelProps = {
  accountId: string;
  profileName?: string | null;
  bio?: string | null;
  tags?: string[] | null;
  photos?: ProfileAboutPhoto[] | null;
  avatarUrl?: string | null;
  mood: ResolvedMood;
  isDao?: boolean;
  profileKind?: ProfileKind | null;
};

/**
 * Professional About — a written page, not a bigger face.
 * Masthead + essay for everyone; a real print and up to three photos.
 */
export function PortfolioAboutPanel({
  accountId,
  profileName,
  bio,
  tags = null,
  photos = null,
  avatarUrl,
  mood,
  isDao = false,
  profileKind = null,
}: PortfolioAboutPanelProps) {
  const displayKind = resolveDisplayProfileKind(profileKind, isDao);
  const titleLabel = displayName(accountId, profileName ?? undefined);
  const handleLabel = portfolioHandleForMood(accountId, mood.id);
  const essayBlocks = profileAboutBlocks(bio ?? '');
  const printUrl = portfolioAboutPrintUrl(avatarUrl);
  const gallery = profileAboutPhotoUrls(photos);

  return (
    <article
      className="portfolio-about"
      data-profile-kind={displayKind}
      data-has-print={printUrl ? 'true' : 'false'}
      data-has-photos={gallery.length > 0 ? 'true' : 'false'}
      data-testid="portfolio-about-panel"
    >
      <header className="portfolio-about-masthead">
        <div className="portfolio-about-name-row">
          <h1 className="portfolio-about-name">
            {titleLabel}
            {isDao ? (
              <ProtocolNameTrailing accountId={accountId} isDao />
            ) : null}
          </h1>
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
              {essayBlocks.map((block, index) => {
                if (block.type === 'heading') {
                  return (
                    <h2
                      key={`${index}-${block.text.slice(0, 24)}`}
                      className="portfolio-about-heading"
                    >
                      <PostRichText
                        text={block.text}
                        emptyFallback=""
                        showLinkIcon
                      />
                    </h2>
                  );
                }
                if (block.type === 'list') {
                  return (
                    <ul
                      key={`${index}-${block.items[0]?.slice(0, 24) ?? 'list'}`}
                      className="portfolio-about-list"
                    >
                      {block.items.map((item, itemIndex) => (
                        <li key={`${itemIndex}-${item.slice(0, 24)}`}>
                          <PostRichText
                            text={item}
                            emptyFallback=""
                            showLinkIcon
                          />
                        </li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <p
                    key={`${index}-${block.text.slice(0, 24)}`}
                    className="portfolio-about-bio"
                  >
                    <PostRichText
                      text={block.text}
                      emptyFallback=""
                      showLinkIcon
                    />
                  </p>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      {gallery.length > 0 ? (
        <div
          className="portfolio-about-media"
          data-count={String(gallery.length)}
        >
          {gallery.map((src, index) => (
            <img
              key={`${src}-${index}`}
              alt=""
              className="portfolio-about-media-shot"
              src={src}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
