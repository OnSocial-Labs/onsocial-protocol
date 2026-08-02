import { describe, expect, it } from 'vitest';
import {
  comboAttributes,
  comboKey,
  maxCombinations,
  sampleUniqueCombos,
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

  it('fills a fully saturated set via enumeration fallback', () => {
    const layers = [layer('BG', ['a', 'b']), layer('Body', ['x', 'y', 'z'])];
    const combos = sampleUniqueCombos(layers, 6, seededRand());
    expect(combos).toHaveLength(6);
    expect(new Set(combos.map(comboKey)).size).toBe(6);
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
