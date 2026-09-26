'use client';

import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import {
  PortfolioSongMarkButton,
  usePortfolioSongMark,
} from '@/components/portfolio/portfolio-song-mark';
import {
  PortfolioWritingAnchor,
  useShowPortfolioWritingLink,
} from '@/components/portfolio/portfolio-writing-link';

/** Face depth doors — one quiet line: About · play · Writing. */
export function PortfolioDepthLinks({
  accountId,
  showAbout = false,
}: {
  accountId: string;
  showAbout?: boolean;
}) {
  const showWriting = useShowPortfolioWritingLink(accountId);
  const song = usePortfolioSongMark();

  if (!showAbout && !showWriting && !song) return null;

  return (
    <nav className="portfolio-depth-links" aria-label="More">
      {showAbout ? <PortfolioAboutLink accountId={accountId} /> : null}
      {showAbout && (song || showWriting) ? <DepthSep /> : null}
      {song ? (
        <PortfolioSongMarkButton title={song.title} onPlay={song.play} />
      ) : null}
      {song && showWriting ? <DepthSep /> : null}
      {showWriting ? <PortfolioWritingAnchor accountId={accountId} /> : null}
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
