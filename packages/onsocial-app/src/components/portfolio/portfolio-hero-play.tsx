'use client';

import { useEffect, useState } from 'react';
import { PauseFillIcon, PlayFillIcon } from '@onsocial/ui';
import { useCollectiblesNowPlayingOptional } from '@/contexts/collectibles-now-playing-context';
import {
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { isAudioMediumKind } from '@/features/market/market-medium';
import { portfolioHeroPlayAction } from '@/lib/portfolio-hero-play';

export function PortfolioHeroPlay({ collectionId }: { collectionId: string }) {
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const [view, setView] = useState<CollectionView | null>(null);

  useEffect(() => {
    let cancelled = false;
    setView(null);
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

  const same = nowPlaying?.session?.collectionId === view.collectionId;
  const playingThis = Boolean(same && nowPlaying?.playing);
  const action = portfolioHeroPlayAction({
    pinnedId: view.collectionId,
    sessionId: nowPlaying?.session?.collectionId ?? null,
    playing: Boolean(nowPlaying?.playing),
  });

  return (
    <button
      type="button"
      className="portfolio-hero-play"
      aria-label={`${playingThis ? 'Pause' : 'Play'} ${view.title}`}
      onClick={() => {
        if (!nowPlaying) return;
        if (action === 'toggle') {
          void nowPlaying.toggle();
          return;
        }
        nowPlaying.ensureSession({
          collectionId: view.collectionId,
          title: view.title,
          poster: view.mediaUrl,
          tracks: view.playables,
        });
        nowPlaying.setTrack(0, true);
      }}
    >
      {playingThis ? (
        <PauseFillIcon className="portfolio-hero-play-icon" />
      ) : (
        <PlayFillIcon className="portfolio-hero-play-icon" />
      )}
    </button>
  );
}
