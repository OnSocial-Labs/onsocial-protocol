'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Divider } from '@onsocial/ui';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import { PortfolioAboutWorkLink } from '@/components/portfolio/portfolio-about-link';
import { PortfolioIdentityTopics } from '@/components/portfolio/portfolio-identity-topics';
import { displayName } from '@/lib/profile-display';
import {
  resolvePortfolioAboutCopy,
  resolvePortfolioAboutFilmLead,
  resolvePortfolioAboutStills,
  shouldShowPortfolioAboutFaceLede,
  shouldShowPortfolioAboutName,
  shouldShowPortfolioAboutWork,
  type PortfolioAboutStill,
} from '@/lib/portfolio-about-layout';
import type { ProfileAboutPhoto } from '@/lib/profile-about-photos';
import { profileIdentityTopics } from '@/lib/profile-identity-topics';
import {
  normalizeProfileAboutAlign,
  resolveDisplayProfileKind,
  type ProfileAboutAlign,
  type ProfileKind,
} from '@onsocial/sdk';
import type { PostMediaItem } from '@/lib/post-media';

const FeedPhotoEnlargeScreen = dynamic(
  () =>
    import('@/features/home/feed-photo-enlarge-screen').then(
      (mod) => mod.FeedPhotoEnlargeScreen
    ),
  { ssr: false }
);

export type PortfolioAboutPanelProps = {
  accountId: string;
  profileName?: string | null;
  /** Page / face bio — soft lede only when About would otherwise have no words. */
  bio?: string | null;
  /** More for About — under the film. */
  about?: string | null;
  /** Centered line above the film (`profile/lead`, max 120). */
  lead?: string | null;
  /** More for About essay alignment (`profile/aboutAlign`). */
  aboutAlign?: ProfileAboutAlign | null;
  tags?: string[] | null;
  photos?: ProfileAboutPhoto[] | null;
  isDao?: boolean;
  profileKind?: ProfileKind | null;
};

/**
 * About studio — print | name → crafts; lead; film; More for About.
 * Overlay and hard `/about` share this panel.
 * Lead is its own field, centered above the 2nd–3rd stills.
 */
