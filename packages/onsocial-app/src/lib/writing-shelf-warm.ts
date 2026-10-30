import type { PostRow } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchAuthorArticleWindow } from '@/lib/load-portfolio-writing';

/** Enough titles to fill the opening sheet. The shelf route still pages. */
const WRITING_SHELF_WARM_LIMIT = 12;

type WritingShelfWarmSnapshot = {
  accountId: string | null;
  articles: PostRow[] | null;
};

const SERVER_SNAPSHOT: WritingShelfWarmSnapshot = {
  accountId: null,
  articles: null,
};

let snapshot: WritingShelfWarmSnapshot = SERVER_SNAPSHOT;
let inflightAccountId: string | null = null;
const listeners = new Set<() => void>();

function emit(next: WritingShelfWarmSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeWritingShelfWarm(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWritingShelfWarmSnapshot() {
  return snapshot;
}

export function getWritingShelfWarmServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** One article window for this author, started while the reader is open. */
export function startWritingShelfWarm(accountId: string) {
  const author = accountId.trim();
  if (!author) return;
  if (snapshot.accountId === author && snapshot.articles) return;
  if (inflightAccountId === author) return;
  inflightAccountId = author;
  void (async () => {
    try {
      const os = createReadOnlyOnSocialClient();
      const page = await fetchAuthorArticleWindow(
        os,
        author,
        0,
        WRITING_SHELF_WARM_LIMIT
      );
      if (inflightAccountId !== author) return;
      emit({ accountId: author, articles: page.articles });
    } catch {
      if (inflightAccountId !== author) return;
      emit({ accountId: author, articles: [] });
    } finally {
      if (inflightAccountId === author) inflightAccountId = null;
    }
  })();
}
