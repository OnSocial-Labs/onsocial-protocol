import type { PostRow } from '@onsocial/sdk';
import type { CollectionView } from '@/features/scarces/collections-data';
import { collectionPath } from '@/lib/app-routes';

/** Book body for a feed Read. The stack owns the screen, so the card cannot pass a React node. */
export type FeedReadBook = {
  title: string;
  cover: string | null;
  coverSvg: string | null;
  collectionId: string;
  creatorId: string | null;
  sourcePostPath: string | null;
  readables: CollectionView['readables'];
  bookPdf: CollectionView['bookPdf'];
  writingFormat: CollectionView['writingFormat'];
};

/** Snapshot the feed reader paints. `holding` is the shell before the essay resolves. */
export type FeedReadFace = {
  post: PostRow;
  /** Essay whose body is shown. The footer stays on `post`. */
  body: PostRow;
  holding: boolean;
  documentTitle: string | null;
  book: FeedReadBook | null;
};

/** A feed Read stays on the page that opened it. A drop Read uses the collection. */
export function readPlaceHref(input: {
  historyHref: string | null;
  collectionId: string;
}): string {
  const stay = input.historyHref?.trim();
  if (stay) return stay;
  return collectionPath(input.collectionId);
}
