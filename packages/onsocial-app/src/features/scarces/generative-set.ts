/**
 * Generative set sampling — pure logic for the in-app art generator.
 *
 * A set is defined by ordered layers (painted bottom-up); each layer holds
 * weighted traits plus an optional weighted "none" (layer skipped). Pieces
 * are unique weighted samples across layers. Compositing and zipping live
 * in the builder component — this module stays DOM-free and unit-testable.
 */

export interface GenTraitInput {
  /** Trait display name — becomes the attribute `value`. */
  name: string;
  /** Relative rarity weight (> 0). Higher = more common. */
  weight: number;
}

export interface GenLayerInput {
  /** Layer display name — becomes the attribute `trait_type`. */
  name: string;
  /** Weight for skipping this layer entirely (0 = layer always present). */
  noneWeight: number;
  traits: GenTraitInput[];
}

/** One piece: the picked trait index per layer, `-1` = layer skipped. */
export type GenCombo = number[];

/** Browser compositing keeps memory bounded — v1 generates up to 1 000. */
export const MAX_GENERATED_PIECES = 1_000;

/**
 * Enumerate + weighted sample without replacement up to this many combos.
 * Near-full sets above this (and ≤ {@link MAX_ENUMERABLE_COMBOS}) still
 * enumerate so leftover seats stay weighted instead of flatten-filled.
 */
const MAX_WEIGHTED_ENUMERATE = 50_000;
/** Hard cap — above this we only rejection-sample, never enumerate. */
const MAX_ENUMERABLE_COMBOS = 200_000;

/** Pinned next to `1.json` in the traits folder — actual sealed-set frequencies. */
export const GENERATIVE_RARITY_FILE = '_rarity.json';

/** OpenSea-style attribute entry written to each piece's trait JSON. */
export interface GenAttribute {
  trait_type: string;
  value: string;
}

export interface GenerativeRarityTrait {
  name: string;
  count: number;
  /** 0–100, one decimal. */
  pct: number;
}

export interface GenerativeRarityLayer {
  name: string;
  traits: GenerativeRarityTrait[];
  none?: GenerativeRarityTrait;
}

/** Actual frequencies in the sealed set — not intended weights. */
export interface GenerativeRarity {
  supply: number;
  layers: GenerativeRarityLayer[];
}

