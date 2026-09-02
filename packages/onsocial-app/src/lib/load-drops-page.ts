import {
  DROPS_PAGE_SIZE,
  fetchCreatorLeaders,
  fetchDropsPage,
  type CreatorLeaderRow,
  type DropAudioFormatFilter,
  type DropDiscoveryItem,
  type DropsSort,
} from '@/features/drops/drops-data';
import { parseAudioFormat } from '@/features/scarces/drop-facets';
import {
  dropsPath,
  parseDropsMediumParam,
  parseDropsSortParam,
  type DropsMediumParam,
} from '@/lib/app-routes';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type DropsPageData = {
  items: DropDiscoveryItem[];
  hasMore: boolean;
  creators: CreatorLeaderRow[];
};

/** Parsed Drops URL — SSR seed and client catalog key share this shape. */
export type DropsPageQuery = {
  sort: DropsSort;
  kind: DropsMediumParam;
  audioFormat: DropAudioFormatFilter | null;
};

export const EMPTY_DROPS_PAGE_QUERY: DropsPageQuery = {
  sort: 'live',
  kind: 'all',
  audioFormat: null,
};

export function parseDropsPageQuery(params: {
  sort?: string | null;
  kind?: string | null;
  audioFormat?: string | null;
}): DropsPageQuery {
  const kind = parseDropsMediumParam(params.kind);
  return {
    sort: parseDropsSortParam(params.sort),
    kind,
    audioFormat: kind === 'audio' ? parseAudioFormat(params.audioFormat) : null,
  };
}

/**
 * Catalog cache / fetch key. Shape:
 * `retry|sort|kind|audioFormat|search|viewer`
 */
export function dropsBrowseParamsKey(opts: {
  retryKey?: number;
  sort: DropsSort;
  kind?: DropsMediumParam;
  audioFormat?: DropAudioFormatFilter | string | null;
  search?: string;
  viewer?: string;
}): string {
  return [
    opts.retryKey ?? 0,
    opts.sort,
    opts.kind ?? 'all',
    opts.audioFormat ?? '',
    (opts.search ?? '').toLowerCase(),
    opts.viewer ?? '',
  ].join('|');
}

/** Path for the current Drops query — omits default Live / All. */
export function dropsQueryPath(query: DropsPageQuery): string {
  return dropsPath({
    sort: query.sort,
    kind: query.kind,
    audioFormat: query.audioFormat,
  });
}

export function dropsToolbarFromQuery(query: DropsPageQuery): {
  sort: DropsSort;
  kind: DropsMediumParam;
  audioFormat: DropAudioFormatFilter | null;
} {
  return {
    sort: query.sort,
    kind: query.kind,
    audioFormat: query.audioFormat,
  };
}

export function dropsSeedParamsKey(query: DropsPageQuery): string {
  return dropsBrowseParamsKey({
    sort: query.sort,
    kind: query.kind,
    audioFormat: query.audioFormat,
  });
}

/**
 * First-paint catalog for the current URL (sort / kind / format).
 * Saved needs a viewer wallet — return null so the client reloads.
 * Soft-fail → null so the client can retry.
 */
export async function loadDropsPageData(
  query: DropsPageQuery = EMPTY_DROPS_PAGE_QUERY
): Promise<DropsPageData | null> {
  if (query.sort === 'saved') return null;
  try {
    const client = createServerOnSocialClient();
    const [page, creators] = await Promise.all([
      fetchDropsPage({
        sort: query.sort,
        limit: DROPS_PAGE_SIZE,
        mediumKind: query.kind === 'all' ? null : query.kind,
        audioFormat: query.audioFormat,
        client,
      }),
      query.sort === 'new'
        ? fetchCreatorLeaders({ limit: 8, client })
        : Promise.resolve([] as CreatorLeaderRow[]),
    ]);
    return {
      items: page.items,
      hasMore: page.hasMore,
      creators,
    };
  } catch {
    return null;
  }
}
