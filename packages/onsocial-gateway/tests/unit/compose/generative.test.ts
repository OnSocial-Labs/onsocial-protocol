/**
 * Tests for server-side generative rendering: recipe validation, sampling,
 * sharp compositing, and streamed directory pinning.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { mockUploadDiskDirectory, makeFile } from './helpers.js';
import {
  parseGenerativeRecipe,
  validateLayerImages,
  renderGenerativeSet,
  sampleUniqueCombos,
  ComposeError,
  GENERATIVE_RARITY_FILE,
  type GenerativeRecipe,
} from '../../../src/services/compose/index.js';
import type { UploadedFile } from '../../../src/services/compose/index.js';

async function pngFile(
  color: { r: number; g: number; b: number; alpha: number },
  size = 2
): Promise<UploadedFile> {
  const buffer = await sharp({
    create: { width: size, height: size, channels: 4, background: color },
  })
    .png()
    .toBuffer();
  return makeFile({
    originalname: 'layer.png',
    mimetype: 'image/png',
    buffer,
    size: buffer.length,
  });
}

function recipe(overrides: Partial<GenerativeRecipe> = {}): unknown {
  return {
    supply: 4,
    layers: [
      {
        name: 'Background',
        noneWeight: 0,
        traits: [
          { name: 'Red', weight: 1, image: 0 },
          { name: 'Blue', weight: 1, image: 1 },
        ],
      },
      {
        name: 'Overlay',
        noneWeight: 0,
        traits: [
          { name: 'Green', weight: 1, image: 2 },
          { name: 'Clear', weight: 1, image: 3 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('parseGenerativeRecipe', () => {
  it('accepts a valid recipe (JSON string form) and fills name defaults', () => {
    const parsed = parseGenerativeRecipe(
      JSON.stringify({
        supply: 4,
        layers: [
          {
            noneWeight: 0,
            traits: [
              { weight: 1, image: 0 },
              { weight: 1, image: 1 },
            ],
          },
          {
            name: '  Hat  ',
            noneWeight: 1,
            traits: [{ name: 'Crown', weight: 2, image: 2 }],
          },
        ],
      })
    );

    expect(parsed.supply).toBe(4);
    expect(parsed.layers[0].name).toBe('Layer 1');
    expect(parsed.layers[0].traits[1].name).toBe('Trait 2');
    expect(parsed.layers[1].name).toBe('Hat');
  });

  it('rejects a supply beyond the possible combinations', () => {
    expect(() => parseGenerativeRecipe(recipe({ supply: 5 }))).toThrow(
      'Only 4 unique combinations'
    );
  });

  it('rejects layers with no positive weight', () => {
    expect(() =>
      parseGenerativeRecipe({
        supply: 2,
        layers: [
          { noneWeight: 0, traits: [{ name: 'x', weight: 0, image: 0 }] },
        ],
      })
    ).toThrow('positive weight');
  });

  it('rejects out-of-range supply', () => {
    expect(() => parseGenerativeRecipe(recipe({ supply: 1 }))).toThrow(
      'between 2 and 10000'
    );
    expect(() => parseGenerativeRecipe(recipe({ supply: 10_001 }))).toThrow(
      'between 2 and 10000'
    );
  });

  it('rejects malformed JSON', () => {
    expect(() => parseGenerativeRecipe('{nope')).toThrow('not valid JSON');
  });
});

describe('validateLayerImages', () => {
  it('rejects trait image indexes beyond the uploaded files', async () => {
    const parsed = parseGenerativeRecipe(recipe());
    const files = [await pngFile({ r: 255, g: 0, b: 0, alpha: 1 })];
    expect(() => validateLayerImages(parsed, files)).toThrow(
      'references image'
    );
  });

  it('rejects non-PNG/WebP layers', async () => {
    const parsed = parseGenerativeRecipe(recipe());
    const files = Array.from({ length: 4 }, () =>
      makeFile({ mimetype: 'image/jpeg', buffer: Buffer.from('x'), size: 1 })
    );
    expect(() => validateLayerImages(parsed, files)).toThrow('PNG or WebP');
  });
});

describe('renderGenerativeSet', () => {
  beforeEach(() => vi.clearAllMocks());

  async function fourLayerImages(): Promise<UploadedFile[]> {
    return Promise.all([
      pngFile({ r: 255, g: 0, b: 0, alpha: 1 }),
      pngFile({ r: 0, g: 0, b: 255, alpha: 1 }),
      pngFile({ r: 0, g: 255, b: 0, alpha: 0.5 }),
      pngFile({ r: 0, g: 0, b: 0, alpha: 0 }),
    ]);
  }

  it('renders every piece, writes traits, and pins two directories', async () => {
    mockUploadDiskDirectory
      .mockResolvedValueOnce({ dirHash: 'QmGenArt', entries: [] })
      .mockResolvedValueOnce({ dirHash: 'QmGenTraits', entries: [] });

    const tmp = await mkdtemp(join(tmpdir(), 'gen-test-'));
    try {
      const progress: number[] = [];
      const result = await renderGenerativeSet({
        recipe: parseGenerativeRecipe(recipe()),
        images: await fourLayerImages(),
        tmpDir: tmp,
        onProgress: (p) => progress.push(p.done),
      });

      expect(result.variations.cid).toBe('QmGenArt');
      expect(result.variations.count).toBe(4);
      expect(result.variations.urlTemplate).toBe(
        'https://test-gw.lighthouseweb3.xyz/ipfs/QmGenArt/{seat_number}.png'
      );
      expect(result.reference?.cid).toBe('QmGenTraits');
      expect(progress).toEqual([1, 2, 3, 4]);

      const files = (await readdir(tmp)).sort();
      expect(files).toEqual([
        '1.json',
        '1.png',
        '2.json',
        '2.png',
        '3.json',
        '3.png',
        '4.json',
        '4.png',
        GENERATIVE_RARITY_FILE,
      ]);

      const rarity = JSON.parse(
        await readFile(join(tmp, GENERATIVE_RARITY_FILE), 'utf8')
      ) as { supply: number; layers: Array<{ name: string }> };
      expect(rarity.supply).toBe(4);
      expect(rarity.layers[0].name).toBe('Background');

      // Trait JSON must be OpenSea-style attributes naming both layers.
      const traits = JSON.parse(await readFile(join(tmp, '1.json'), 'utf8'));
      expect(traits.attributes).toHaveLength(2);
      expect(traits.attributes[0].trait_type).toBe('Background');

      // Pieces must be decodable PNGs at the layer canvas size.
      const meta = await sharp(join(tmp, '1.png')).metadata();
      expect(meta.width).toBe(2);
      expect(meta.height).toBe(2);

      // Art is pinned first, traits second — both streamed from disk.
      const artCall = mockUploadDiskDirectory.mock.calls[0][0];
      expect(
        artCall.files.map((f: { filename: string }) => f.filename)
      ).toEqual(['1.png', '2.png', '3.png', '4.png']);
      const traitsCall = mockUploadDiskDirectory.mock.calls[1][0];
      expect(
        traitsCall.files.map((f: { filename: string }) => f.filename)
      ).toEqual([
        '1.json',
        '2.json',
        '3.json',
        '4.json',
        GENERATIVE_RARITY_FILE,
      ]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects layer images with mismatched dimensions', async () => {
    const images = [
      await pngFile({ r: 255, g: 0, b: 0, alpha: 1 }, 2),
      await pngFile({ r: 0, g: 0, b: 255, alpha: 1 }, 3),
      await pngFile({ r: 0, g: 255, b: 0, alpha: 1 }, 2),
      await pngFile({ r: 0, g: 0, b: 0, alpha: 0 }, 2),
    ];

    const tmp = await mkdtemp(join(tmpdir(), 'gen-test-'));
    try {
      await expect(
        renderGenerativeSet({
          recipe: parseGenerativeRecipe(recipe()),
          images,
          tmpDir: tmp,
        })
      ).rejects.toThrow('share one size');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('surfaces ComposeError with status 400 on bad input', async () => {
    try {
      parseGenerativeRecipe('{broken');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ComposeError);
      expect((error as ComposeError).status).toBe(400);
    }
  });
});

function seededRand(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

describe('sampleUniqueCombos', () => {
  it('keeps leftover seats weighted instead of flatten-filling', () => {
    const layers = [
      {
        name: 'BG',
        noneWeight: 0,
        traits: [
          { name: 'common', weight: 99, image: 0 },
          { name: 'rare', weight: 1, image: 1 },
        ],
      },
      {
        name: 'Hat',
        noneWeight: 0,
        traits: ['a', 'b', 'c', 'd', 'e'].map((name, image) => ({
          name,
          weight: 1,
          image,
        })),
      },
    ];
    const omittedRare: number[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const combos = sampleUniqueCombos(layers, 9, seededRand(seed));
      expect(combos).toHaveLength(9);
      const rareCount = combos.filter((combo) => combo[0] === 1).length;
      omittedRare.push(5 - rareCount);
    }
    const omittedWasRare =
      omittedRare.reduce((sum, n) => sum + n, 0) / omittedRare.length;
    expect(omittedWasRare).toBeGreaterThan(0.7);
  });
});