/** Number of distinct combos the layer set can produce. */
export function maxCombinations(layers: GenLayerInput[]): number {
  let total = 1;
  for (const layer of layers) {
    const options = layer.traits.length + (layer.noneWeight > 0 ? 1 : 0);
    total *= options;
    if (total > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return total;
}

/** Stable identity for a combo (uniqueness key). */
export function comboKey(combo: GenCombo): string {
  return combo.join('|');
}

/** PNG IHDR dimensions — used so size mismatches are rejected even if decode fails. */
export function pngSizeFromBytes(
  bytes: Uint8Array
): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

export function assertSameCanvasSize(
  sizes: ReadonlyArray<{ width: number; height: number }>
): { width: number; height: number } {
  if (sizes.length === 0) {
    throw new Error('Add at least one layer image.');
  }
  const { width, height } = sizes[0]!;
  const mismatch = sizes.findIndex(
    (size) => size.width !== width || size.height !== height
  );
  if (mismatch >= 0) {
    const bad = sizes[mismatch]!;
    throw new Error(
      `All layer images must be ${width}×${height} — one file is ${bad.width}×${bad.height}.`
    );
  }
  return { width, height };
}

function assertSamplable(layers: GenLayerInput[]): void {
  if (layers.length === 0) {
    throw new Error('Add at least one layer with trait images.');
  }
  for (const layer of layers) {
    const traitWeight = layer.traits.reduce(
      (sum, trait) => sum + Math.max(0, trait.weight),
      0
    );
    if (traitWeight + Math.max(0, layer.noneWeight) <= 0) {
      throw new Error(
        `Layer "${layer.name}" needs at least one trait with a positive weight.`
      );
    }
  }
}

function comboWeight(layers: GenLayerInput[], combo: GenCombo): number {
  let weight = 1;
  for (let index = 0; index < layers.length; index += 1) {
    const traitIndex = combo[index] ?? -1;
    const layer = layers[index]!;
    weight *=
      traitIndex < 0
        ? Math.max(0, layer.noneWeight)
        : Math.max(0, layer.traits[traitIndex]?.weight ?? 0);
  }
  return weight;
}

/** Weighted draw of one trait index for a layer (`-1` = none). */
function drawTrait(layer: GenLayerInput, rand: () => number): number {
  const noneWeight = Math.max(0, layer.noneWeight);
  const total =
    noneWeight +
    layer.traits.reduce((sum, trait) => sum + Math.max(0, trait.weight), 0);
  let roll = rand() * total;
  if (noneWeight > 0) {
    roll -= noneWeight;
    if (roll < 0) return -1;
  }
  for (let index = 0; index < layer.traits.length; index += 1) {
    roll -= Math.max(0, layer.traits[index]!.weight);
    if (roll < 0) return index;
  }
  return layer.traits.length - 1;
}

/** Mixed-radix enumeration of every combo, in deterministic order. */
function* enumerateCombos(layers: GenLayerInput[]): Generator<GenCombo> {
  const radices = layers.map(
    (layer) => layer.traits.length + (layer.noneWeight > 0 ? 1 : 0)
  );
  const digits = radices.map(() => 0);
  while (true) {
    yield layers.map((layer, i) =>
      layer.noneWeight > 0 ? digits[i]! - 1 : digits[i]!
    );
    let position = layers.length - 1;
    while (position >= 0) {
      digits[position]! += 1;
      if (digits[position]! < radices[position]!) break;
      digits[position] = 0;
      position -= 1;
    }
    if (position < 0) return;
  }
}

function shuffleInPlace<T>(items: T[], rand: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    const tmp = items[index]!;
    items[index] = items[swap]!;
    items[swap] = tmp;
  }
  return items;
}

/**
 * Efraimidis–Spirakis weighted sample without replacement.
 * Each combo is picked in proportion to its layer-weight product.
 */
function weightedSampleWithoutReplacement(
  weighted: Array<{ combo: GenCombo; weight: number }>,
  count: number,
  rand: () => number
): GenCombo[] {
  const keyed = weighted
    .filter((row) => row.weight > 0)
    .map((row) => ({
      combo: row.combo,
      key: Math.pow(rand(), 1 / row.weight),
    }));
  keyed.sort((left, right) => right.key - left.key);
  return keyed.slice(0, count).map((row) => row.combo);
}

function shouldEnumerateWeighted(possible: number, count: number): boolean {
  if (possible <= MAX_WEIGHTED_ENUMERATE) return true;
  return possible <= MAX_ENUMERABLE_COMBOS && count / possible >= 0.5;
}

/**
 * Draw `count` unique combos. Full unique space = every combo once (weights
 * do not change rarity). Partial sets use weighted sampling without
 * replacement when the space is enumerable; otherwise rejection sampling.
 * Never flatten leftover seats in enumerate order.
 */
export function sampleUniqueCombos(
  layers: GenLayerInput[],
  count: number,
  rand: () => number = Math.random
): GenCombo[] {
  assertSamplable(layers);
  if (count < 1) throw new Error('Set supply must be at least 1.');

  const possible = maxCombinations(layers);
  if (count > possible) {
    throw new Error(
      `Only ${possible} unique combinations are possible with these layers — add traits or lower the supply below ${count}.`
    );
  }

  if (count === possible) {
    if (possible > MAX_ENUMERABLE_COMBOS) {
      throw new Error(
        'This full unique set is too large to enumerate — lower the supply.'
      );
    }
    return shuffleInPlace([...enumerateCombos(layers)], rand);
  }

  if (shouldEnumerateWeighted(possible, count)) {
    const weighted = [...enumerateCombos(layers)].map((combo) => ({
      combo,
      weight: comboWeight(layers, combo),
    }));
    return weightedSampleWithoutReplacement(weighted, count, rand);
  }

  const seen = new Set<string>();
  const combos: GenCombo[] = [];
  const maxAttempts = count * 100 + 1_000;
  for (
    let attempt = 0;
    attempt < maxAttempts && combos.length < count;
    attempt += 1
  ) {
    const combo = layers.map((layer) => drawTrait(layer, rand));
    const key = comboKey(combo);
    if (seen.has(key)) continue;
    seen.add(key);
    combos.push(combo);
  }
  if (combos.length < count) {
    throw new Error(
      'The rarity weights are too skewed to fill this supply with unique pieces — flatten the weights or lower the supply.'
    );
  }
  return combos;
}

function pct(count: number, supply: number): number {
  if (supply <= 0) return 0;
  return Math.round((count / supply) * 1000) / 10;
}

/** Count each trait in the sealed set — the honest rarity. */
export function tallyGenerativeRarity(
  layers: GenLayerInput[],
  combos: GenCombo[]
): GenerativeRarity {
  const supply = combos.length;
  return {
    supply,
    layers: layers.map((layer, layerIndex) => {
      const counts = layer.traits.map(() => 0);
      let noneCount = 0;
      for (const combo of combos) {
        const traitIndex = combo[layerIndex] ?? -1;
        if (traitIndex < 0) noneCount += 1;
        else if (traitIndex < counts.length) counts[traitIndex]! += 1;
      }
      const traits: GenerativeRarityTrait[] = layer.traits.map(
        (trait, index) => ({
          name: trait.name,
          count: counts[index]!,
          pct: pct(counts[index]!, supply),
        })
      );
      return {
        name: layer.name,
        traits,
        ...(layer.noneWeight > 0
          ? { none: { name: 'none', count: noneCount, pct: pct(noneCount, supply) } }
          : {}),
      };
    }),
  };
}

export function parseGenerativeRarity(raw: unknown): GenerativeRarity | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as {
    supply?: unknown;
    layers?: unknown;
  };
  if (!Number.isSafeInteger(record.supply) || (record.supply as number) < 1) {
    return null;
  }
  if (!Array.isArray(record.layers) || record.layers.length === 0) return null;
  const layers: GenerativeRarityLayer[] = [];
  for (const layer of record.layers) {
    if (!layer || typeof layer !== 'object') return null;
    const name =
      typeof (layer as { name?: unknown }).name === 'string'
        ? (layer as { name: string }).name.trim()
        : '';
    const rawTraits = (layer as { traits?: unknown }).traits;
    if (!name || !Array.isArray(rawTraits)) return null;
    const traits: GenerativeRarityTrait[] = [];
    for (const trait of rawTraits) {
      if (!trait || typeof trait !== 'object') return null;
      const traitName =
        typeof (trait as { name?: unknown }).name === 'string'
          ? (trait as { name: string }).name.trim()
          : '';
      const count = (trait as { count?: unknown }).count;
      const traitPct = (trait as { pct?: unknown }).pct;
      if (
        !traitName ||
        !Number.isFinite(count) ||
        !Number.isFinite(traitPct)
      ) {
        return null;
      }
      traits.push({
        name: traitName,
        count: Number(count),
        pct: Number(traitPct),
      });
    }
    const rawNone = (layer as { none?: unknown }).none;
    let none: GenerativeRarityTrait | undefined;
    if (rawNone && typeof rawNone === 'object') {
      const noneCount = (rawNone as { count?: unknown }).count;
      const nonePct = (rawNone as { pct?: unknown }).pct;
      if (Number.isFinite(noneCount) && Number.isFinite(nonePct)) {
        none = {
          name: 'none',
          count: Number(noneCount),
          pct: Number(nonePct),
        };
      }
    }
    layers.push({ name, traits, ...(none ? { none } : {}) });
  }
  return { supply: record.supply as number, layers };
}

export function formatGenerativeRarityLines(
  rarity: GenerativeRarity
): string[] {
  return rarity.layers.map((layer) => {
    const parts = layer.traits.map(
      (trait) => `${trait.name} ${formatPct(trait.pct)}`
    );
    if (layer.none && layer.none.count > 0) {
      parts.push(`none ${formatPct(layer.none.pct)}`);
    }
    return `${layer.name}: ${parts.join(' · ')}`;
  });
}

function formatPct(value: number): string {
  if (value >= 10) return `${Math.round(value)}%`;
  const fixed = value.toFixed(1);
  return `${fixed.endsWith('.0') ? Math.round(value) : fixed}%`;
}

/** Attributes for one piece — skipped layers are omitted. */
export function comboAttributes(
  layers: GenLayerInput[],
  combo: GenCombo
): GenAttribute[] {
  const attributes: GenAttribute[] = [];
  combo.forEach((traitIndex, layerIndex) => {
    if (traitIndex < 0) return;
    attributes.push({
      trait_type: layers[layerIndex]!.name,
      value: layers[layerIndex]!.traits[traitIndex]!.name,
    });
  });
  return attributes;
}
