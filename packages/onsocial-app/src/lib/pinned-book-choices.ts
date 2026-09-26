import {
  mergePinnedSongChoices,
  type PinnedSongCatalogView,
  type PinnedSongChoice,
  type PinnedSongSource,
} from '@/lib/pinned-song-choices';

export type PinnedBookFormat = 'book' | 'issue';

export interface PinnedBookChoice extends PinnedSongChoice {
  format: PinnedBookFormat;
}

function writingKind(kind: string | null | undefined): boolean {
  const key = (kind ?? '').trim().toLowerCase();
  return key === 'writing' || key === 'book';
}

/**
 * Catalog row for a book or issue.
 * A manifesto counts before its chapters load. A listed article does not:
 * it has no folio format, manifesto, or PDF on the catalog row.
 */
export function pinnedBookCatalogFormat(
  view: PinnedSongCatalogView
): PinnedBookFormat | null {
  if (!writingKind(view.kind)) return null;
  const chapters = view.readables?.length ?? 0;
  const manifest = Boolean(view.writingManifestCid?.trim());
  const pdf = view.bookPdf != null;
  if (view.writingFormat === 'issue') {
    return chapters > 0 || pdf || manifest ? 'issue' : null;
  }
  if (view.writingFormat === 'book') {
    return chapters > 0 || pdf || manifest ? 'book' : null;
  }
  if (manifest || pdf || chapters > 1) return 'book';
  return null;
}

/**
 * Mark after the drop is loaded.
 * A listed article gains one chapter from its post and still has no folio format.
 */
export function pinnedBookMarkFormat(
  view: PinnedSongCatalogView
): PinnedBookFormat | null {
  if (!writingKind(view.kind)) return null;
  const chapters = view.readables?.length ?? 0;
  const pdf = view.bookPdf != null;
  if (chapters === 0 && !pdf) return null;
  if (view.writingFormat === 'issue') return 'issue';
  if (
    view.writingFormat === 'book' ||
    Boolean(view.writingManifestCid?.trim()) ||
    pdf
  ) {
    return 'book';
  }
  return null;
}

export function pinnedBookChoicesFromViews(
  views: readonly PinnedSongCatalogView[],
  source: PinnedSongSource = 'released'
): PinnedBookChoice[] {
  const seen = new Set<string>();
  const choices: PinnedBookChoice[] = [];
  for (const view of views) {
    const id = view.collectionId.trim();
    if (!id || seen.has(id)) continue;
    const format = pinnedBookCatalogFormat(view);
    if (!format) continue;
    seen.add(id);
    choices.push({
      id,
      title: view.title,
      source,
      creatorId: view.creatorId?.trim() || null,
      mediaUrl: view.mediaUrl?.trim() || null,
      format,
    });
  }
  return choices;
}

/** Title, artist, or Book / Issue. The current pin stays visible. */
export function filterPinnedBookChoices(
  choices: readonly PinnedBookChoice[],
  query: string,
  pinnedId: string | null
): PinnedBookChoice[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...choices];
  return choices.filter((choice) => {
    if (pinnedId && choice.id === pinnedId) return true;
    if (choice.title.toLowerCase().includes(needle)) return true;
    if (choice.creatorId?.toLowerCase().includes(needle)) return true;
    return choice.format.includes(needle);
  });
}

/** Walk every creator catalog page so an older book or issue can still be pinned. */
export async function loadPinnedBookChoices(
  fetchPage: (
    offset: number,
    limit: number
  ) => Promise<{
    views: readonly PinnedSongCatalogView[];
    fetched: number;
  }>,
  opts: { pageSize?: number; max?: number } = {}
): Promise<PinnedBookChoice[]> {
  const pageSize = opts.pageSize ?? 80;
  const max = opts.max ?? 2000;
  const choices: PinnedBookChoice[] = [];
  const seen = new Set<string>();
  let offset = 0;

  while (offset < max) {
    const page = await fetchPage(offset, pageSize);
    for (const choice of pinnedBookChoicesFromViews(page.views)) {
      if (seen.has(choice.id)) continue;
      seen.add(choice.id);
      choices.push(choice);
    }
    if (page.fetched < pageSize) break;
    offset += pageSize;
  }

  return choices;
}

export function mergePinnedBookChoices(
  released: readonly PinnedBookChoice[],
  collected: readonly PinnedBookChoice[]
): PinnedBookChoice[] {
  return mergePinnedSongChoices(released, collected);
}
