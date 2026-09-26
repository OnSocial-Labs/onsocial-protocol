'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { BookTextFillIcon } from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import { accountIdsEqual } from '@/lib/account-match';
import { pinnedBookMarkFormat } from '@/lib/pinned-book-choices';
import { accountHoldsCollection } from '@/lib/pinned-song-catalog';
import { portfolioSongPinEligible } from '@/lib/portfolio-song-mark';
import {
  PortfolioBookSheet,
  type PortfolioBookMarkModel,
} from '@/components/portfolio/portfolio-book-sheet';

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

/** Book or issue on the About · Writing line. Independent of the song dock. */
export function usePortfolioBookMark(): PortfolioBookMarkModel | null {
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
    collectionId: view.collectionId,
    title: view.title,
    cover: view.mediaUrl,
    creatorId: view.creatorId,
    readables: view.readables,
    bookPdf: view.bookPdf,
    writingFormat: view.writingFormat,
    textAlign: view.textAlign ?? null,
  };
}

/** Glyph opens the hug drawer. Read on that drawer opens the reader. */
export function PortfolioBookMark({ book }: { book: PortfolioBookMarkModel }) {
  const { accountId } = useAppWallet();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="portfolio-book-mark"
        aria-label={`Open ${book.title}`}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen(true)}
      >
        <BookTextFillIcon className="portfolio-book-mark-icon" aria-hidden />
      </button>
      <PortfolioBookSheet
        open={sheetOpen}
        book={book}
        onClose={() => setSheetOpen(false)}
        onRead={() => {
          setSheetOpen(false);
          setReaderOpen(true);
        }}
      />
      <WritingReadSheet
        open={readerOpen}
        onClose={() => setReaderOpen(false)}
        title={book.title}
        cover={book.cover}
        collectionId={book.collectionId}
        accountId={accountId}
        creatorId={book.creatorId}
        readables={book.readables}
        bookPdf={book.bookPdf}
        writingFormat={book.writingFormat}
        textAlign={book.textAlign ?? null}
        canRead
        lockedHint=""
      />
    </>
  );
}
