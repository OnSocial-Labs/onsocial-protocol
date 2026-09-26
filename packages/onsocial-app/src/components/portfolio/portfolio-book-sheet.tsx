'use client';

import Link from 'next/link';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
} from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { collectionCreatorNameLine } from '@/features/scarces/collection-creator-face';
import type { CollectionView } from '@/features/scarces/collections-data';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';

export interface PortfolioBookMarkModel {
  collectionId: string;
  title: string;
  cover: string | null;
  creatorId: string;
  readables: CollectionView['readables'];
  bookPdf: CollectionView['bookPdf'];
  writingFormat: CollectionView['writingFormat'];
  textAlign: CollectionView['textAlign'];
}

/** Standard hug drawer: cover, drop byline, Read. */
export function PortfolioBookSheet({
  open,
  book,
  onClose,
  onRead,
}: {
  open: boolean;
  book: PortfolioBookMarkModel;
  onClose: () => void;
  onRead: () => void;
}) {
  const profiles = usePostAuthorProfiles(open ? [book.creatorId] : []);
  const profile = profiles[book.creatorId];
  const name = collectionCreatorNameLine(book.creatorId, profile?.displayName);
  const handle = fallbackLabel(book.creatorId);
  const creatorHref = portfolioPath(book.creatorId);
  const kind = book.writingFormat === 'issue' ? 'Issue' : 'Book';

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      chrome="facts"
      label={kind}
      title={book.title}
      closeAriaLabel={`Close ${book.title}`}
      backdropLabel={`Close ${book.title}`}
      zIndex={SHEET_Z.facts}
      panelClassName="os-sheet-cap-standard"
      bodyClassName="portfolio-book-hug-body"
      footer={
        <OsSheetFooter>
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              onClick={onRead}
            >
              Read
            </OsSheetAction>
          </OsSheetActions>
        </OsSheetFooter>
      }
    >
      <div className="collection-hero">
        <div
          className={`collection-cover is-square${book.cover ? ' has-media' : ''}`}
        >
          {book.cover ? <img src={book.cover} alt="" /> : null}
        </div>
        <div className="collection-meta">
          <Link
            href={creatorHref}
            scroll={false}
            className="collection-meta-avatar-link"
            aria-hidden
            tabIndex={-1}
          >
            <AccountAvatar
              accountId={book.creatorId}
              src={profile?.avatarUrl}
              fallbackInitial={name}
              size="sm"
              className="collection-meta-avatar"
            />
          </Link>
          <div className="collection-meta-copy">
            <Link
              href={creatorHref}
              scroll={false}
              className="collection-meta-creator-name"
            >
              by {name}
            </Link>
            <div className="collection-meta-sub">
              <span className="collection-meta-handle">@{handle}</span>
            </div>
          </div>
        </div>
      </div>
    </OsHugSheet>
  );
}
