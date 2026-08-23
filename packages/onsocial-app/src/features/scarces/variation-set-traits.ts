import { substituteSeat } from '@/features/scarces/collections-data';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';

const TRAIT_FETCH_LIMIT = 8;

export function variationTraitUrl(
  referenceTemplate: string,
  collectionId: string,
  seat: number
): string | null {
  return resolveScarceMediaUrl(
    substituteSeat(referenceTemplate, collectionId, seat)
  );
}

/** Unique trait_type labels from OpenSea-style attribute docs, first-seen order. */
export function summarizeVariationTraits(docs: unknown[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const attributes = (doc as { attributes?: unknown }).attributes;
    if (!Array.isArray(attributes)) continue;
    for (const item of attributes) {
      if (!item || typeof item !== 'object') continue;
      const label =
        typeof (item as { trait_type?: unknown }).trait_type === 'string'
          ? (item as { trait_type: string }).trait_type.trim()
          : '';
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
      if (labels.length >= TRAIT_FETCH_LIMIT) return labels;
    }
  }
  return labels;
}

export async function fetchVariationTraitLabels(opts: {
  referenceTemplate: string;
  collectionId: string;
  seats: number[];
}): Promise<string[]> {
  const urls = opts.seats
    .slice(0, TRAIT_FETCH_LIMIT)
    .map((seat) =>
      variationTraitUrl(opts.referenceTemplate, opts.collectionId, seat)
    )
    .filter((url): url is string => Boolean(url));
  if (urls.length === 0) return [];

  const docs = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) return null;
        return (await response.json()) as unknown;
      } catch {
        return null;
      }
    })
  );
  return summarizeVariationTraits(docs);
}
