import { isAudioMediumKind } from '@/features/market/market-medium';

export interface PinnedSongCatalogView {
  collectionId: string;
  title: string;
  kind: string | null;
  playables: readonly unknown[];
}

export interface PinnedSongChoice {
  id: string;
  title: string;
}

const DEFAULT_PAGE_SIZE = 80;
const DEFAULT_MAX = 2000;

export function pinnedSongChoicesFromViews(
  views: readonly PinnedSongCatalogView[]
): PinnedSongChoice[] {
  const seen = new Set<string>();
  const choices: PinnedSongChoice[] = [];
  for (const view of views) {
    const id = view.collectionId.trim();
    if (!id || seen.has(id)) continue;
    if (!isAudioMediumKind(view.kind) || view.playables.length === 0) continue;
    seen.add(id);
    choices.push({ id, title: view.title });
  }
  return choices;
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
