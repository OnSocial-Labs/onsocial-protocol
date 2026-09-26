'use client';

import { Fragment, type ReactNode } from 'react';
import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import {
  PortfolioBookMark,
  usePortfolioBookMark,
} from '@/components/portfolio/portfolio-book-mark';
import {
  PortfolioSongMarkButton,
  usePortfolioSongMark,
} from '@/components/portfolio/portfolio-song-mark';
import {
  PortfolioWritingAnchor,
  useShowPortfolioWritingLink,
} from '@/components/portfolio/portfolio-writing-link';

/** Face depth doors — one quiet line: About · play · book · Writing. */
export function PortfolioDepthLinks({
  accountId,
  showAbout = false,
}: {
  accountId: string;
  showAbout?: boolean;
}) {
  const showWriting = useShowPortfolioWritingLink(accountId);
  const song = usePortfolioSongMark();
  const book = usePortfolioBookMark();
  const slots: Array<{ key: string; node: ReactNode }> = [];

  if (showAbout) {
    slots.push({
      key: 'about',
      node: <PortfolioAboutLink accountId={accountId} />,
    });
  }
  if (song) {
    slots.push({
      key: 'song',
      node: <PortfolioSongMarkButton title={song.title} onPlay={song.play} />,
    });
  }
  if (book) {
    slots.push({
      key: 'book',
      node: <PortfolioBookMark book={book} />,
    });
  }
  if (showWriting) {
    slots.push({
      key: 'writing',
      node: <PortfolioWritingAnchor accountId={accountId} />,
    });
  }

  if (slots.length === 0) return null;

  return (
    <nav className="portfolio-depth-links" aria-label="More">
      {slots.map((slot, index) => (
        <Fragment key={slot.key}>
          {index > 0 ? <DepthSep /> : null}
          {slot.node}
        </Fragment>
      ))}
    </nav>
  );
}

function DepthSep() {
  return (
    <span className="portfolio-depth-sep" aria-hidden>
      ·
    </span>
  );
}
