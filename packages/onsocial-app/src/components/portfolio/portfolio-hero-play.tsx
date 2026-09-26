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
import { portfolioSongMarkVisible } from '@/lib/portfolio-hero-play';

export type PortfolioSongMarkPlacement = 'above' | 'beside';

const PortfolioSongMarkContext = createContext<{
  collectionId: string | null;
  placement: PortfolioSongMarkPlacement;
}>({ collectionId: null, placement: 'beside' });

export function PortfolioSongMarkProvider({
  collectionId,
  placement,
  children,
}: {
  collectionId: string | null;
  placement: PortfolioSongMarkPlacement;
  children: ReactNode;
}) {
  return (
    <PortfolioSongMarkContext.Provider value={{ collectionId, placement }}>
      {children}
    </PortfolioSongMarkContext.Provider>
  );
}

/** Play mark for one slot. Hidden when this release is already the dock's song. */
export function PortfolioSongMark({ slot }: { slot: PortfolioSongMarkPlacement }) {
  const { collectionId, placement } = useContext(PortfolioSongMarkContext);
  if (!collectionId || placement !== slot) return null;
  return (
    <PortfolioSongMarkButton key={collectionId} collectionId={collectionId} />
  );
}

function PortfolioSongMarkButton({ collectionId }: { collectionId: string }) {
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const [view, setView] = useState<CollectionView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCollectionPreferIndexer(collectionId).then((next) => {
      if (!cancelled) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (!view || !isAudioMediumKind(view.kind) || view.playables.length === 0) {
    return null;
  }

  const visible = portfolioSongMarkVisible({
    pinnedId: view.collectionId,
    sessionId: nowPlaying?.session?.collectionId ?? null,
  });
  if (!visible) return null;

  return (
    <button
      type="button"
      className="portfolio-song-mark"
      aria-label={`Play ${view.title}`}
      onClick={() => {
        if (!nowPlaying) return;
        nowPlaying.playSession({
          collectionId: view.collectionId,
          title: view.title,
          poster: view.mediaUrl,
          tracks: view.playables,
        });
      }}
    >
      <span className="portfolio-song-mark-face">
        <PlayFillIcon
          className="portfolio-song-mark-icon portfolio-song-mark-icon--play"
          aria-hidden
        />
      </span>
    </button>
  );
}
