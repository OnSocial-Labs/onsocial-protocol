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

/** Above this, exhaustive fallback enumeration is off the table. */
const MAX_ENUMERABLE_COMBOS = 200_000;

/** OpenSea-style attribute entry written to each piece's trait JSON. */
export interface GenAttribute {
  trait_type: string;
  value: string;
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
    roll -= Math.max(0, layer.traits[index].weight);
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
      layer.noneWeight > 0 ? digits[i] - 1 : digits[i]
    );
    let position = layers.length - 1;
    while (position >= 0) {
      digits[position] += 1;
      if (digits[position] < radices[position]) break;
      digits[position] = 0;
      position -= 1;
    }
    if (position < 0) return;
  }
}

/**
 * Draw `count` unique weighted combos. Rejection-samples first (preserves
 * rarity weights), then falls back to exhaustive enumeration when the set
 * is nearly saturated so near-full collections still complete.
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
    if (possible > MAX_ENUMERABLE_COMBOS) {
      throw new Error(
        'The rarity weights are too skewed to fill this supply with unique pieces — flatten the weights or lower the supply.'
      );
    }
    for (const combo of enumerateCombos(layers)) {
      if (combos.length >= count) break;
      const key = comboKey(combo);
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(combo);
    }
  }

  return combos;
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
      trait_type: layers[layerIndex].name,
      value: layers[layerIndex].traits[traitIndex].name,
    });
  });
  return attributes;
}