export function PortfolioAboutPanel({
  accountId,
  profileName,
  bio,
  about = null,
  lead = null,
  aboutAlign = null,
  tags = null,
  photos = null,
  isDao = false,
  profileKind = null,
}: PortfolioAboutPanelProps) {
  const displayKind = resolveDisplayProfileKind(profileKind, isDao);
  const essayAlign = normalizeProfileAboutAlign(aboutAlign);
  const titleLabel = displayName(accountId, profileName ?? undefined);
  const hasCrafts = profileIdentityTopics(tags).length > 0;
  const { intro, rest } = useMemo(
    () => resolvePortfolioAboutCopy({ bio, about }),
    [about, bio]
  );
  const { print, film, viewer } = useMemo(
    () =>
      resolvePortfolioAboutStills({
        titleLabel,
        photos,
      }),
    [titleLabel, photos]
  );
  const filmLead = useMemo(
    () =>
      resolvePortfolioAboutFilmLead({
        lead,
        filmCount: film.length,
      }),
    [film.length, lead]
  );
  const showFaceLede = shouldShowPortfolioAboutFaceLede({
    hasContinuation: rest.length > 0,
    stillCount: viewer.length,
  });
  const showIntro = showFaceLede && intro.length > 0;
  const showName = shouldShowPortfolioAboutName();
  const showMasthead = showName || hasCrafts;
  const showType = showMasthead || showIntro;
  const hasEssay = showIntro || rest.length > 0 || Boolean(filmLead);
  const showWork = shouldShowPortfolioAboutWork({
    hasEssay,
    stillCount: viewer.length,
  });
  const viewerPhotos = useMemo(
    () => viewer.map(stillToPostMedia),
    [viewer]
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const openStill = useCallback((index: number) => {
    setViewerIndex(index);
  }, []);

  return (
    <article
      className="portfolio-about"
      data-profile-kind={displayKind}
      data-has-print={print ? 'true' : 'false'}
      data-has-type={showType ? 'true' : 'false'}
      data-has-film={film.length > 0 ? 'true' : 'false'}
      data-has-essay={hasEssay ? 'true' : 'false'}
      data-has-lede={showIntro ? 'true' : 'false'}
      data-has-film-lead={filmLead ? 'true' : 'false'}
      data-testid="portfolio-about-panel"
    >
      {print || showType ? (
        <div className="portfolio-about-spread">
          {print ? (
            <AboutPrintStill still={print} onOpen={() => openStill(0)} />
          ) : null}

          {showType ? (
            <div className="portfolio-about-type">
              {showMasthead ? (
                <header className="portfolio-about-masthead">
                  {showName ? (
                    <h1 className="portfolio-about-name">{titleLabel}</h1>
                  ) : null}
                  {showName && hasCrafts ? (
                    <Divider
                      variant="detail"
                      className="portfolio-about-masthead-rule"
                    />
                  ) : null}
                  <PortfolioIdentityTopics tags={tags} />
                </header>
              ) : null}
              {showIntro ? (
                <div className="portfolio-about-essay portfolio-about-lede">
                  <PortfolioBioBlocks blocks={intro} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {filmLead ? (
        <div className="portfolio-about-film-lead">
          <PortfolioBioBlocks text={filmLead} headingAs="p" />
        </div>
      ) : null}

      {film.length > 0 ? (
        <ul
          className="portfolio-about-film"
          data-count={String(film.length)}
        >
          {film.map((still, index) => (
            <li key={`${still.url}-${index}`}>
              <AboutFilmStill
                still={still}
                onOpen={() => openStill(index + 1)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {rest.length > 0 ? (
        <div
          className="portfolio-about-essay portfolio-about-rest"
          data-about-align={essayAlign}
        >
          <PortfolioBioBlocks blocks={rest} />
        </div>
      ) : null}

      {showWork ? (
        <footer className="portfolio-about-closer">
          <PortfolioAboutWorkLink accountId={accountId} />
        </footer>
      ) : null}

      {viewerPhotos.length > 0 ? (
        <FeedPhotoEnlargeScreen
          open={viewerIndex != null}
          onOpenChange={(open) => {
            if (!open) setViewerIndex(null);
          }}
          title={viewer[viewerIndex ?? 0]?.alt ?? 'Photo'}
          quiet
          photos={viewerPhotos}
          initialIndex={viewerIndex ?? 0}
        />
      ) : null}
    </article>
  );
}

function stillToPostMedia(still: PortfolioAboutStill): PostMediaItem {
  return { url: still.url, mime: 'image/jpeg', alt: still.alt };
}

function AboutPrintStill({
  still,
  onOpen,
}: {
  still: PortfolioAboutStill;
  onOpen: () => void;
}) {
  const [ready, setReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const reveal = useCallback(() => setReady(true), []);

  useLayoutEffect(() => {
    const node = imgRef.current;
    if (node?.complete) queueMicrotask(() => setReady(true));
  }, [still.url]);

  return (
    <figure className="portfolio-about-print">
      <button
        type="button"
        className="portfolio-about-still-open"
        onClick={onOpen}
        aria-label={`View ${still.alt}`}
      >
        <img
          ref={imgRef}
          alt=""
          className={`portfolio-about-shot${ready ? ' is-in' : ''}`}
          src={still.url}
          onLoad={reveal}
          onError={reveal}
        />
      </button>
    </figure>
  );
}

function AboutFilmStill({
  still,
  onOpen,
}: {
  still: PortfolioAboutStill;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="portfolio-about-still-open portfolio-about-film-open"
      onClick={onOpen}
      aria-label={`View ${still.alt}`}
    >
      <img alt="" className="portfolio-about-film-shot" src={still.url} />
    </button>
  );
}
