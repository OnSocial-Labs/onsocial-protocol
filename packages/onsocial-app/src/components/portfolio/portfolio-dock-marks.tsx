'use client';

import {
  PortfolioBookMark,
  usePortfolioBookMark,
} from '@/components/portfolio/portfolio-book-mark';
import {
  PortfolioSongMarkButton,
  usePortfolioSongMark,
} from '@/components/portfolio/portfolio-song-mark';

/** Play and book, on the launcher line, to the right of the pill. */
export function PortfolioDockMarks() {
  const song = usePortfolioSongMark();
  const book = usePortfolioBookMark();
  if (!song && !book) return null;

  return (
    <div className="portfolio-dock-marks">
      {song ? (
        <PortfolioSongMarkButton title={song.title} onPlay={song.play} />
      ) : null}
      {book ? <PortfolioBookMark book={book} /> : null}
    </div>
  );
}
