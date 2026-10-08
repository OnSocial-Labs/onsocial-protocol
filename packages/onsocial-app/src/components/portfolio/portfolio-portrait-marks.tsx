'use client';

import {
  PortfolioBookMark,
  usePortfolioBookMark,
} from '@/components/portfolio/portfolio-book-mark';
import {
  PortfolioSongMarkButton,
  usePortfolioSongMark,
} from '@/components/portfolio/portfolio-song-mark';

/** Play and book, seated on the bottom rim of the portrait. */
export function PortfolioPortraitMarks() {
  const song = usePortfolioSongMark();
  const book = usePortfolioBookMark();
  if (!song && !book) return null;

  return (
    <div className="portfolio-portrait-marks">
      {song ? (
        <PortfolioSongMarkButton title={song.title} onPlay={song.play} />
      ) : null}
      {book ? <PortfolioBookMark book={book} /> : null}
    </div>
  );
}
