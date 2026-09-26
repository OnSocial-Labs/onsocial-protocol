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
import { accountIdsEqual } from '@/lib/account-match';
import { accountHoldsCollection } from '@/lib/pinned-song-catalog';
import {
  portfolioSongMarkVisible,
  portfolioSongPinEligible,
} from '@/lib/portfolio-song-mark';

const PortfolioSongMarkContext = createContext<{
  collectionId: string | null;
  pageAccountId: string;
  songStart: number | null;
}>({ collectionId: null, pageAccountId: '', songStart: null });

export function PortfolioSongMarkProvider({
  collectionId,
  pageAccountId,
  songStart = null,
  children,
}: {
  collectionId: string | null;
  pageAccountId: string;
  songStart?: number | null;
  children: ReactNode;
}) {
  return (
    <PortfolioSongMarkContext.Provider
      value={{ collectionId, pageAccountId, songStart }}
    >
      {children}
    </PortfolioSongMarkContext.Provider>
  );
}

/** Play control for the About · Writing line, or null while the dock owns the song. */
export function usePortfolioSongMark(): {
  title: string;
  play: () => void;
} | null {
  const { collectionId, pageAccountId, songStart } = useContext(
    PortfolioSongMarkContext
  );
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const [view, setView] = useState<CollectionView | null>(null);
  const [hold, setHold] = useState<{
    collectionId: string;
    holds: boolean;
  } | null>(null);

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

  useEffect(() => {
    if (!collectionId || !pageAccountId) return;
    if (!view || view.collectionId !== collectionId) return;
    if (accountIdsEqual(pageAccountId, view.creatorId)) return;
    let cancelled = false;
    void accountHoldsCollection(pageAccountId, collectionId)
      .then((holds) => {
        if (!cancelled) setHold({ collectionId, holds });
      })
      .catch(() => {
        if (!cancelled) setHold({ collectionId, holds: false });
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, pageAccountId, view]);

  if (!collectionId || !view || view.collectionId !== collectionId) return null;
  if (!isAudioMediumKind(view.kind) || view.playables.length === 0) return null;
  const releasedHere = accountIdsEqual(pageAccountId, view.creatorId);
  const heldHere = hold?.collectionId === view.collectionId ? hold.holds : null;
  if (
    !portfolioSongPinEligible({
      pageAccountId,
      creatorId: view.creatorId,
      holdsCopy: releasedHere || heldHere === true,
    })
  ) {
    return null;
  }
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
    ...(songStart != null && songStart > 0 ? { startIndex: songStart } : {}),
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
