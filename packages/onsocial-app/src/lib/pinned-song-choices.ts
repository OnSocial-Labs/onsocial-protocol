import { isAudioMediumKind } from '@/features/market/market-medium';

export interface PinnedSongCatalogView {
  collectionId: string;
  title: string;
  kind: string | null;
  playables: readonly unknown[];
  creatorId?: string | null;
  writingFormat?: 'book' | 'issue' | null;
  readables?: readonly unknown[];
  writingManifestCid?: string | null;
  bookPdf?: unknown | null;
}

export type PinnedSongSource = 'released' | 'collected';

export interface PinnedSongChoice {
  id: string;
  title: string;
  source: PinnedSongSource;
  creatorId: string | null;
}

const DEFAULT_PAGE_SIZE = 80;
const DEFAULT_MAX = 2000;

/** Vault row → drop id. Token ids look like `collection:seat`. */
export function heldCollectionId(row: {
  collectionId?: string | null;
  tokenId?: string | null;
}): string | null {
  const direct = row.collectionId?.trim();
  if (direct) return direct;
  const tokenId = row.tokenId?.trim() ?? '';
  if (!tokenId || tokenId.startsWith('s:')) return null;
  const colon = tokenId.lastIndexOf(':');
  if (colon <= 0) return null;
  return tokenId.slice(0, colon).trim() || null;
}

export function pinnedSongChoicesFromViews(
  views: readonly PinnedSongCatalogView[],
  source: PinnedSongSource = 'released'
): PinnedSongChoice[] {
  const seen = new Set<string>();
  const choices: PinnedSongChoice[] = [];
  for (const view of views) {
    const id = view.collectionId.trim();
    if (!id || seen.has(id)) continue;
    if (!isAudioMediumKind(view.kind) || view.playables.length === 0) continue;
    seen.add(id);
    choices.push({
      id,
      title: view.title,
      source,
      creatorId: view.creatorId?.trim() || null,
    });
  }
  return choices;
}

/** Released albums stay first. A held copy of the same drop is one row. */
export function mergePinnedSongChoices<T extends PinnedSongChoice>(
  released: readonly T[],
  collected: readonly T[]
): T[] {
  const seen = new Set<string>();
  const choices: T[] = [];
  for (const choice of released) {
    if (!choice.id || seen.has(choice.id)) continue;
    seen.add(choice.id);
    choices.push({ ...choice, source: 'released' });
  }
  for (const choice of collected) {
    if (!choice.id || seen.has(choice.id)) continue;
    seen.add(choice.id);
    choices.push({ ...choice, source: 'collected' });
  }
  return choices;
}

/** Title or artist. The current pin stays visible while the query is active. */
export function filterPinnedSongChoices<T extends PinnedSongChoice>(
  choices: readonly T[],
  query: string,
  pinnedId: string | null
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...choices];
  return choices.filter((choice) => {
    if (pinnedId && choice.id === pinnedId) return true;
    if (choice.title.toLowerCase().includes(needle)) return true;
    return choice.creatorId?.toLowerCase().includes(needle) ?? false;
  });
}

/**
 * Collection ids from a vault, newest tokens first.
 * Several copies of one album become one id. A later page failure keeps the ids already read.
 */
export async function loadHeldCollectionIds(
  fetchPage: (
    offset: number,
    limit: number
  ) => Promise<{
    ids: readonly (string | null | undefined)[];
    fetched: number;
  }>,
  opts: { pageSize?: number; max?: number } = {}
): Promise<string[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const max = opts.max ?? DEFAULT_MAX;
  const ids: string[] = [];
  const seen = new Set<string>();
  let offset = 0;

  while (offset < max) {
    let page: { ids: readonly (string | null | undefined)[]; fetched: number };
    try {
      page = await fetchPage(offset, pageSize);
    } catch {
      break;
    }
    for (const raw of page.ids) {
      const id = raw?.trim() ?? '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (page.fetched < pageSize) break;
    offset += pageSize;
  }

  return ids;
}

/** Walk every creator catalog page so an older album can still be pinned. */
export async function loadPinnedSongChoices(
  fetchPage: (
    offset: number,
    limit: number
  ) => Promise<{
    views: readonly PinnedSongCatalogView[];
    fetched: number;
  }>,
  opts: { pageSize?: number; max?: number } = {}
): Promise<PinnedSongChoice[]> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const max = opts.max ?? DEFAULT_MAX;
  const choices: PinnedSongChoice[] = [];
  const seen = new Set<string>();
  let offset = 0;

  while (offset < max) {
    const page = await fetchPage(offset, pageSize);
    for (const choice of pinnedSongChoicesFromViews(page.views)) {
      if (seen.has(choice.id)) continue;
      seen.add(choice.id);
      choices.push(choice);
    }
    if (page.fetched < pageSize) break;
    offset += pageSize;
  }

  return choices;
}
