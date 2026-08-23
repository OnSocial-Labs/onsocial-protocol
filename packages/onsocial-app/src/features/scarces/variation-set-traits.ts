import { substituteSeat } from '@/features/scarces/collections-data';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import {
  GENERATIVE_RARITY_FILE,
  parseGenerativeRarity,
  type GenerativeRarity,
} from '@/features/scarces/generative-set';

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

/** `_rarity.json` beside `1.json` in a traits directory. */
export function traitsDirectoryRarityUrl(traitsCid: string): string | null {
  const cid = traitsCid.trim();
  if (!cid) return null;
  return resolveScarceMediaUrl(`ipfs://${cid}/${GENERATIVE_RARITY_FILE}`);
}

async function readRarityJson(url: string | null): Promise<GenerativeRarity | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    return parseGenerativeRarity(await response.json());
  } catch {
    return null;
  }
}

export async function fetchGenerativeRarityFromCid(
  traitsCid: string
): Promise<GenerativeRarity | null> {
  return readRarityJson(traitsDirectoryRarityUrl(traitsCid));
}

/** `{seat_number}.json` → `_rarity.json` in the same traits folder. */
export function traitsReferenceRarityUrl(
  referenceTemplate: string,
  collectionId: string
): string | null {
  const rarityPath = referenceTemplate
    .replace(/\{seat_number\}/g, '_rarity')
    .replace(/\{index\}/g, '_rarity')
    .replace(/\{token_id\}/g, `${collectionId}:_rarity`);
  if (rarityPath === referenceTemplate) return null;
  return resolveScarceMediaUrl(rarityPath);
}

export async function fetchGenerativeRarity(opts: {
  referenceTemplate: string;
  collectionId: string;
}): Promise<GenerativeRarity | null> {
  return readRarityJson(
    traitsReferenceRarityUrl(opts.referenceTemplate, opts.collectionId)
  );
}
