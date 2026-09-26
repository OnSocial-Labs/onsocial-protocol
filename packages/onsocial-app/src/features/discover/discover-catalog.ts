import {
  dropFacetSuggestionsForMedium,
  inferAudioFormatFromPlayableCount,
  parseAudioFormat,
  parseDropFacets,
  type DropFacetMedium,
} from '@/features/scarces/drop-facets';
import { parseWritingFormat } from '@/features/scarces/drop-writing';
import { isDiscoverTopicDraft } from '@/features/discover/discover-omni-search';
import { scarceRowFormatLabel } from '@/lib/scarce-row-kind';

export const DISCOVER_CATALOG_PREVIEW = 3;

export type DiscoverCatalogSectionId =
  | 'people'
  | 'articles'
  | 'books'
  | 'music'
  | 'events';

/** Plain words on Moving search across kinds. `#` and `$` stay on their tabs. */
export function isDiscoverCatalogQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed || isDiscoverTopicDraft(trimmed)) return false;
  return true;
}

/** Subject or genre id when the word matches that medium’s closed list. */
export function catalogFacetIdForQuery(
  query: string,
  medium: DropFacetMedium
): string | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const suggestions = dropFacetSuggestionsForMedium(medium);
  const exact = suggestions.find(
    (entry) => entry.id === needle || entry.label.toLowerCase() === needle
  );
  if (exact) return exact.id;
  const partial = suggestions.find((entry) =>
    entry.label.toLowerCase().includes(needle)
  );
  return partial?.id ?? null;
}

/** Hasura `_ilike` needle for a facet id stored inside collection `extraJson`. */
export function catalogFacetContainsPattern(facetId: string): string {
  const id = facetId
    .trim()
    .toLowerCase()
    .replace(/[%_\\"]/g, '');
  return `%"${id}"%`;
}

export type CatalogDropMatchRow = {
  title: string | null;
  creatorId: string;
  mediumKind: string | null;
  kind: string | null;
  extraJson: string | null;
};

function readDropExtra(
  extraJson: string | null
): Record<string, unknown> | null {
  const raw = extraJson?.trim();
  if (!raw) return null;
  try {
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function catalogDropFacetIds(row: CatalogDropMatchRow): string[] {
  return parseDropFacets(
    readDropExtra(row.extraJson),
    row.mediumKind || row.kind
  );
}

/** Title, creator, or a closed-list subject/genre on the drop. */
export function catalogDropMatches(
  row: CatalogDropMatchRow,
  query: string,
  facetId: string | null
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  const title = row.title?.toLowerCase() ?? '';
  const creator = row.creatorId.toLowerCase();
  if (title.includes(needle) || creator.includes(needle)) return true;
  if (!facetId) return false;
  return catalogDropFacetIds(row).includes(facetId);
}

function playableCount(extra: Record<string, unknown> | null): number {
  const items = extra?.playable;
  return Array.isArray(items) ? items.length : 0;
}

/** Book, Album, Ticket… plus the creator, for a search row. */
export function catalogDropMeta(row: CatalogDropMatchRow): string {
  const extra = readDropExtra(row.extraJson);
  const format = scarceRowFormatLabel({
    mediumKind: row.mediumKind || row.kind,
    audioFormat:
      parseAudioFormat(extra?.audioFormat) ??
      inferAudioFormatFromPlayableCount(playableCount(extra)),
    writingFormat: parseWritingFormat(extra?.writingFormat),
  });
  return [format, row.creatorId].filter(Boolean).join(' · ');
}

export function visibleCatalogSectionIds(
  counts: Record<DiscoverCatalogSectionId, number>
): DiscoverCatalogSectionId[] {
  const order: DiscoverCatalogSectionId[] = [
    'people',
    'articles',
    'books',
    'music',
    'events',
  ];
  return order.filter((id) => counts[id] > 0);
}
