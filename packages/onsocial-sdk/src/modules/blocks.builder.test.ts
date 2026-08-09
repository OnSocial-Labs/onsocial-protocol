import { describe, expect, it } from 'vitest';
import {
  buildBlockRemoveData,
  buildBlockSetData,
} from '../builders/block.js';
import { assertBlockV1, validateBlockV1 } from '../schema/v1.js';

describe('BlockV1', () => {
  it('accepts a valid block payload', () => {
    const b = { v: 1 as const, since: Date.now() };
    expect(validateBlockV1(b)).toBeNull();
    assertBlockV1(b);
  });

  it('rejects missing since', () => {
    expect(validateBlockV1({ v: 1 })).toMatch(/since/);
  });
});

describe('buildBlockSetData / remove', () => {
  it('writes block/<target> with schema version', () => {
    const data = buildBlockSetData('bob.near', 42);
    expect(data).toEqual({
      'block/bob.near': { v: 1, since: 42 },
    });
  });

  it('tombstones with null', () => {
    expect(buildBlockRemoveData('bob.near')).toEqual({
      'block/bob.near': null,
    });
  });
});
