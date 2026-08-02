/**
 * Server-side generative rendering — 10k-scale variation sets.
 *
 * The creator uploads only the trait layer images (a few MB) plus a recipe
 * (layer order, rarity weights, supply). The gateway samples unique weighted
 * combinations, composites each piece natively with sharp, writes the set to
 * a temp directory, and pins art + trait JSON as IPFS directories via a
 * streaming upload — the full set never has to fit in process memory.
 *
 * The sampling logic mirrors the app's client-side generator
 * (`generative-set.ts`) so small in-browser sets and large server sets
 * behave identically.
 */

import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { UploadedFile } from './shared.js';
import {
  ComposeError,
  logger,
  uploadDiskDirectory,
  variationMediaUrl,
} from './shared.js';
import type { VariationSetArchiveResult } from './variation-set.js';

// ---------------------------------------------------------------------------
// Recipe — the creator-supplied generation spec
// ---------------------------------------------------------------------------

export interface GenerativeTraitRecipe {
  /** Trait display name — becomes the attribute `value`. */
  name: string;
  /** Relative rarity weight (>= 0). Higher = more common. */
  weight: number;
  /** Index into the uploaded layer-image files array. */
  image: number;
}

export interface GenerativeLayerRecipe {
  /** Layer display name — becomes the attribute `trait_type`. */
  name: string;
  /** Weight for skipping this layer entirely (0 = always present). */
  noneWeight: number;
  traits: GenerativeTraitRecipe[];
}

export interface GenerativeRecipe {
  supply: number;
  /** Painted in order — first layer is the background. */
  layers: GenerativeLayerRecipe[];
}

export const MAX_GENERATIVE_SUPPLY = 10_000;
const MIN_GENERATIVE_SUPPLY = 2;
const MAX_LAYERS = 12;
const MAX_TRAITS_PER_LAYER = 50;
const MAX_TOTAL_TRAIT_IMAGES = 200;
const MAX_TRAIT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_NAME_LEN = 64;

const LAYER_IMAGE_MIMES = new Set(['image/png', 'image/webp']);

/** One piece: the picked trait index per layer, `-1` = layer skipped. */
type GenCombo = number[];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function parseGenerativeRecipe(raw: unknown): GenerativeRecipe {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ComposeError(400, 'Recipe is not valid JSON');
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ComposeError(400, 'Recipe must be a JSON object');
  }
  const { supply, layers } = parsed as Record<string, unknown>;

  if (
    typeof supply !== 'number' ||
    !Number.isSafeInteger(supply) ||
    supply < MIN_GENERATIVE_SUPPLY ||
    supply > MAX_GENERATIVE_SUPPLY
  ) {
    throw new ComposeError(
      400,
      `Recipe supply must be an integer between ${MIN_GENERATIVE_SUPPLY} and ${MAX_GENERATIVE_SUPPLY}`
    );
  }
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new ComposeError(400, 'Recipe needs at least one layer');
  }
  if (layers.length > MAX_LAYERS) {
    throw new ComposeError(400, `Recipe allows at most ${MAX_LAYERS} layers`);
  }

  const result: GenerativeLayerRecipe[] = [];
  for (const [index, entry] of layers.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      throw new ComposeError(400, `Layer ${index + 1} must be an object`);
    }
    const { name, noneWeight, traits } = entry as Record<string, unknown>;
    if (!Array.isArray(traits) || traits.length === 0) {
      throw new ComposeError(
        400,
        `Layer ${index + 1} needs at least one trait`
      );
    }
    if (traits.length > MAX_TRAITS_PER_LAYER) {
      throw new ComposeError(
        400,
        `Layer ${index + 1} allows at most ${MAX_TRAITS_PER_LAYER} traits`
      );
    }
    const parsedTraits: GenerativeTraitRecipe[] = traits.map(
      (trait, traitIndex) => {
        if (typeof trait !== 'object' || trait === null) {
          throw new ComposeError(
            400,
            `Layer ${index + 1} trait ${traitIndex + 1} must be an object`
          );
        }
        const t = trait as Record<string, unknown>;
        const weight = typeof t.weight === 'number' ? t.weight : NaN;
        const image = typeof t.image === 'number' ? t.image : NaN;
        if (!Number.isFinite(weight) || weight < 0) {
          throw new ComposeError(
            400,
            `Layer ${index + 1} trait ${traitIndex + 1} has an invalid weight`
          );
        }
        if (!Number.isSafeInteger(image) || image < 0) {
          throw new ComposeError(
            400,
            `Layer ${index + 1} trait ${traitIndex + 1} has an invalid image index`
          );
        }
        return {
          name:
            typeof t.name === 'string' && t.name.trim()
              ? t.name.trim().slice(0, MAX_NAME_LEN)
              : `Trait ${traitIndex + 1}`,
          weight,
          image,
        };
      }
    );

    const none =
      typeof noneWeight === 'number' && Number.isFinite(noneWeight)
        ? Math.max(0, noneWeight)
        : 0;
    const traitWeight = parsedTraits.reduce(
      (sum, trait) => sum + trait.weight,
      0
    );
    if (traitWeight + none <= 0) {
      throw new ComposeError(
        400,
        `Layer ${index + 1} needs at least one trait with a positive weight`
      );
    }

    result.push({
      name:
        typeof name === 'string' && name.trim()
          ? name.trim().slice(0, MAX_NAME_LEN)
          : `Layer ${index + 1}`,
      noneWeight: none,
      traits: parsedTraits,
    });
  }

  const recipe: GenerativeRecipe = { supply, layers: result };
  const possible = maxCombinations(recipe.layers);
  if (supply > possible) {
    throw new ComposeError(
      400,
      `Only ${possible} unique combinations are possible with these layers — add traits or lower the supply below ${supply}`
    );
  }
  return recipe;
}

