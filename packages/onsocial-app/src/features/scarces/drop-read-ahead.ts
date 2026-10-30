import type { PostRow } from '@onsocial/sdk';
import { prefetchPostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { isArticlePost } from '@/lib/article-post-payload';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import {
  resolveDropReadTarget,
  type ScarceReadableMedia,
  type WritingReleaseFormat,
} from '@/features/scarces/drop-writing';

export type DropReadAhead = {
  writingFormat: WritingReleaseFormat | null;
  sourcePostPath: string | null;
  essay: PostRow | null;
  readables: ScarceReadableMedia[];
  bookPdf: ScarceReadableMedia | null;
};

const settled = new Map<string, DropReadAhead>();
const inflight = new Map<string, Promise<DropReadAhead>>();

function emptyAhead(): DropReadAhead {
  return {
    writingFormat: null,
    sourcePostPath: null,
    essay: null,
    readables: [],
    bookPdf: null,
  };
}

/** The essay already loaded for this drop, if the card finished early. */
export function peekDropRead(collectionId: string): DropReadAhead | null {
  const id = collectionId.trim();
  if (!id) return null;
  return settled.get(id) ?? null;
}

/**
 * One writing load per collection. A card on screen and a tap share it.
 * The source essay and its author are in the result, so the tap can open.
 */
export function prefetchDropRead(opts: {
  collectionId: string;
  meta?: {
    writingFormat: WritingReleaseFormat | null;
    sourcePostPath: string | null;
  } | null;
}): Promise<DropReadAhead> {
  const id = opts.collectionId.trim();
  if (!id) return Promise.resolve(emptyAhead());
  const done = settled.get(id);
  if (done) return Promise.resolve(done);
  const pending = inflight.get(id);
  if (pending) return pending;

  const promise = loadDropRead(id, opts.meta ?? null)
    .then((value) => {
      settled.set(id, value);
      return value;
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, promise);
  return promise;
}

async function loadDropRead(
  collectionId: string,
  meta: {
    writingFormat: WritingReleaseFormat | null;
    sourcePostPath: string | null;
  } | null
): Promise<DropReadAhead> {
  let writingFormat = meta?.writingFormat ?? null;
  let sourcePostPath = meta?.sourcePostPath ?? null;
  let readables: ScarceReadableMedia[] = [];
  let bookPdf: ScarceReadableMedia | null = null;

  if (!meta) {
    const view = await fetchCollectionPreferIndexer(collectionId);
    writingFormat = view?.writingFormat ?? null;
    sourcePostPath = view?.sourcePostPath ?? sourcePostPath;
    readables = view?.readables ?? [];
    bookPdf = view?.bookPdf ?? null;
  }

  const target = resolveDropReadTarget({
    articleOnPost: false,
    writingFormat,
    sourcePostPath,
  });
  if (target.kind !== 'source') {
    return { writingFormat, sourcePostPath, essay: null, readables, bookPdf };
  }

  const essay = await fetchPersonalPost({
    author: target.author,
    postId: target.postId,
  });
  const article = essay && isArticlePost(essay) ? essay : null;
  if (article) {
    await prefetchPostAuthorProfiles([article.accountId]);
  }
  return {
    writingFormat,
    sourcePostPath,
    essay: article,
    readables,
    bookPdf,
  };
}
