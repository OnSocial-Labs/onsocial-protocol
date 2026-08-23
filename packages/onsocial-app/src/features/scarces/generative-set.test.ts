import { describe, expect, it } from 'vitest';
import {
  assertSameCanvasSize,
  comboAttributes,
  comboKey,
  formatGenerativeRarityLines,
  maxCombinations,
  parseGenerativeRarity,
  sampleUniqueCombos,
  tallyGenerativeRarity,
  type GenLayerInput,
} from './generative-set';

function layer(
  name: string,
  traitNames: string[],
  opts: { noneWeight?: number; weights?: number[] } = {}
): GenLayerInput {
  return {
    name,
    noneWeight: opts.noneWeight ?? 0,
    traits: traitNames.map((traitName, index) => ({
      name: traitName,
      weight: opts.weights?.[index] ?? 1,
    })),
  };
}

/** Deterministic pseudo-random stream for reproducible tests. */
function seededRand(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

describe('maxCombinations', () => {
  it('multiplies trait counts across layers', () => {
    const layers = [layer('BG', ['a', 'b', 'c']), layer('Body', ['x', 'y'])];
    expect(maxCombinations(layers)).toBe(6);
  });

  it('counts an optional layer as one extra option', () => {
    const layers = [
      layer('BG', ['a', 'b']),
      layer('Hat', ['x', 'y'], { noneWeight: 1 }),
    ];
    expect(maxCombinations(layers)).toBe(6);
  });
});

describe('sampleUniqueCombos', () => {
  it('returns the requested number of unique combos', () => {
    const layers = [
      layer('BG', ['red', 'blue', 'green']),
      layer('Body', ['slim', 'round']),
      layer('Hat', ['cap', 'crown'], { noneWeight: 1 }),
    ];
    const combos = sampleUniqueCombos(layers, 12, seededRand());
    expect(combos).toHaveLength(12);
    expect(new Set(combos.map(comboKey)).size).toBe(12);
  });

  it('fills a fully saturated set with every unique combo', () => {
    const layers = [layer('BG', ['a', 'b']), layer('Body', ['x', 'y', 'z'])];
    const combos = sampleUniqueCombos(layers, 6, seededRand());
    expect(combos).toHaveLength(6);
    expect(new Set(combos.map(comboKey)).size).toBe(6);
  });

  it('keeps leftover seats weighted instead of flatten-filling', () => {
    const layers = [
      layer('BG', ['common', 'rare'], { weights: [99, 1] }),
      layer('Hat', ['a', 'b', 'c', 'd', 'e']),
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
    // 5 common + 5 rare combos, take 9: the omitted seat should usually be rare.
    expect(omittedWasRare).toBeGreaterThan(0.7);
  });

  it('rejects a supply beyond the possible combinations', () => {
    const layers = [layer('BG', ['a', 'b'])];
    expect(() => sampleUniqueCombos(layers, 3, seededRand())).toThrow(
      'Only 2 unique combinations'
    );
  });

  it('rejects layers with no positive weight', () => {
    const layers = [layer('BG', ['a'], { weights: [0] })];
    expect(() => sampleUniqueCombos(layers, 1, seededRand())).toThrow(
      'positive weight'
    );
  });

  it('respects rarity weights over a large sample', () => {
    const layers = [
      layer('BG', ['common', 'rare'], { weights: [9, 1] }),
      layer('Serial', Array.from({ length: 400 }, (_, i) => `s${i}`)),
    ];
    const combos = sampleUniqueCombos(layers, 300, seededRand(7));
    const commonCount = combos.filter((combo) => combo[0] === 0).length;
    // 9:1 weighting should keep "common" clearly dominant.
    expect(commonCount).toBeGreaterThan(200);
  });

  it('never emits a skipped layer when noneWeight is zero', () => {
    const layers = [layer('BG', ['a', 'b'], { noneWeight: 0 })];
    const combos = sampleUniqueCombos(layers, 2, seededRand());
    expect(combos.every((combo) => combo[0] >= 0)).toBe(true);
  });
});

describe('assertSameCanvasSize', () => {
  it('accepts matching sizes and rejects a mismatch', () => {
    expect(
      assertSameCanvasSize([
        { width: 512, height: 512 },
        { width: 512, height: 512 },
      ])
    ).toEqual({ width: 512, height: 512 });
    expect(() =>
      assertSameCanvasSize([
        { width: 512, height: 512 },
        { width: 256, height: 512 },
      ])
    ).toThrow('256×512');
  });
});

describe('tallyGenerativeRarity', () => {
  it('counts sealed-set frequencies, including optional none', () => {
    const layers = [
      layer('Background', ['Red', 'Blue']),
      layer('Hat', ['Crown'], { noneWeight: 1 }),
    ];
    const rarity = tallyGenerativeRarity(layers, [
      [0, 0],
      [0, -1],
      [1, -1],
    ]);
    expect(rarity.supply).toBe(3);
    expect(rarity.layers[0]?.traits).toEqual([
      { name: 'Red', count: 2, pct: 66.7 },
      { name: 'Blue', count: 1, pct: 33.3 },
    ]);
    expect(rarity.layers[1]?.none).toEqual({
      name: 'none',
      count: 2,
      pct: 66.7,
    });
    expect(formatGenerativeRarityLines(rarity)[0]).toContain('Red 67%');
    expect(parseGenerativeRarity(rarity)).toEqual(rarity);
    expect(parseGenerativeRarity({ supply: 0, layers: [] })).toBeNull();
  });
});

describe('comboAttributes', () => {
  it('maps layer and trait names, omitting skipped layers', () => {
    const layers = [
      layer('Background', ['Red', 'Blue']),
      layer('Hat', ['Crown'], { noneWeight: 1 }),
    ];
    expect(comboAttributes(layers, [1, -1])).toEqual([
      { trait_type: 'Background', value: 'Blue' },
    ]);
    expect(comboAttributes(layers, [0, 0])).toEqual([
      { trait_type: 'Background', value: 'Red' },
      { trait_type: 'Hat', value: 'Crown' },
    ]);
  });
});
