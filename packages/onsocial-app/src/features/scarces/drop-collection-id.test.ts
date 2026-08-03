import { describe, expect, it } from 'vitest';
import { buildCollectionId, randomDropIdSuffix } from './drop-collection-id';

describe('buildCollectionId', () => {
  it('joins slug and suffix', () => {
    expect(buildCollectionId('genesis-prints', 'a1b2c3')).toBe(
      'genesis-prints-a1b2c3'
    );
  });
});

describe('randomDropIdSuffix', () => {
  it('returns a lowercase alphanumeric token of the requested length', () => {
    const suffix = randomDropIdSuffix(6);
    expect(suffix).toMatch(/^[0-9a-z]{6}$/);
  });

  it('differs across calls with overwhelming likelihood', () => {
    const a = randomDropIdSuffix(8);
    const b = randomDropIdSuffix(8);
    expect(a).not.toBe(b);
  });
});
