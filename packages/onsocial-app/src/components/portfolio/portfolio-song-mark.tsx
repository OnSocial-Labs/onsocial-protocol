'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { PlayFillIcon } from '@onsocial/ui';
import { useCollectiblesNowPlayingOptional } from '@/contexts/collectibles-now-playing-context';
import {
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { isAudioMediumKind } from '@/features/market/market-medium';
import { portfolioSongMarkVisible } from '@/lib/portfolio-song-mark';

const PortfolioSongMarkContext = createContext<string | null>(null);

export function PortfolioSongMarkProvider({
  collectionId,
  children,
}: {
  collectionId: string | null;
  children: ReactNode;
}) {
  return (
    <PortfolioSongMarkContext.Provider value={collectionId}>
      {children}
    </PortfolioSongMarkContext.Provider>
  );
}

/** Play control for the About · Writing line, or null while the dock owns the song. */
export function usePortfolioSongMark(): {
  title: string;
  play: () => void;
} | null {
  const collectionId = useContext(PortfolioSongMarkContext);
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const [view, setView] = useState<CollectionView | null>(null);

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    void fetchCollectionPreferIndexer(collectionId)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch(() => {
        if (!cancelled) setView(null);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (!collectionId || !view || view.collectionId !== collectionId) return null;
  if (!isAudioMediumKind(view.kind) || view.playables.length === 0) return null;
  if (
    !portfolioSongMarkVisible({
      pinnedId: view.collectionId,
      sessionId: nowPlaying?.session?.collectionId ?? null,
    })
  ) {
    return null;
  }
  if (!nowPlaying) return null;

  const session = {
    collectionId: view.collectionId,
    title: view.title,
    poster: view.mediaUrl,
    tracks: view.playables,
  };

  return {
    title: view.title,
    play: () => {
      nowPlaying.playSession(session);
    },
  };
}

export function PortfolioSongMarkButton({
  title,
  onPlay,
}: {
  title: string;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className="portfolio-song-mark"
      aria-label={`Play ${title}`}
      onClick={onPlay}
    >
      <PlayFillIcon
        className="portfolio-song-mark-icon portfolio-song-mark-icon--play"
        aria-hidden
      />
    </button>
  );
}
