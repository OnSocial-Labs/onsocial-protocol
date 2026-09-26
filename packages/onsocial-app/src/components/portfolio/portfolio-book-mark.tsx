'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { BookTextFillIcon } from '@onsocial/ui';
import {
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { collectionPath } from '@/lib/app-routes';
import { accountIdsEqual } from '@/lib/account-match';
import { pinnedBookMarkFormat } from '@/lib/pinned-book-choices';
import { accountHoldsCollection } from '@/lib/pinned-song-catalog';
import { portfolioSongPinEligible } from '@/lib/portfolio-song-mark';

const PortfolioBookMarkContext = createContext<{
  collectionId: string | null;
  pageAccountId: string;
}>({ collectionId: null, pageAccountId: '' });

export function PortfolioBookMarkProvider({
  collectionId,
  pageAccountId,
  children,
}: {
  collectionId: string | null;
  pageAccountId: string;
  children: ReactNode;
}) {
  return (
    <PortfolioBookMarkContext.Provider value={{ collectionId, pageAccountId }}>
      {children}
    </PortfolioBookMarkContext.Provider>
  );
}

/** Reader link for the About · Writing line. Independent of the song dock. */
export function usePortfolioBookMark(): { title: string; href: string } | null {
  const { collectionId, pageAccountId } = useContext(PortfolioBookMarkContext);
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
  if (!pinnedBookMarkFormat(view)) return null;
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

  return {
    title: view.title,
    href: collectionPath(view.collectionId, { read: true }),
  };
}

export function PortfolioBookMarkLink({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="portfolio-book-mark"
      aria-label={`Read ${title}`}
    >
      <BookTextFillIcon className="portfolio-book-mark-icon" aria-hidden />
    </Link>
  );
}