/** Validate the uploaded layer images against the recipe's image indexes. */
export function validateLayerImages(
  recipe: GenerativeRecipe,
  images: UploadedFile[]
): void {
  if (images.length === 0) {
    throw new ComposeError(400, 'Missing layer images');
  }
  if (images.length > MAX_TOTAL_TRAIT_IMAGES) {
    throw new ComposeError(
      400,
      `At most ${MAX_TOTAL_TRAIT_IMAGES} layer images per set`
    );
  }
  for (const [index, image] of images.entries()) {
    if (!LAYER_IMAGE_MIMES.has(image.mimetype.toLowerCase())) {
      throw new ComposeError(
        400,
        `Layer image ${index + 1} must be PNG or WebP (transparency is what stacks)`
      );
    }
    if (image.size > MAX_TRAIT_IMAGE_BYTES) {
      throw new ComposeError(400, `Layer image ${index + 1} exceeds 10 MB`);
    }
  }
  for (const layer of recipe.layers) {
    for (const trait of layer.traits) {
      if (trait.image >= images.length) {
        throw new ComposeError(
          400,
          `Trait "${trait.name}" references image ${trait.image} but only ${images.length} images were uploaded`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sampling — mirrors the app's client-side generator
// ---------------------------------------------------------------------------

export function maxCombinations(layers: GenerativeLayerRecipe[]): number {
  let total = 1;
  for (const layer of layers) {
    total *= layer.traits.length + (layer.noneWeight > 0 ? 1 : 0);
    if (total > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return total;
}

const MAX_ENUMERABLE_COMBOS = 500_000;

function drawTrait(layer: GenerativeLayerRecipe, rand: () => number): number {
  const total =
    layer.noneWeight +
    layer.traits.reduce((sum, trait) => sum + trait.weight, 0);
  let roll = rand() * total;
  if (layer.noneWeight > 0) {
    roll -= layer.noneWeight;
    if (roll < 0) return -1;
  }
  for (let index = 0; index < layer.traits.length; index += 1) {
    roll -= layer.traits[index].weight;
    if (roll < 0) return index;
  }
  return layer.traits.length - 1;
}

function* enumerateCombos(
  layers: GenerativeLayerRecipe[]
): Generator<GenCombo> {
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

function cryptoRand(): number {
  // 48 random bits → uniform float in [0, 1).
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

/**
 * Draw `count` unique weighted combos: rejection sampling first (preserves
 * rarity weights), exhaustive enumeration as a fallback for nearly
 * saturated sets.
 */
export function sampleUniqueCombos(
  layers: GenerativeLayerRecipe[],
  count: number,
  rand: () => number = cryptoRand
): GenCombo[] {
  const seen = new Set<string>();
  const combos: GenCombo[] = [];
  const maxAttempts = count * 100 + 1_000;

  for (
    let attempt = 0;
    attempt < maxAttempts && combos.length < count;
    attempt += 1
  ) {
    const combo = layers.map((layer) => drawTrait(layer, rand));
    const key = combo.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    combos.push(combo);
  }

  if (combos.length < count) {
    if (maxCombinations(layers) > MAX_ENUMERABLE_COMBOS) {
      throw new ComposeError(
        400,
        'The rarity weights are too skewed to fill this supply with unique pieces — flatten the weights or lower the supply'
      );
    }
    for (const combo of enumerateCombos(layers)) {
      if (combos.length >= count) break;
      const key = combo.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(combo);
    }
  }

  return combos;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderProgress {
  done: number;
  total: number;
}

export interface RenderGenerativeSetOptions {
  recipe: GenerativeRecipe;
  images: UploadedFile[];
  /** Temp directory the pieces are written to (caller owns cleanup). */
  tmpDir: string;
  onProgress?: (progress: RenderProgress) => void;
}

/**
 * Render and pin a full generative set. Composites each sampled combo with
 * sharp, writes `1.png … N.png` and `1.json … N.json` to `tmpDir`, then
 * pins art and traits as two streamed IPFS directory uploads.
 */
export async function renderGenerativeSet({
  recipe,
  images,
  tmpDir,
  onProgress,
}: RenderGenerativeSetOptions): Promise<VariationSetArchiveResult> {
  // All layer images must share one canvas size — pro sets are pre-aligned,
  // and silent scaling would hide export mistakes.
  const dims = await Promise.all(
    images.map(async (image, index) => {
      const meta = await sharp(image.buffer).metadata();
      if (!meta.width || !meta.height) {
        throw new ComposeError(
          400,
          `Layer image ${index + 1} is not decodable`
        );
      }
      return { width: meta.width, height: meta.height };
    })
  );
  const { width, height } = dims[0];
  const mismatch = dims.findIndex(
    (dim) => dim.width !== width || dim.height !== height
  );
  if (mismatch > 0) {
    throw new ComposeError(
      400,
      `All layer images must share one size — image ${mismatch + 1} is ${dims[mismatch].width}×${dims[mismatch].height}, expected ${width}×${height}`
    );
  }

  const combos = sampleUniqueCombos(recipe.layers, recipe.supply);
  const total = combos.length;

  for (let index = 0; index < combos.length; index += 1) {
    const combo = combos[index];
    const overlays = combo.flatMap((traitIndex, layerIndex) =>
      traitIndex < 0
        ? []
        : [
            {
              input:
                images[recipe.layers[layerIndex].traits[traitIndex].image]
                  .buffer,
            },
          ]
    );

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(overlays)
      .png()
      .toFile(join(tmpDir, `${index + 1}.png`));

    const attributes = combo.flatMap((traitIndex, layerIndex) =>
      traitIndex < 0
        ? []
        : [
            {
              trait_type: recipe.layers[layerIndex].name,
              value: recipe.layers[layerIndex].traits[traitIndex].name,
            },
          ]
    );
    await writeFile(
      join(tmpDir, `${index + 1}.json`),
      JSON.stringify({ attributes })
    );

    onProgress?.({ done: index + 1, total });
  }

  const artCid = await uploadDiskDirectory(
    combos.map((_, index) => ({
      path: join(tmpDir, `${index + 1}.png`),
      filename: `${index + 1}.png`,
      mime: 'image/png',
    }))
  );
  const traitsCid = await uploadDiskDirectory(
    combos.map((_, index) => ({
      path: join(tmpDir, `${index + 1}.json`),
      filename: `${index + 1}.json`,
      mime: 'application/json',
    }))
  );

  logger.info(
    { artCid, traitsCid, count: total, width, height },
    'Generative set rendered and pinned'
  );

  return {
    variations: {
      cid: artCid,
      count: total,
      ext: 'png',
      urlTemplate: variationMediaUrl(artCid, 'png'),
    },
    reference: {
      cid: traitsCid,
      count: total,
      ext: 'json',
      urlTemplate: variationMediaUrl(traitsCid, 'json'),
    },
  };
}
